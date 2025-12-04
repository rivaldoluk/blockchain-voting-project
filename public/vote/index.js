// public/vote/index.js
import { ethers } from "ethers";

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pemilih, kandidatId, signature } = req.body;

  if (!pemilih || kandidatId === undefined || !signature) {
    return res.status(400).json({ error: "Data tidak lengkap" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(process.env.VITE_RPC_URL);
    const wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);

    const contract = new ethers.Contract(
      process.env.VITE_CONTRACT_ADDRESS,
      [
        "function vote(address pemilih, uint256 kandidatId, bytes memory signature) external"
      ],
      wallet
    );

    const tx = await contract.vote(pemilih, kandidatId, signature, {
      gasLimit: 500000
    });

    await tx.wait();

    res.status(200).json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("Relayer error:", error);
    res.status(500).json({ error: error.message || "Gagal kirim transaksi" });
  }
}
