// public/user/user.js
import config from '../config.js';
const { CONTRACT_ADDRESS, RELAYER_URL, RPC_URL = "https://rpc.sepolia.org" } = config;

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

const statusEl = document.getElementById("status");
const loadingEl = document.getElementById("loading");
const mainEl = document.getElementById("main");
const timerEl = document.getElementById("timer");
const voterAddressEl = document.getElementById("voterAddress");
const voteStatusEl = document.getElementById("voteStatus");
const candidatesEl = document.getElementById("candidates");
const voteBtn = document.getElementById("voteBtn");
const resultEl = document.getElementById("result");
const successEl = document.getElementById("success");
const txLinkEl = document.getElementById("txLink");

let selectedId = null;

async function init() {
  if (!privateKeyHex) {
    statusEl.textContent = "Link tidak valid! Scan QR resmi.";
    statusEl.style.background = "#ffebee";
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
    setInterval(updateTimer, 1000);

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error: Link rusak atau kontrak error";
    statusEl.style.background = "#ffebee";
  }
}

async function loadCandidates() {
  const kandidat = await contract.getKandidat();
  candidatesEl.innerHTML = "";

  kandidat.forEach((nama, i) => {
    const btn = document.createElement("button");
    btn.className = "candidate-btn";
    btn.innerHTML = `<strong>${i + 1}. ${nama}</strong>`;
    btn.onclick = () => selectCandidate(i, btn);
    candidatesEl.appendChild(btn);
  });
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
  voteBtn.textContent = "Sedang memproses...";

  try {
    const nonce = await contract.noncePemilih(voterAddress);

    const domain = {
      name: "PilkadesVoting",
      version: "1",
      chainId: await provider.getNetwork().then(n => n.chainId),
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
    alert("Gagal vote: " + (err.message || "Coba lagi"));
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
  voteStatusEl.textContent = "Anda sudah memilih sebelumnya. Terima kasih!";
  voteStatusEl.style.color = "green";
  voteBtn.style.display = "none";
}

function showSuccess() {
  mainEl.style.display = "none";
  successEl.style.display = "block";
  txLinkEl.innerHTML = `Suara Anda tercatat di blockchain.<br>
    <a href="https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}" target="_blank">
      Lihat kontrak di Etherscan
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
      location.reload();
    }
  }).catch(() => timerEl.textContent = "--:--");
}

function startTimer() {
  updateTimer();
  setInterval(updateTimer, 1000);
}

// START

init();



