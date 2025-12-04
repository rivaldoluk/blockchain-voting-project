// public/user/user.js
// TIDAK ADA LAGI import config.js → semua pakai import.meta.env

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const RPC_URL          = import.meta.env.VITE_RPC_URL || "https://rpc.sepolia.org";
const RELAYER_URL      = import.meta.env.VITE_RELAYER_URL || "https://blockchain-voting-project.vercel.app/public/vote";
const HASIL_URL        = import.meta.env.VITE_HASIL_URL   || "https://blockchain-voting-project.vercel.app/public/hasil";
const CHAIN_ID         = import.meta.env.VITE_SEPOLIA_CHAIN_ID || "0xaa36a7";

// Pastikan semua variabel wajib ada
if (!CONTRACT_ADDRESS) {
  alert("Error: Contract belum di-deploy atau konfigurasi belum lengkap.");
  throw new Error("VITE_CONTRACT_ADDRESS belum di-set di Vercel!");
}

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, [
  "function getKandidat() view returns (string[])",
  "function statusVoting() view returns (string)",
  "function getWaktuTersisa() view returns (uint256)",
  "function telahMemilih(address) view returns (bool)",
  "function noncePemilih(address) view returns (uint256)",
  "function totalKandidat() view returns (uint256)"
], provider);

const urlParams = new URLSearchParams(window.location.search);
const privateKeyHex = urlParams.get("pk");
let wallet = null;
let voterAddress = null;

const statusEl       = document.getElementById("status");
const loadingEl      = document.getElementById("loading");
const mainEl         = document.getElementById("main");
const timerEl        = document.getElementById("timer");
const voterAddressEl = document.getElementById("voterAddress");
const voteStatusEl   = document.getElementById("voteStatus");
const candidatesEl   = document.getElementById("candidates");
const voteBtn        = document.getElementById("voteBtn");
const resultEl       = document.getElementById("result");
const successEl      = document.getElementById("success");
const txLinkEl       = document.getElementById("txLink");

let selectedId = null;

async function init() {
  if (!privateKeyHex || privateKeyHex.length !== 64) {
    statusEl.textContent = "Link tidak valid! Gunakan QR Code resmi dari panitia.";
    statusEl.style.background = "#ffebee";
    loadingEl.style.display = "none";
    return;
  }

  try {
    wallet = new ethers.Wallet("0x" + privateKeyHex);
    voterAddress = wallet.address;

    voterAddressEl.textContent = voterAddress.slice(0, 10) + "..." + voterAddress.slice(-8);

    const [status, sudahVote] = await Promise.all([
      contract.statusVoting(),
      contract.telahMemilih(voterAddress)
    ]);

    if (status !== "Berlangsung") {
      showClosed(status);
      return;
    }

    if (sudahVote) {
      showAlreadyVoted();
      return;
    }

    loadingEl.style.display = "none";
    mainEl.style.display = "block";
    statusEl.textContent = "Voting Sedang Berlangsung";
    statusEl.style.background = "#e8f5e8";

    await loadCandidates();
    startTimer();

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error: Koneksi blockchain gagal atau link rusak.";
    statusEl.style.background = "#ffebee";
    loadingEl.style.display = "none";
  }
}

async function loadCandidates() {
  try {
    const kandidat = await contract.getKandidat();
    candidatesEl.innerHTML = "";

    kandidat.forEach((nama, i) => {
      const btn = document.createElement("button");
      btn.className = "candidate-btn";
      btn.innerHTML = `<strong>${i + 1}. ${nama}</strong>`;
      btn.onclick = () => selectCandidate(i, btn);
      candidatesEl.appendChild(btn);
    });
  } catch (err) {
    candidatesEl.innerHTML = "<p style='color:red;'>Gagal memuat daftar kandidat.</p>";
  }
}

function selectCandidate(id, btn) {
  document.querySelectorAll(".candidate-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  selectedId = id;
  voteBtn.disabled = false;
  voteBtn.textContent = `Vote untuk ${btn.querySelector("strong").textContent.split(". ")[1]}`;
}

voteBtn.onclick = async () => {
  if (selectedId === null) return;

  voteBtn.disabled = true;
  voteBtn.textContent = "Sedang mengirim suara...";

  try {
    const nonce = await contract.noncePemilih(voterAddress);

    const domain = {
      name: "PilkadesVoting",
      version: "1",
      chainId: parseInt(CHAIN_ID),
      verifyingContract: CONTRACT_ADDRESS
    };

    const types = {
      Vote: [
        { name: "pemilih", type: "address" },
        { name: "kandidatId", type: "uint256" },
        { name: "nonce", type: "uint256" }
      ]
    };

    const value = { pemilih: voterAddress, kandidatId: selectedId, nonce };

    const signature = await wallet._signTypedData(domain, types, value);

    const res = await fetch(RELAYER_URL + "/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pemilih: voterAddress, kandidatId: selectedId, signature })
    });

    const data = await res.json();

    if (res.ok || data.message) {
      showSuccess();
    } else {
      throw new Error(data.error || "Gagal kirim vote");
    }
  } catch (err) {
    console.error(err);
    alert("Gagal mengirim suara: " + (err.message || "Coba lagi nanti"));
    voteBtn.disabled = false;
    voteBtn.textContent = "Coba Lagi";
  }
};

function showClosed(status) {
  loadingEl.style.display = "none";
  statusEl.textContent = status === "Selesai" ? "Voting Sudah Ditutup" : "Voting Belum Dibuka";
  statusEl.style.background = "#ffebee";
}

function showAlreadyVoted() {
  loadingEl.style.display = "none";
  mainEl.style.display = "block";
  voteStatusEl.textContent = "Anda sudah memilih sebelumnya. Terima kasih telah berpartisipasi!";
  voteStatusEl.style.color = "#00c853";
  voteBtn.style.display = "none";
}

function showSuccess() {
  mainEl.style.display = "none";
  successEl.style.display = "block";
  txLinkEl.innerHTML = `Suara Anda berhasil tercatat di blockchain!<br>
    <a href="https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}" target="_blank" style="color:#00c853;">
      Lihat kontrak di Sepolia Etherscan
    </a>`;
}

function updateTimer() {
  contract.getWaktuTersisa().then(sisa => {
    if (sisa > 0) {
      const h = Math.floor(sisa / 3600).toString().padStart(2, '0');
      const m = Math.floor((sisa % 3600) / 60).toString().padStart(2, '0');
      const s = (sisa % 60).toString().padStart(2, '0');
      timerEl.textContent = `${h}:${m}:${s}`;
    } else {
      timerEl.textContent = "WAKTU HABIS";
      setTimeout(() => location.reload(), 3000);
    }
  }).catch(() => {
    timerEl.textContent = "--:--";
  });
}

function startTimer() {
  updateTimer();
  setInterval(updateTimer, 1000);
}

// MULAI
init();
