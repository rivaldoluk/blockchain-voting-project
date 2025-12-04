// scripts/lihat-hasil.js
const hre = require("hardhat");
require("dotenv").config();

function formatSisaWaktu(detik) {
  const d = Number(detik);
  const h = Math.floor(d / 3600);
  const m = Math.floor((d % 3600) / 60);
  const s = d % 60;
  return `${h}j ${m}m ${s}d`;
}

function formatTanggalWIB(timestamp) {
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

function barSuara(suara, maxBar = 30) {
  const s = Number(suara);
  const filled = Math.min(s, maxBar);
  return "█".repeat(filled) + "░".repeat(maxBar - filled);
}

async function main() {
  console.log("CEK HASIL VOTING PILKADES 2025");
  console.log("========================================");
  console.log("Waktu WIB :", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
  console.log("Network   :", hre.network.name.toUpperCase());
  console.log("----------------------------------------");

  // === BACA .env ===
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("CONTRACT_ADDRESS tidak ada di .env! Deploy dulu!");
  }

  console.log("Contract  :", contractAddress);
  console.log("----------------------------------------");

  // === ATTACH KONTRAK ===
  const PilkadesVoting = await hre.ethers.getContractFactory("PilkadesVoting");
  const contract = PilkadesVoting.attach(contractAddress);

  try {
    // === BACA SEMUA DATA ===
    const [
      kandidat,
      hasilRaw,
      totalPemilihRaw,
      statusText,
      pemenangTuple,
      sisa,
      waktuTutup
    ] = await Promise.all([
      contract.getKandidat(),
      contract.getHasil(),
      contract.getTotalPemilih(),
      contract.statusVoting(),
      contract.getPemenang(),
      contract.getWaktuTersisa(),
      contract.getWaktuTutup(),
    ]);

    // === KONVERSI BigInt KE Number AMAN ===
    const hasil = hasilRaw.map(v => Number(v));
    const totalPemilih = Number(totalPemilihRaw);
    const [indexPemenang, namaPemenang, suaraPemenangRaw] = pemenangTuple;
    const suaraPemenang = Number(suaraPemenangRaw);

    // === TAMPILKAN HASIL ===
    console.log("KANDIDAT & SUARA:");
    let maxSuara = 0;
    hasil.forEach((s) => {
      if (s > maxSuara) maxSuara = s;
    });

    kandidat.forEach((nama, i) => {
      const suara = hasil[i];
      const persen = totalPemilih > 0 ? ((suara / totalPemilih) * 100).toFixed(1) : "0.0";
      const bar = barSuara(suara);
      console.log(` ${i + 1}. ${nama.padEnd(18)} | ${suara.toString().padStart(4)} suara | ${persen.padStart(5)}% | ${bar}`);
    });

    console.log("----------------------------------------");
    console.log(`Total Pemilih : ${totalPemilih}`);
    console.log(`Status        : ${statusText}`);

    if (statusText === "Selesai") {
      console.log(`\nPEMENANG RESMI:`);
      console.log(`   ${namaPemenang} (${suaraPemenang} suara)`);
      console.log(`   Waktu selesai: ${formatTanggalWIB(waktuTutup)}`);
    } else if (statusText === "Berlangsung") {
      console.log(`\nPEMENANG SEMENTARA:`);
      console.log(`   ${namaPemenang} (${suaraPemenang} suara)`);
      console.log(`   Sisa waktu: ${formatSisaWaktu(sisa)}`);
      console.log(`   Tutup: ${formatTanggalWIB(waktuTutup)}`);
    } else {
      console.log(`\nVOTING BELUM DIBUKA`);
    }

    console.log("\nEtherscan:");
    console.log(`   https://sepolia.etherscan.io/address/${contractAddress}#readContract`);
    console.log("========================================");

  } catch (err) {
    console.error("Gagal baca kontrak:", err.reason || err.message || err);
    console.log("Pastikan:");
    console.log("  1. Kontrak sudah di-deploy");
    console.log("  2. CONTRACT_ADDRESS benar di .env");
    console.log("  3. RPC Sepolia aktif (Alchemy/Infura)");
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