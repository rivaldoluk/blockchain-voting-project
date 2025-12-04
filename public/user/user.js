// public/user/user.js
// FINAL VERSION — SIAP DIPAKAI 10.000 WARGA DESA (2025/2026)

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS?.trim();
const RPC_URL          = import.meta.env.VITE_RPC_URL?.trim() || "https://rpc.sepolia.org";
const RELAYER_URL      = import.meta.env.VITE_RELAYER_URL?.trim();
const HASIL_URL        = import.meta.env.VITE_HASIL_URL?.trim();
const CHAIN_ID         = import.meta.env.VITE_SEPOLIA_CHAIN_ID || "0xaa36a7";

// Validasi wajib — kalau belum di-deploy langsung kasih tahu user
if (!CONTRACT_ADDRESS || !RELAYER_URL) {
  document.getElementById("status").textContent = "Error: Sistem belum siap. Hubungi panitia.";
  document.getElementById("status").style.background = "#ffebee";
  throw new Error("VITE_CONTRACT_ADDRESS atau VITE_RELAYER_URL belum di-set di Vercel!");
}

// Ethers v6 Provider & Contract
const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, [
  "function getKandidat() view returns (string[])",
  "function statusVoting() view returns (string)",
  "function getWaktuTersisa() view returns (uint256)",
  "function telahMemilih(address) view returns (bool)",
  "function noncePemilih(address) view returns (uint256)",
  "function totalKandidat() view returns (uint256)"
], provider);

// Ambil private key dari URL (?pk=...)
const urlParams = new URLSearchParams(window.location.search);
const privateKeyHex = urlParams.get("pk");

let wallet = null;
let voterAddress = null;
let selectedId = null;

// DOM Elements
const statusEl       = document.getElementById("status");
const loadingEl      = document.getElementById("loading");
const mainEl         = document.getElementById("main");
const timerEl        = document.getElementById("timer");
const voterAddressEl = document.getElementById("voterAddress");
const voteStatusEl   = document.getElementById("voteStatus");
const candidatesEl   = document.getElementById("candidates");
const voteBtn        = document.getElementById("voteBtn");
const successEl      = document.getElementById("success");
const contractLink   = document.getElementById("contractLink");

// Update link Etherscan otomatis
if (contractLink) {
  contractLink.href = `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`;
  contractLink.textContent = "Lihat kontrak di Sepolia Etherscan";
}

async function init() {
  if (!privateKeyHex || privateKeyHex.length !== 64) {
    statusEl.textContent = "Link tidak valid! Gunakan QR Code resmi dari panitia.";
    statusEl.style.background = "#ffebee";
    loadingEl.style.display = "none";
    return;
  }

  try {
    // Buat wallet dari private key di URL
    wallet = new ethers.Wallet("0x" + privateKeyHex);
    voterAddress = wallet.address;

    voterAddressEl.textContent = 
      voterAddress.slice(0, 8) + "..." + voterAddress.slice(-6);

    // Cek status voting & apakah sudah vote
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

    // Semua aman → tampilkan form voting
    loadingEl.style.display = "none";
    mainEl.style.display = "block";
    statusEl.textContent = "Voting Sedang Berlangsung";
    statusEl.style.background = "rgba(76, 175, 80, 0.2)";

    await loadCandidates();
    startTimer();

  } catch (err) {
    console.error("Init error:", err);
    statusEl.textContent = "Koneksi gagal. Coba lagi atau hubungi panitia.";
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
    candidatesEl.innerHTML = "<p style='color:red;text-align:center;'>Gagal memuat kandidat</p>";
  }
}

function selectCandidate(id, btn) {
  // Hapus selected dari semua
  document.querySelectorAll(".candidate-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  selectedId = id;

  // Update tombol vote
  const nama = btn.querySelector("strong").textContent.split(". ")[1];
  voteBtn.disabled = false;
  voteBtn.textContent = `Vote untuk ${nama}`;
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
      chainId: parseInt(CHAIN_ID, 16), // hex → decimal
      verifyingContract: CONTRACT_ADDRESS
    };

    const types = {
      Vote: [
        { name: "pemilih", type: "address" },
        { name: "kandidatId", type: "uint256" },
        { name: "nonce", type: "uint256" }
      ]
    };

    const value = {
      pemilih: voterAddress,
      kandidatId: selectedId,
      nonce: nonce
    };

    const signature = await wallet._signTypedData(domain, types, value);

    const response = await fetch(RELAYER_URL + "/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pemilih: voterAddress,
        kandidatId: selectedId,
        signature
      })
    });

    const data = await response.json();

    if (response.ok || data.message) {
      showSuccess();
    } else {
      throw new Error(data.error || "Gagal mengirim suara");
    }

  } catch (err) {
    console.error("Vote error:", err);
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
  voteStatusEl.textContent = "Anda sudah memilih sebelumnya. Terima kasih!";
  voteStatusEl.style.color = "#00c853";
  voteBtn.style.display = "none";
}

function showSuccess() {
  mainEl.style.display = "none";
  successEl.style.display = "block";
}

function updateTimer() {
  contract.getWaktuTersisa()
    .then(sisa => {
      if (sisa > 0) {
        const h = String(Math.floor(sisa / 3600)).padStart(2, '0');
        const m = String(Math.floor((sisa % 3600) / 60)).padStart(2, '0');
        const s = String(sisa % 60).padStart(2, '0');
        timerEl.textContent = `${h}:${m}:${s}`;
      } else {
        timerEl.textContent = "WAKTU HABIS";
        setTimeout(() => location.reload(), 3000);
      }
    })
    .catch(() => {
      timerEl.textContent = "--:--";
    });
}

function startTimer() {
  updateTimer();
  setInterval(updateTimer, 1000);
}

// JALAN!
init();
