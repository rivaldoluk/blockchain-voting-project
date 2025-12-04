// relayer/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { ethers } = require("ethers");

const app = express();

// === SECURITY & MIDDLEWARE ===
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

// Rate limit: max 5 vote per IP per menit (anti spam)
const limiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: "Terlalu banyak percobaan. Coba lagi 1 menit lagi." }
});
app.use("/vote", limiter);

// === ENV VALIDATION ===
const {
  RELAYER_PRIVATE_KEY,
  ALCHEMY_KEY,
  INFURA_PROJECT_ID,
  CONTRACT_ADDRESS,
  RELAYER_PORT = 3001
} = process.env;

if (!RELAYER_PRIVATE_KEY || !CONTRACT_ADDRESS) {
  console.error("ERROR: RELAYER_PRIVATE_KEY & CONTRACT_ADDRESS wajib di .env!");
  process.exit(1);
}

// === PROVIDER & WALLET ===
const RPC_URL = ALCHEMY_KEY
  ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
  : INFURA_PROJECT_ID
  ? `https://sepolia.infura.io/v3/${INFURA_PROJECT_ID}`
  : "https://rpc.sepolia.org";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);

console.log("Relayer Wallet :", relayerWallet.address);
console.log("Contract       :", CONTRACT_ADDRESS);

// === KONTRAK ABI (LENGKAP & SESUAI EIP-712) ===
const ABI = [
  "function voteDenganTandaTangan(address pemilih, uint256 kandidatId, bytes signature) external",
  "function noncePemilih(address) view returns (uint256)",
  "function telahMemilih(address) view returns (bool)",
  "function statusVoting() view returns (string)",
  "function totalKandidat() view returns (uint256)",
  "function getKandidat() view returns (string[])",
  "function getVoteCount(uint256) view returns (uint256)",
  "event SuaraMasuk(address indexed pemilih, uint256 kandidatId)",
  "event PemilihTercatat(address indexed pemilih)"
];

const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, relayerWallet);

// === QUEUE (anti double-submit) ===
const processingQueue = [];
let isProcessing = false;

// === PROSES QUEUE ===
async function processQueue() {
  if (isProcessing || processingQueue.length === 0) return;
  isProcessing = true;

  const { pemilih, kandidatId, signature, res } = processingQueue.shift();

  try {
    // 1. Cek status voting
    const status = await contract.statusVoting();
    if (status !== "Berlangsung") {
      return sendResponse(res, 400, `Voting ${status}`);
    }

    // 2. Cek apakah sudah vote
    const [sudahVote, currentNonce, totalKandidat] = await Promise.all([
      contract.telahMemilih(pemilih),
      contract.noncePemilih(pemilih),
      contract.totalKandidat()
    ]);

    if (sudahVote) {
      return sendResponse(res, 400, "Sudah memilih sebelumnya");
    }
    if (kandidatId >= totalKandidat) {
      return sendResponse(res, 400, "Kandidat tidak valid");
    }

    // 3. Verifikasi EIP-712 signature
    const domain = {
      name: "PilkadesVoting",
      version: "1",
      chainId: (await provider.getNetwork()).chainId,
      verifyingContract: CONTRACT_ADDRESS
    };

    const types = {
      Vote: [
        { name: "pemilih", type: "address" },
        { name: "kandidatId", type: "uint256" },
        { name: "nonce", type: "uint256" }
      ]
    };

    const value = { pemilih, kandidatId, nonce: currentNonce };

    const recovered = ethers.verifyTypedData(domain, types, value, signature);

    if (recovered.toLowerCase() !== pemilih.toLowerCase()) {
      return sendResponse(res, 400, "Signature tidak valid");
    }

    // 4. Kirim transaksi
    const tx = await contract.voteDenganTandaTangan(pemilih, kandidatId, signature, {
      gasLimit: 200000
    });

    console.log(`VOTE DITERIMA → ${pemilih} memilih kandidat ${kandidatId} | Tx: ${tx.hash}`);
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      const kandidatList = await contract.getKandidat();
      console.log(`VOTE SUKSES! ${pemilih} → ${kandidatList[kandidatId]}`);
      sendResponse(res, 200, "Vote berhasil! Terima kasih telah memilih.");
    } else {
      sendResponse(res, 500, "Transaksi gagal di blockchain");
    }

  } catch (err) {
    console.error("VOTE GAGAL:", err.message || err);
    sendResponse(res, 500, "Server error. Coba lagi nanti.");
  } finally {
    isProcessing = false;
    setImmediate(processQueue);
  }
}

function sendResponse(res, status, message) {
  if (!res.headersSent) {
    res.status(status).json({ status, message });
  }
}

// === ROUTE UTAMA: VOTE ===
app.post("/vote", async (req, res) => {
  const { pemilih, kandidatId, signature } = req.body;

  if (!ethers.isAddress(pemilih) || kandidatId === undefined || !signature) {
    return res.status(400).json({ error: "Data tidak lengkap atau invalid" });
  }

  const normalizedAddr = ethers.getAddress(pemilih);

  // Cek double submit
  if (processingQueue.some(item => item.pemilih.toLowerCase() === normalizedAddr.toLowerCase())) {
    return res.status(429).json({ error: "Vote Anda sedang diproses" });
  }

  // Tambah ke queue
  processingQueue.push({ pemilih: normalizedAddr, kandidatId: Number(kandidatId), signature, res });

  // Langsung respons (non-blocking)
  res.status(202).json({ message: "Vote diterima, sedang diproses..." });

  // Mulai proses queue
  processQueue();
});

// === HEALTH CHECK ===
app.get("/", (req, res) => {
  res.json({
    status: "Relayer AKTIF & AMAN",
    contract: CONTRACT_ADDRESS,
    relayer: relayerWallet.address,
    timestamp: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
    message: "Pilkades 2025 — 100% On-Chain, 0% Curang"
  });
});

// === START SERVER ===
app.listen(RELAYER_PORT, "0.0.0.0", () => {
  console.log("════════════════════════════════════════════════".green);
  console.log("   RELAYER PILKADES 2025 — 100% AMAN & AKTIF   ".green.bold);
  console.log("════════════════════════════════════════════════".green);
  console.log(`Port           : ${RELAYER_PORT}`);
  console.log(`Relayer Wallet : ${relayerWallet.address}`);
  console.log(`Contract       : ${CONTRACT_ADDRESS}`);
  console.log(`Network        : Sepolia (Chain ID: ${(async () => (await provider.getNetwork()).chainId)()})`);
  console.log(`Waktu          : ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`);
  console.log("════════════════════════════════════════════════".green);
  console.log("Pemilih 0 ETH → Relayer bayar gas → Suara tidak bisa dipalsu!");
});