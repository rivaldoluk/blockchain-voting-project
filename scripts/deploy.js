// scripts/deploy.js
const hre = require("hardhat");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("===============================================");
  console.log("   DEPLOY PILKADES VOTING (RESMI & AMAN)");
  console.log("===============================================");
  console.log("Network :", hre.network.name.toUpperCase());
  
  const network = await hre.ethers.provider.getNetwork();
  console.log("Chain ID:", network.chainId.toString());
  console.log("Waktu   :", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
  console.log("===============================================");

  const relayerAddress = process.env.RELAYER_ADDRESS?.trim();
  if (!relayerAddress || relayerAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("RELAYER_ADDRESS belum diisi atau nol di .env!");
  }

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("Deployer :", deployer.address);
  console.log("Balance  :", hre.ethers.formatEther(balance), "ETH");
  console.log("Relayer  :", relayerAddress);
  console.log("-----------------------------------------------");

  // Daftar kandidat resmi (ubah sesuai kebutuhan desa)
  const candidates = [
    "Joko Widodo",
    "Siti Aminah",
    "Budi Santoso",
    "Ani Lestari"
  ];

  candidates.forEach((nama, i) => console.log(` ${i + 1}. ${nama}`));
  console.log("-----------------------------------------------");
  console.log("Deploying PilkadesVoting... (dengan EIP-712 & OpenZeppelin)");

  const PilkadesVoting = await hre.ethers.getContractFactory("PilkadesVoting");
  const contract = await PilkadesVoting.deploy(candidates, relayerAddress);

  console.log("Menunggu konfirmasi deploy...");
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  await deployTx.wait(1); // tunggu 1 konfirmasi

  console.log("");
  console.log("DEPLOY BERHASIL!");
  console.log("Contract Address :", address);
  console.log("Tx Hash          :", deployTx.hash);
  console.log("Gas Used         :", deployTx.gasLimit.toString());
  console.log("-----------------------------------------------");

  // Cek data kontrak
  const ketua = await contract.ketuaPanitia();
  const totalKandidat = await contract.totalKandidat();
  const status = await contract.statusVoting();

  console.log("Ketua Panitia    :", ketua);
  console.log("Total Kandidat   :", totalKandidat.toString());
  console.log("Status Voting    :", status);
  console.log("===============================================");

  // Explorer link
  const explorerUrl = getExplorerUrl(network.chainId, address);
  console.log("Lihat di Explorer:", explorerUrl);
  console.log("===============================================");

  // === UPDATE SEMUA FILE CONFIG OTOMATIS ===
  updateEnvFile("../.env", address);
  updateEnvFile("../relayer/.env", address);
  updateUserConfig("../public/config.js", address);

  console.log("Semua file .env & config.js berhasil di-update!");
  console.log("===============================================");

  // === GENERATE arguments.js UNTUK VERIFY ===
  const argsContent = `module.exports = [\n  ${candidates.map(c => `    "${c}"`).join(",\n")},\n  "${relayerAddress}"\n];`;
  const argsPath = path.join(__dirname, "arguments.js");
  fs.writeFileSync(argsPath, argsContent);
  console.log("arguments.js dibuat untuk verify");

  // === VERIFY OTOMATIS DI ETHERSCAN / BLOCKSCOUT ===
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("Verifying contract di blockchain explorer...");
    await new Promise(resolve => setTimeout(resolve, 15000)); // tunggu indexing

    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: [candidates, relayerAddress],
      });
      console.log("VERIFY BERHASIL!");
    } catch (err) {
      if (err.message.includes("Already Verified")) {
        console.log("Sudah diverifikasi sebelumnya");
      } else {
        console.log("Verify gagal (bisa manual):");
        console.log(`npx hardhat verify --network ${hre.network.name} ${address}`);
        console.log("Atau pakai arguments.js yang sudah dibuat");
      }
    }
  }

  console.log("===============================================");
  console.log("SELESAI! Kontrak siap digunakan.");
  console.log("");
  console.log("Langkah selanjutnya:");
  console.log("1. Buka voting:");
  console.log(`   npx hardhat run scripts/buka-voting.js --network ${hre.network.name}`);
  console.log("2. Test voting lewat relayer");
  console.log("3. Pantau di:", explorerUrl);
  console.log("===============================================");
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function getExplorerUrl(chainId, address) {
  const base = {
    11155111: "https://sepolia.etherscan.io",
    80002: "https://amoy.polygonscan.com",
    97: "https://testnet.bscscan.com",
    43113: "https://testnet.snowtrace.io",
    4202: "https://lisk-sepolia.blockscout.com",
    84532: "https://base-sepolia.blockscout.com",
  }[chainId] || "https://etherscan.io";

  return `${base}/address/${address}`;
}

function updateEnvFile(envPathRelative, newAddress) {
  const fullPath = path.resolve(__dirname, envPathRelative);
  if (!fs.existsSync(fullPath)) {
    console.log(`File tidak ditemukan: ${envPathRelative} (dilewati)`);
    return;
  }

  let content = fs.readFileSync(fullPath, "utf8");
  const oldAddr = content.match(/^CONTRACT_ADDRESS=.*$/m)?.[0] || "tidak ada";

  content = content.replace(/^CONTRACT_ADDRESS=.*/gm, `CONTRACT_ADDRESS=${newAddress}`);
  if (!content.includes("CONTRACT_ADDRESS=")) {
    content += `\nCONTRACT_ADDRESS=${newAddress}\n`;
  }

  fs.writeFileSync(fullPath, content.trim() + "\n");
  console.log(`UPDATED ${envPathRelative}`);
  if (oldAddr !== "tidak ada" && !oldAddr.includes(newAddress)) {
    console.log(`   dari ${oldAddr.split("=")[1]}`);
  }
}

function updateUserConfig(configPathRelative, newAddress) {
  const fullPath = path.resolve(__dirname, configPathRelative);
  if (!fs.existsSync(fullPath)) {
    console.log(`File tidak ditemukan: ${configPathRelative} (dilewati)`);
    return;
  }

  let content = fs.readFileSync(fullPath, "utf8");
  const oldMatch = content.match(/CONTRACT_ADDRESS:\s*["']0x[a-fA-F0-9]{40}["']/i);
  const oldAddr = oldMatch ? oldMatch[0] : "tidak ada";

  content = content.replace(
    /CONTRACT_ADDRESS:\s*["']0x[a-fA-F0-9]{40}["']/gi,
    `CONTRACT_ADDRESS: "${newAddress}"`
  );

  if (!content.includes("CONTRACT_ADDRESS")) {
    content = content.replace(
      /(export default\s*{)/,
      `$1\n  CONTRACT_ADDRESS: "${newAddress}",`
    );
  }

  fs.writeFileSync(fullPath, content);
  console.log(`UPDATED ${configPathRelative}`);
  if (oldAddr !== "tidak ada") {
    console.log(`   dari ${oldAddr}`);
  }
}

// ===========================================

main().catch((error) => {
  console.error("");
  console.error("DEPLOY GAGAL:", error.message || error);
  console.error("");
  process.exitCode = 1;
});