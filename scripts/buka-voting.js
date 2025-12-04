// scripts/buka-voting.js
const hre = require("hardhat");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

function formatSisaWaktu(detik) {
  const d = Number(detik);
  const h = Math.floor(d / 3600);
  const m = Math.floor((d % 3600) / 60);
  const s = d % 60;
  return `${h} jam ${m} menit ${s} detik`;
}

function formatTanggal(timestamp) {
  return new Date(Number(timestamp) * 1000).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getExplorerUrl(chainId, hash = "", type = "address") {
  const bases = {
    11155111: "https://sepolia.etherscan.io",
    80002: "https://amoy.polygonscan.com",
    97: "https://testnet.bscscan.com",
    43113: "https://testnet.snowtrace.io",
    4202: "https://lisk-sepolia.blockscout.com",
    84532: "https://base-sepolia.blockscout.com",
  };
  const base = bases[chainId] || "https://etherscan.io";
  return type === "tx" ? `${base}/tx/${hash}` : `${base}/address/${hash}`;
}

async function main() {
  console.log("==================================================");
  console.log("     BUKA VOTING RESMI PILKADES BERBASIS BLOCKCHAIN");
  console.log("==================================================");
  console.log("Waktu       :", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
  console.log("Network     :", hre.network.name.toUpperCase());

  const network = await hre.ethers.provider.getNetwork();
  console.log("Chain ID    :", network.chainId);
  console.log("--------------------------------------------------");

  const contractAddress = process.env.CONTRACT_ADDRESS?.trim();
  const privateKey = process.env.PRIVATE_KEY?.trim();

  if (!contractAddress || contractAddress === "0x000000" + "0".repeat(40)) {
    throw new Error("CONTRACT_ADDRESS belum diisi! Deploy dulu kontraknya!");
  }
  if (!privateKey) {
    throw new Error("PRIVATE_KEY tidak ada di .env! Butuh untuk tanda tangan transaksi.");
  }

  // Signer: Ketua Panitia
  const wallet = new hre.ethers.Wallet(privateKey, hre.ethers.provider);
  const balance = await hre.ethers.provider.getBalance(wallet.address);

  console.log("Signer      :", wallet.address);
  console.log("Balance     :", hre.ethers.formatEther(balance), "ETH");
  console.log("Contract    :", contractAddress);
  console.log("--------------------------------------------------");

  // Attach kontrak
  const PilkadesVoting = await hre.ethers.getContractFactory("PilkadesVoting");
  const contract = PilkadesVoting.attach(contractAddress).connect(wallet);

  // Cek apakah signer adalah ketua panitia (lebih aman!)
  const ketuaPanitia = await contract.ketuaPanitia();
  if (wallet.address.toLowerCase() !== ketuaPanitia.toLowerCase()) {
    const isPanitia = await contract.panitia(wallet.address);
    if (!isPanitia) {
      throw new Error("Wallet ini BUKAN panitia! Hanya ketua atau panitia yang bisa buka voting.");
    }
    console.log("Anda adalah panitia (bukan ketua). Lanjutkan...");
  } else {
    console.log("Anda adalah KETUA PANITIA → Izin penuh!");
  }

  // Cek status voting
  const status = await contract.statusVoting();
  console.log("Status Saat Ini :", status);

  if (status === "Berlangsung") {
    const sisa = await contract.getWaktuTersisa();
    console.log("Sisa Waktu      :", formatSisaWaktu(sisa));
    console.log("\nVOTING SUDAH BERLANGSUNG!");
    console.log("Link Kontrak    :", getExplorerUrl(network.chainId, contractAddress));
    return;
  }

  if (status === "Selesai") {
    console.log("\nVOTING SUDAH SELESAI SECARA PERMANEN!");
    console.log("Tidak bisa dibuka ulang → sesuai prinsip blockchain & UU Pemilu.");
    console.log("Deploy kontrak baru untuk pemilihan berikutnya.");
    return;
  }

  // Tampilkan kandidat
  const kandidat = await contract.getKandidat();
  console.log("\nKANDIDAT RESMI:");
  kandidat.forEach((nama, i) => console.log(` ${i + 1}. ${nama}`));

  // Input durasi voting (bisa diubah sesuai PKPU)
  const DURASI_DETIK = 6 * 3600; // 6 jam default (bisa diganti jadi 8*3600, 12*3600, dll)
  console.log(`\nDurasi Voting   : ${formatSisaWaktu(DURASI_DETIK)} (bisa diubah di script)`);

  console.log("\nMembuka voting sekarang...");
  const tx = await contract.bukaVoting(DURASI_DETIK);
  console.log("Tx dikirim      :", tx.hash);
  console.log("Menunggu konfirmasi...");

  const receipt = await tx.wait();
  console.log("Berhasil di blok:", receipt.blockNumber);

  // Data setelah buka
  const mulai = await contract.waktuMulai();
  const selesai = await contract.waktuSelesai();
  const sisa = await contract.getWaktuTersisa();

  console.log("\n");
  console.log("VOTING RESMI DIBUKA!".padStart(50));
  console.log("═".repeat(60));
  console.log(`Status          : ${await contract.statusVoting()}`);
  console.log(`Waktu Mulai     : ${formatTanggal(mulai)} WIB`);
  console.log(`Waktu Selesai   : ${formatTanggal(selesai)} WIB`);
  console.log(`Sisa Waktu      : ${formatSisaWaktu(sisa)}`);
  console.log(`Total Kandidat  : ${await contract.totalKandidat()}`);
  console.log("═".repeat(60));

  // Link penting
  console.log("\nTautan Penting:");
  console.log(`Kontrak : ${getExplorerUrl(network.chainId, contractAddress)}`);
  console.log(`Transaksi : ${getExplorerUrl(network.chainId, tx.hash, "tx")}`);

  // HAPUS PRIVATE_KEY DARI .env (KEAMANAN TINGKAT TINGGI)
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf8");
    if (content.includes("PRIVATE_KEY=")) {
      content = content.replace(/^PRIVATE_KEY=.*/m, "# PRIVATE_KEY TELAH DIHAPUS SETELAH BUKA VOTING (AMAN!)");
      fs.writeFileSync(envPath, content);
      console.log("\nPRIVATE_KEY SUDAH DIHAPUS DARI .env → AMAN 100%!");
      console.log("   Simpan backup di tempat aman (USB terenkripsi / password manager)");
    }
  }

  console.log("\nSELAMAT! SISTEM VOTING SUDAH AKTIF!");
  console.log("\nLangkah selanjutnya:");
  console.log("   cd relayer && npm run start");
  console.log("   Buka http://localhost:3000 → Pemilih scan QR & vote GRATIS!");
  console.log("   Relayer bayar gas → Pemilih 0 ETH!");
  console.log("\nPilkades pertama di Indonesia yang 100% transparan & anti-curang!");
  console.log("==================================================");
}

main()
  .catch((error) => {
    console.error("\nGAGAL BUKA VOTING:");
    console.error("Error :", error.reason || error.message || error);
    console.error("\nPastikan:");
    console.error("  • Wallet punya cukup ETH");
    console.error("  • Anda adalah ketua/panitia");
    console.error("  • Voting belum pernah dibuka");
    process.exitCode = 1;
  });