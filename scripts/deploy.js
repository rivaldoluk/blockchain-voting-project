// scripts/deploy.js — VERSI FINAL 2026 (NO CONFIG.JS, NO .env LOKAL)

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("===============================================");
  console.log("   DEPLOY PILKADES VOTING — FINAL & AMAN 100%");
  console.log("===============================================");

  const network = await hre.ethers.provider.getNetwork();
  console.log("Network  :", hre.network.name.toUpperCase());
  console.log("Chain ID :", network.chainId);
  console.log("Waktu    :", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
  console.log("-----------------------------------------------");

  // === 1. RELAYER ADDRESS (WAJIB dari .env lokal atau manual) ===
  const relayerAddress = (process.env.RELAYER_ADDRESS || "").trim();
  if (!relayerAddress || !hre.ethers.isAddress(relayerAddress)) {
    throw new Error("RELAYER_ADDRESS belum diisi atau salah! Set di .env atau export di terminal.");
  }

  // === 2. DEPLOYER INFO ===
  const [deployer] = await hre.ethers.getSigners();
  const balance = await deployer.getBalance();

  console.log("Deployer :", deployer.address);
  console.log("Balance  :", hre.ethers.formatEther(balance), "ETH");
  console.log("Relayer  :", relayerAddress);
  console.log("-----------------------------------------------");

  // === 3. DAFTAR KANDIDAT (ubah sesuai desa kamu) ===
  const candidates = [
    "Joko Widodo",
    "Siti Aminah",
    "Budi Santoso",
    "Ani Lestari"
  ];

  candidates.forEach((nama, i) => console.log(` ${i + 1}. ${nama}`));
  console.log("-----------------------------------------------");
  console.log("Deploying PilkadesVoting (EIP-712 + Anonim Total)...");

  const PilkadesVoting = await hre.ethers.getContractFactory("PilkadesVoting");
  const contract = await PilkadesVoting.deploy(candidates, relayerAddress);

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  const deployTx = contract.deploymentTransaction();
  await deployTx?.wait?.(1);

  console.log("");
  console.log("DEPLOY BERHASIL!");
  console.log("Contract Address :", address);
  console.log("Tx Hash          :", deployTx?.hash || "N/A");
  console.log("Explorer         :", getExplorerUrl(network.chainId, address));
  console.log("-----------------------------------------------");

  // === VERIFIKASI OTOMATIS ===
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Menunggu indexing (~15 detik)...");
    await new Promise(r => setTimeout(r, 15000));

    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: [candidates, relayerAddress],
      });
      console.log("VERIFY BERHASIL di Explorer!");
    } catch (err) {
      if (!err.message.includes("Already Verified")) {
        console.log("Verify manual:");
        console.log(`npx hardhat verify --network ${hre.network.name} ${address} --constructor-args scripts/arguments.js`);
      }
    }
  }

  // === CETAK SEMUA YANG HARUS DI-INPUT KE VERCEL ===
  console.log("");
  console.log("COPY-PASTE KE VERCEL ENVIRONMENT VARIABLES:");
  console.log("──────────────────────────────────────────────");
  console.log(`VITE_CONTRACT_ADDRESS=${address}`);
  console.log(`VITE_RELAYER_URL=https://blockchain-voting-project.vercel.app/public/vote`);
  console.log(`VITE_HASIL_URL=https://blockchain-voting-project.vercel.app/public/hasil`);
  console.log(`VITE_ALCHEMY_URL=https://eth-sepolia.g.alchemy.com/v2/TUJUH_RAHASIA_KAMU`);
  console.log(`VITE_SEPOLIA_CHAIN_ID=0xaa36a7`);
  console.log("──────────────────────────────────────────────");
  console.log("Setelah itu → Redeploy Vercel → SELESAI!");

  // === BUAT arguments.js untuk verify manual ===
  const argsContent = `module.exports = [\n  ${candidates.map(c => `  "${c}"`).join(",\n")},\n  "${relayerAddress}"\n];`;
  fs.writeFileSync(path.join(__dirname, "arguments.js"), argsContent);
  console.log("arguments.js dibuat untuk verify manual");

  console.log("");
  console.log("SELESAI TOTAL!");
  console.log("Langkah selanjutnya:");
  console.log("1. Copy 5 baris di atas → Vercel → Environment Variables");
  console.log("2. Redeploy website");
  console.log("3. Buka voting lewat admin → selesai!");
  console.log("===============================================");
}

function getExplorerUrl(chainId, address) {
  const explorers = {
    11155111: "https://sepolia.etherscan.io",
    80002:    "https://amoy.polygonscan.com",
    84532:    "https://base-sepolia.blockscout.com",
    43113:    "https://testnet.snowtrace.io",
  };
  const base = explorers[chainId] || "https://sepolia.etherscan.io";
  return `${base}/address/${address}`;
}

// ===========================================

main().catch((error) => {
  console.error("");
  console.error("DEPLOY GAGAL:", error.message);
  console.error("");
  process.exitCode = 1;
});
