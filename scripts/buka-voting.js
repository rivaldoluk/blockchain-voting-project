// scripts/buka-voting.js — VERSI FINAL 2026 (HANYA KETUA YANG BISA BUKA!)

const hre = require("hardhat");

async function main() {
  console.log("════════════════════════════════════════════════".green);
  console.log("     BUKA VOTING PILKADES — RESMI & AMAN 100%".green.bold);
  console.log("════════════════════════════════════════════════".green);

  const waktuSekarang = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  console.log(`Waktu       : ${waktuSekarang}`);
  console.log(`Network     : ${hre.network.name.toUpperCase()}`);

  const { chainId } = await hre.ethers.provider.getNetwork();
  console.log(`Chain ID    : ${chainId}`);
  console.log("────────────────────────────────────────────────");

  // === 1. AMBIL PRIVATE KEY DARI TERMINAL (TIDAK PAKAI .env LAGI!) ===
  const privateKey = process.env.PRIVATE_KEY?.trim();
  if (!privateKey || !privateKey.startsWith("0x") || privateKey.length !== 66) {
    console.error("ERROR: PRIVATE_KEY tidak valid!");
    console.error("Cara benar:");
    console.error("   export PRIVATE_KEY=0xabc123... && npx hardhat run scripts/buka-voting.js --network sepolia");
    process.exit(1);
  }

  // === 2. AMBIL CONTRACT ADDRESS DARI VERCEL ATAU MANUAL ===
  const contractAddress = (process.env.VITE_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS)?.trim();
  if (!contractAddress || !hre.ethers.isAddress(contractAddress)) {
    console.error("ERROR: VITE_CONTRACT_ADDRESS belum di-set!");
    console.error("   Copy dari hasil deploy → paste ke terminal:");
    console.error("   export VITE_CONTRACT_ADDRESS=0xYourContract...");
    process.exit(1);
  }

  // === 3. SETUP WALLET (harus ketua panitia!) ===
  const wallet = new hre.ethers.Wallet(privateKey, hre.ethers.provider);
  const balance = await wallet.getBalance();

  console.log("Signer      :", wallet.address);
  console.log("Balance     :", hre.ethers.formatEther(balance), "ETH");
  console.log("Contract    :", contractAddress);
  console.log("────────────────────────────────────────────────");

  // === 4. CONNECT KE CONTRACT ===
  const PilkadesVoting = await hre.ethers.getContractFactory("PilkadesVoting");
  const contract = PilkadesVoting.attach(contractAddress).connect(wallet);

  // === 5. CEK APAKAH INI KETUA PANITIA ===
  const ketuaPanitia = await contract.ketuaPanitia();
  if (wallet.address.toLowerCase() !== ketuaPanitia.toLowerCase()) {
    console.error("GAGAL: Wallet ini BUKAN ketua panitia!");
    console.error(`Ketua Panitia: ${ketuaPanitia}`);
    console.error("Hanya ketua yang bisa buka voting (sesuai contract final & hukum Pilkades).");
    process.exit(1);
  }
  console.log("Anda adalah KETUA PANITIA → IZIN PENUH!".green.bold);

  // === 6. CEK STATUS VOTING ===
  const status = await contract.statusVoting();
  console.log(`Status Saat Ini : ${status}`);

  if (status === "Berlangsung") {
    const sisa = await contract.getWaktuTersisa();
    console.log(`Sisa Waktu      : ${formatWaktu(sisa)}`);
    console.log("\nVOTING SUDAH BERLANGSUNG!".yellow);
    console.log(`Lihat: ${explorerUrl(chainId, contractAddress)}`);
    return;
  }

  if (status === "Selesai") {
    console.log("\nVOTING SUDAH SELESAI & TIDAK BISA DIBUKA LAGI.".red.bold);
    console.log("Deploy kontrak baru untuk pilkades berikutnya.");
    return;
  }

  // === 7. TAMPILKAN KANDIDAT ===
  const kandidat = await contract.getKandidat();
  console.log("\nKANDIDAT RESMI:");
  kandidat.forEach((nama, i) => console.log(` ${i + 1}. ${nama}`));

  // === 8. DURASI VOTING (ubah sesuai kebutuhan desa) ===
  const DURASI_DETIK = 6 * 3600; // ← UBAH DI SINI: 6 jam (bisa 8*3600, 12*3600, atau 24*3600)
  console.log(`\nDurasi Voting   : ${formatWaktu(DURASI_DETIK)} (dari sekarang)`);

  console.log("\nMembuka voting sekarang...".cyan);
  const tx = await contract.bukaVoting(DURASI_DETIK, { gasLimit: 300000 });
  console.log(`Tx dikirim      : ${tx.hash}`);
  console.log("Menunggu konfirmasi...");

  const receipt = await tx.wait();
  console.log(`Berhasil di blok: ${receipt.blockNumber}`);

  // === 9. TAMPILKAN HASIL AKHIR ===
  const mulai = await contract.waktuMulai();
  const selesai = await contract.waktuSelesai();

  console.log("\n");
  console.log("VOTING RESMI DIBUKA!".green.bold.bgWhite);
  console.log("════════════════════════════════════════════════".green);
  console.log(`Status          : ${await contract.statusVoting()}`);
  console.log(`Mulai           : ${formatTanggal(mulai)} WIB`);
  console.log(`Selesai         : ${formatTanggal(selesai)} WIB`);
  console.log(`Durasi          : ${formatWaktu(DURASI_DETIK)}`);
  console.log(`Total Kandidat  : ${kandidat.length}`);
  console.log("════════════════════════════════════════════════".green);

  console.log("\nTautan Penting:");
  console.log(`Kontrak   → ${explorerUrl(chainId, contractAddress)}`);
  console.log(`Transaksi → ${explorerUrl(chainId, tx.hash, "tx")}`);

  console.log("\nSELESAI! SISTEM VOTING SUDAH AKTIF 100%!");
  console.log("\nLangkah selanjutnya:");
  console.log("   • Bagikan link website ke pemilih");
  console.log("   • Pemilih scan QR → vote GRATIS (gas dibayar relayer)");
  console.log("   • Hasil real-time otomatis di halaman hasil");
  console.log("\nPilkades pertama di Indonesia yang benar-benar transparan, anonim, dan anti-curang!");
  console.log("════════════════════════════════════════════════".green);
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function formatWaktu(detik) {
  const h = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  return `${h} jam ${m} menit`;
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
  });
}

function explorerUrl(chainId, hash, type = "address") {
  const bases = {
    11155111: "https://sepolia.etherscan.io",
    80002: "https://amoy.polygonscan.com",
    84532: "https://base-sepolia.blockscout.com",
  };
  const base = bases[chainId] || "https://sepolia.etherscan.io";
  return type === "tx" ? `${base}/tx/${hash}` : `${base}/address/${hash}`;
}

// ===========================================

main().catch((error) => {
  console.error("\nGAGAL BUKA VOTING!".red.bold);
  console.error("Error:", error.reason || error.message || error);
  console.error("\nPastikan:");
  console.error("   • Anda adalah ketua panitia (wallet deployer)");
  console.error("   • Wallet punya ETH untuk gas");
  console.error("   • Contract address benar");
  console.error("   • Jalankan dengan: export PRIVATE_KEY=0x... && npx hardhat run ...");
  process.exit(1);
});
