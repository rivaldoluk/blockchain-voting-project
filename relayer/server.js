// relayer/server.js — VERSI FINAL PRODUCTION (2026 READY)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { ethers } = require("ethers");

const app = express();

// === AMBIL DARI VERCEL ENV (bukan .env lokal lagi!) ===
const {
  VITE_RELAYER_PRIVATE_KEY,     // ← Ganti jadi ini
  VITE_ALCHEMY_URL,             // ← Ganti jadi ini
  VITE_CONTRACT_ADDRESS,        // ← Ganti jadi ini
  RELAYER_PORT = 3001
} = process.env;

// Validasi wajib
if (!VITE_RELAYER_PRIVATE_KEY || !VITE_CONTRACT_ADDRESS || !VITE_ALCHEMY_URL) {
  console.error("ERROR: Pastikan di Vercel sudah set:");
  console.error("   VITE_RELAYER_PRIVATE_KEY");
  console.error("   VITE_ALCHEMY_URL");
  console.error("   VITE_CONTRACT_ADDRESS");
  process.exit(1);
}

// === PROVIDER & WALLET ===
const provider = new ethers.JsonRpcProvider(VITE_ALCHEMY_URL);
const relayerWallet = new ethers.Wallet(VITE_RELAYER_PRIVATE_KEY, provider);

console.log("Relayer aktif →", relayerWallet.address);
console.log("Contract       →", VITE_CONTRACT_ADDRESS);

// === ABI YANG SUDAH DIPERBAIKI (SESUAI CONTRACT FINAL) ===
const ABI = [
  "function voteDenganTandaTangan(address pemilih, uint256 kandidatId, bytes signature) external",
  "function noncePemilih(address) view returns (uint256)",
  "function telahMemilih(address) view returns (bool)",
  "function statusVoting() view returns (string)",
  "function totalKandidat() view returns (uint256)",
  "function getKandidat() view returns (string[])",
  // Event baru — tidak ada address pemilih!
  "event SuaraMasuk(uint256 kandidatId, uint256 totalSuaraSekarang)",
  "event PemilihTercatat()"
];

const contract = new ethers.Contract(VITE_CONTRACT_ADDRESS, ABI, relayerWallet);

// === MIDDLEWARE ===
app.use(cors({ origin: "*" })); // Vercel otomatis aman
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

// Rate limit: 5 vote per IP per menit
app.use("/vote", rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: "Terlalu banyak percobaan. Tunggu 1 menit." }
}));

// === QUEUE (anti double vote) ===
const queue = new Set();

app.post("/vote", async (req, res) => {
  const { pemilih, kandidatId, signature } = req.body;

  if (!ethers.isAddress(pemilih) || kandidatId === undefined || !signature) {
    return res.status(400).json({ error: "Data tidak valid" });
  }

  const addr = ethers.getAddress(pemilih);

  // Cek double submit
  if (queue.has(addr)) {
    return res.status(429).json({ error: "Vote sedang diproses..." });
  }

  queue.add(addr);
  res.status(202).json({ message: "Vote diterima, sedang diproses..." });

  try {
    const status = await contract.statusVoting();
    if (status !== "Berlangsung") {
      return res.status(400).json({ error: `Voting ${status}` });
    }

    const [sudahVote, nonce, totalKandidat] = await Promise.all([
      contract.telahMemilih(addr),
      contract.noncePemilih(addr),
      contract.totalKandidat()
    ]);

    if (sudahVote) throw new Error("Sudah memilih");
    if (kandidatId >= totalKandidat) throw new Error("Kandidat tidak valid");

    // Verifikasi signature EIP-712
    const domain = {
      name: "PilkadesVoting",
      version: "1",
      chainId: await provider.getNetwork().then(n => Number(n.chainId)),
      verifyingContract: VITE_CONTRACT_ADDRESS
    };

    const types = { Vote: [
      { name: "pemilih", type: "address" },
      { name: "kandidatId", type: "uint256" },
      { name: "nonce", type: "uint256" }
    ]};

    const recovered = ethers.verifyTypedData(domain, types, { pemilih: addr, kandidatId, nonce }, signature);
    if (recovered.toLowerCase() !== addr.toLowerCase()) {
      throw new Error("Signature tidak valid");
    }

    // Kirim transaksi
    const tx = await contract.voteDenganTandaTangan(addr, kandidatId, signature, {
      gasLimit: 300000
    });

    console.log(`VOTE SUKSES → ${addr} pilih kandidat ${kandidatId} | Tx: ${tx.hash}`);
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      const kandidat = await contract.getKandidat();
      console.log(`SUARA TERCATAT → ${kandidat[kandidatId]}`);
    }

  } catch (err) {
    console.error("VOTE GAGAL:", err.message);
    // Jangan kirim ulang error ke user — cukup log
  } finally {
    queue.delete(addr);
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "Relayer PILKADES 2026 — AKTIF & AMAN",
    relayer: relayerWallet.address,
    contract: VITE_CONTRACT_ADDRESS,
    network: "Sepolia",
    timestamp: new Date().toLocaleString("id-ID")
  });
});

app.listen(RELAYER_PORT, () => {
  console.log("RELAYER PILKADES 2026 SIAP PAKAI!");
  console.log(`Port     : ${RELAYER_PORT}`);
  console.log(`Relayer  : ${relayerWallet.address}`);
  console.log(`Contract : ${VITE_CONTRACT_ADDRESS}`);
});
