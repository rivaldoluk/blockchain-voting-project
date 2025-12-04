// scripts/vote-debug.js
// GUNAKAN HANYA UNTUK TESTING CEPAT!
// VOTE RESMI: LEWAT FRONTEND + RELAYER
const hre = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("VOTE DEBUG (TESTING SAJA!)");
  console.log("========================================");
  console.log("WIB     :", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
  console.log("Network :", hre.network.name.toUpperCase());
  console.log("----------------------------------------");

  // === BACA .env ===
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const privateKey = process.env.PRIVATE_KEY;

  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("CONTRACT_ADDRESS tidak ada di .env!");
  }

  if (!privateKey) {
    throw new Error("PRIVATE_KEY tidak ada di .env! Gunakan wallet test!");
  }

  // === WALLET TEST ===
  const wallet = new hre.ethers.Wallet(privateKey, hre.ethers.provider);
  const balance = await hre.ethers.provider.getBalance(wallet.address);

  console.log("Voter   :", wallet.address);
  console.log("Balance :", hre.ethers.formatEther(balance), "ETH Sepolia");
  console.log("Contract:", contractAddress);
  console.log("----------------------------------------");

  // === ATTACH KONTRAK ===
  const PilkadesVoting = await hre.ethers.getContractFactory("PilkadesVoting");
  const contract = PilkadesVoting.attach(contractAddress).connect(wallet);

  // === CEK STATUS ===
  const status = await contract.statusVoting();
  console.log("Status  :", status);

  if (status !== "Berlangsung") {
    console.log("VOTING TIDAK SEDANG BERLANGSUNG!");
    console.log("Gunakan buka-voting.js dulu!");
    return;
  }

  const sudahVote = await contract.sudahMemilih(wallet.address);
  if (sudahVote) {
    console.log("SUDAH PERNAH VOTE!");
    return;
  }

  // === PILIH KANDIDAT (0-3) ===
  const kandidatId = 0; // GANTI SESUAI PILIHAN
  const namaKandidat = ["Joko Widodo", "Siti Aminah", "Budi Santoso", "Ani Lestari"][kandidatId];

  console.log(`Memilih: ${namaKandidat} (ID: ${kandidatId})`);

  try {
    const tx = await contract.vote(kandidatId);
    console.log("Tx sent :", tx.hash);
    const receipt = await tx.wait();
    console.log("SUKSES! Gas used:", receipt.gasUsed.toString());

    // === CEK HASIL LANGSUNG ===
    const hasil = await contract.getHasil();
    console.log(`\nSUARA ${namaKandidat}: ${hasil[kandidatId]}`);

    console.log("\nEtherscan:");
    console.log(`https://sepolia.etherscan.io/tx/${tx.hash}`);

  } catch (err) {
    console.error("GAGAL VOTE:", err.reason || err.message);
    console.log("Pastikan:");
    console.log("  1. Voting sedang berlangsung");
    console.log("  2. Wallet belum vote");
    console.log("  3. Wallet punya ETH Sepolia");
  }
}

main()
  .catch((error) => {
    console.error("Error:", error.message || error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(), 100);
  });