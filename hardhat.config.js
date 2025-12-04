// hardhat.config.js
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000, // hemat gas saat deploy
      },
      // viaIR: true → DITUTUP! Bisa error di Sepolia
    },
  },

  networks: {
    // === LOCAL TESTING ===
    hardhat: {
      chainId: 31337,
      mining: {
        auto: true,
        interval: 2000,
      },
    },

    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // === SEPOLIA TESTNET ===
    sepolia: {
      url:
        process.env.ALCHEMY_KEY
          ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
          : process.env.INFURA_PROJECT_ID
          ? `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
          : "https://rpc.sepolia.org", // fallback publik
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      timeout: 60000,
    },
  },

  // Etherscan verify → WAJIB object per network!
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },

  mocha: {
    timeout: 400000,
  },

  // Optional: named accounts
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
};