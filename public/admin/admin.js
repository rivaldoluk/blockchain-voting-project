// admin.js — VERSI FINAL 100% SESUAI GAMBAR (Horizontal Chart + Detail + Banner + Pemenang)
import config from '/public/config.js';
const { CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID, DURASI_6_JAM, RPC_URL } = config;

const ABI = [
    "function ketuaPanitia() view returns (address)",
    "function bukaVoting(uint256) external",
    "function statusVoting() view returns (string)",
    "function getTotalPemilih() view returns (uint256)",
    "function getWaktuTersisa() view returns (uint256)",
    "function getKandidat() view returns (string[])",
    "function getHasil() view returns (uint256[])",
    "function getPilihanPemilih(address) view returns (uint256)",
    "event SuaraMasuk(address indexed pemilih, uint256 kandidatId)"
];

// ==================== DOM ELEMENTS ====================
const $ = (id) => document.getElementById(id);
const elements = {
    login: $('login'), panel: $('panel'),
    connectBtn: $('connectBtn'), status: $('status'),
    adminAddr: $('adminAddr'), votingStatus: $('votingStatus'),
    totalPemilih: $('totalPemilih'), liveCounter: $('liveCounter'),
    timer: $('timer'), stickyTimer: $('stickyTimer'), stickyCounter: $('stickyCounter'),
    stickyStatus: $('stickyStatus'),
    votingOpenedBanner: $('votingOpenedBanner'),

    // TAMBAH INI 4 BARIS — INI YANG HILANG!
    pemenangSection: $('pemenangSection'),
    winnerHeader: $('winnerHeader'),
    namaPemenang: $('namaPemenang'),
    suaraPemenang: $('suaraPemenang'),

    bukaVotingBtn: $('bukaVotingBtn'),
    voteDetailGrid: $('voteDetailGrid'),
    totalVotersCount: $('totalVotersCount'), updateTime: $('updateTime'),
    searchInput: $('searchInput'), votersTableBody: $('votersTableBody'),
    pageInfo: $('pageInfo'), prevBtn: $('prevBtn'), nextBtn: $('nextBtn'),
    pagination: $('pagination'),
    stickyRefresh: $('stickyRefresh'),
    scrollTopBtn: $('scrollTopBtn'), pageSizeSelect: $('pageSizeSelect'),
    kandidatFilter: $('kandidatFilter'), themeToggle: $('themeToggle'),
    connectionStatus: $('connectionStatus'), walletLockedWarning: $('walletLockedWarning'),
    loadingOverlay: $('loadingOverlay'), loadingText: $('loadingText'),
    activityList: $('activityList'), toastContainer: $('toastContainer'),

    copyAllBtn: $('copyAllBtn'),
    totalCount: $('totalCount'),
    exportCSV: $('exportCSV'),
    exportPDF: $('exportPDF')
};

// ==================== STATE ====================
let provider, signer, contract, account;
let allVoters = [], filteredVoters = [], kandidatNames = [], hasilSuara = [];
let currentPage = 1, itemsPerPage = 25, totalPages = 1;
let votingEndTime = 0, timerInterval = null, liveClockInterval = null;
let chartInstance = null;
if (!window.pendingVoters) window.pendingVoters = new Set();

// Warna kandidat (sesuai CSS --c1 sampai --c4)
const kandidatColors = ['#a78bfa', '#f783ac', '#fb923c', '#34d399'];

// ==================== UTILITIES ====================
const showLoading = (text = "Memuat data...") => {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.style.display = "flex";
};
const hideLoading = () => elements.loadingOverlay.style.display = "none";

const voteSound = document.getElementById("voteSound");

const toast = (message, type = "success", options = {}) => {
    const { isVote = false } = options; // true hanya untuk suara masuk

    // Mainkan suara hanya kalau isVote = true
    if (isVote && voteSound) {
        voteSound.currentTime = 0;
        voteSound.play().catch(() => { });
    }

    const t = document.createElement("div");

    // Kalau toast suara masuk → pakai desain khusus
    if (isVote) {
        t.className = "toast vote-toast-big";
        t.innerHTML = `
            <div style="display:flex;align-items:center;gap:16px;">
                <i class="fas fa-vote-yea" style="font-size:28px;animation:pulse 1s infinite;"></i>
                <div>
                    <strong style="font-size:22px;display:block;">SUARA MASUK!</strong>
                    <span style="font-size:16px;opacity:0.95;">${message}</span>
                </div>
            </div>
        `;
    } else {
        // Toast biasa (login, error, info)
        t.className = `toast toast-normal ${type}`;
        t.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
    }

    elements.toastContainer.appendChild(t);

    // Animasi masuk
    setTimeout(() => t.style.opacity = "1", 10);

    // Hapus otomatis
    setTimeout(() => {
        t.style.opacity = "0";
        t.style.transform = isVote ? "translateY(100px)" : "translateY(-20px)";
        setTimeout(() => t.remove(), 600);
    }, isVote ? 4500 : 3000);
};

const logActivity = (msg) => {
    const time = formatTimeID();
    const entry = `<div>[${time}] ${msg}</div>`;
    elements.activityList.innerHTML += entry;
    const logs = JSON.parse(localStorage.getItem("adminLogs") || "[]");
    logs.push({ time: Date.now(), msg });
    if (logs.length > 100) logs.shift();
    localStorage.setItem("adminLogs", JSON.stringify(logs));
};

// ==================== MODAL KONFIRMASI ====================
function showModal(title, message, onConfirm) {
    const modal = $('modal');
    const modalTitle = $('modalTitle');
    const modalMessage = $('modalMessage');
    const modalCancel = $('modalCancel');
    const modalConfirm = $('modalConfirm');

    modalTitle.textContent = title;
    modalMessage.innerHTML = `<p style="margin:16px 0; line-height:1.6;">${message}</p>`;

    const closeModal = () => {
        modal.style.display = "none";
        modalCancel.onclick = null;
        modalConfirm.onclick = null;
        document.removeEventListener('keydown', escHandler);
    };

    const escHandler = (e) => {
        if (e.key === "Escape") closeModal();
    };

    modalCancel.onclick = closeModal;
    modalConfirm.onclick = async () => {
        closeModal();
        if (onConfirm) await onConfirm();
    };

    document.addEventListener('keydown', escHandler);
    modal.style.display = "flex";
    modalConfirm.focus();
}

// ==================== CONNECTION STATUS ====================
const updateConnectionStatus = (status, text) => {
    const dot = elements.connectionStatus.querySelector('.status-dot');
    const txt = elements.connectionStatus.querySelector('.status-text');

    // status bisa: "online" | "waiting" | "offline"
    if (dot) dot.dataset.status = status;
    if (txt) txt.textContent = text;
};

// ==================== FORMAT WAKTU INDONESIA (PAKAI TITIK DUA) ====================
const formatTimeID = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
};

// ==================== LIVE CLOCK ====================
function startLiveClock() {
    clearInterval(liveClockInterval);
    liveClockInterval = setInterval(() => {
        elements.updateTime.textContent = `Update: ${formatTimeID()}`;
    }, 1000);
}

// ==================== CHART.JS — HORIZONTAL BAR ====================
const initChart = () => {
    const ctx = $('voteChart');

    // HAPUS CHART LAMA KALAU SUDAH ADA
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: kandidatNames,
            datasets: [{
                label: 'Suara',
                data: hasilSuara,
                backgroundColor: kandidatColors.map(c => c + 'cc'),
                borderColor: kandidatColors,
                borderWidth: 2,
                borderRadius: 8,
                barThickness: 32,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `${ctx.raw} suara` } }
            },
            animation: { duration: 1200, easing: 'easeOutQuart' },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: '#334155' } },
                y: { grid: { display: false }, ticks: { color: '#e2e8f0', font: { size: 14, weight: '600' } } }
            }
        }
    });
};

const updateChart = () => {
    if (chartInstance) {
        chartInstance.data.labels = kandidatNames;
        chartInstance.data.datasets[0].data = hasilSuara;
        chartInstance.update('active');
    }
};

// ==================== DETAIL SUARA + PROGRESS BAR ====================
const renderVoteDetails = () => {
    const totalSuara = hasilSuara.reduce((a, b) => a + b, 0);
    if (totalSuara === 0) {
        elements.voteDetailGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#94a3b8;margin:30px 0;">Belum ada suara masuk</p>';
        return;
    }

    const sorted = kandidatNames.map((name, i) => ({
        name, votes: hasilSuara[i], color: kandidatColors[i]
    })).sort((a, b) => b.votes - a.votes);

    elements.voteDetailGrid.innerHTML = sorted.map((k, idx) => {
        const percent = ((k.votes / totalSuara) * 100).toFixed(1);
        return `
      <div class="vote-detail-item">
        <div class="vote-detail-rank">${idx + 1}.</div>
        <div class="vote-detail-info">
          <h4>${k.name}</h4>
          <p>${k.votes} suara (${percent}%)</p>
        </div>
        <div class="vote-detail-bar">
          <div class="vote-detail-progress" style="width:${percent}%;background:linear-gradient(90deg,${k.color},${k.color}dd);" data-percent="${percent}%"></div>
        </div>
      </div>
    `;
    }).join('');
};

// ==================== FULL REFRESH ====================
async function fullRefresh(silent = false) {
    if (!silent) showLoading("Mengambil data blockchain...");
    try {
        const [status, totalPemilih, kandidat, hasilRaw, waktuTersisa] = await Promise.all([
            contract.statusVoting(),
            contract.getTotalPemilih(),
            contract.getKandidat(),
            contract.getHasil(),
            contract.getWaktuTersisa()
        ]);

        kandidatNames = kandidat;
        hasilSuara = hasilRaw.map(v => Number(v));
        const totalSuara = hasilSuara.reduce((a, b) => a + b, 0);

        // Sticky Panel
        elements.stickyStatus.textContent = status;
        elements.stickyCounter.textContent = totalSuara;
        elements.liveCounter.textContent = totalSuara;
        elements.totalPemilih.textContent = totalPemilih;
        elements.votingStatus.textContent = status === "Berlangsung" ? "BERLANGSUNG" : status === "Selesai" ? "SELESAI" : "BELUM DIBUKA";

        const btn = elements.bukaVotingBtn;

        if (status === "Belum dibuka") {
            btn.textContent = "Buka Voting";
            btn.disabled = false;
            btn.className = "btn btn-action full-width"; // merah aktif
        }
        else if (status === "Berlangsung") {
            btn.textContent = "Voting Sedang Berlangsung";
            btn.disabled = true;
            btn.className = "btn btn-success full-width"; // hijau
        }
        else if (status === "Selesai") {
            btn.textContent = "Voting Telah Selesai";
            btn.disabled = true;
            btn.className = "btn btn-secondary full-width"; // abu-abu
        }

        btn.style.display = "flex";

        // Timer
        if (status === "Berlangsung") {
            votingEndTime = Math.floor(Date.now() / 1000) + Number(waktuTersisa);
            startRealTimeTimer();
        } else {
            clearInterval(timerInterval);
            elements.timer.textContent = elements.stickyTimer.textContent = status === "Selesai" ? "WAKTU HABIS!" : "00:00:00";
        }

        // Pemenang Resmi / Sementara
        if (totalSuara > 0) {
            const max = Math.max(...hasilSuara);
            const winners = kandidatNames.map((n, i) => ({ name: n, votes: hasilSuara[i] })).filter(w => w.votes === max);

            elements.pemenangSection.style.display = "block";

            if (status === "Selesai") {
                elements.winnerHeader.textContent = "PEMENANG RESMI";
                elements.pemenangSection.className = "winner-section";
            } else if (status === "Berlangsung") {
                elements.winnerHeader.textContent = "Unggul Sementara";
                elements.pemenangSection.className = "winner-section temporary-winner";
            } else {
                elements.winnerHeader.textContent = "Pemungutan Suara Belum Dimulai";
            }

            elements.pemenangSection.style.display = totalSuara > 0 ? "block" : "none";
            elements.winnerHeader.textContent = status === "Selesai" ? "PEMENANG RESMI" : "Unggul Sementara";

            const container = document.getElementById("dynamicWinnersContainer");
            container.innerHTML = ""; // kosongin dulu

            if (winners.length === 0) return;

            winners.forEach((winner, index) => {
                const kandidatIndex = kandidatNames.indexOf(winner.name);
                const warna = kandidatColors[kandidatIndex] || "#94a3b8";

                const kotak = document.createElement("div");
                kotak.className = "dynamic-winner-card";
                kotak.style.background = `linear-gradient(135deg, ${warna}, ${warna}ee)`;
                kotak.style.boxShadow = `0 15px 35px ${warna}40`;
                kotak.innerHTML = `
                    <div class="winner-rank">#${index + 1}</div>
                    <div class="winner-name-dynamic">${winner.name}</div>
                    <div class="winner-votes-dynamic">${winner.votes} suara</div>
                    ${winners.length > 1 ? '<div class="seri-badge">SERI</div>' : ''}
                `;

                // Animasi masuk smooth
                kotak.style.opacity = "0";
                kotak.style.transform = "translateY(30px)";
                container.appendChild(kotak);

                setTimeout(() => {
                    kotak.style.transition = "all 0.6s ease";
                    kotak.style.opacity = "1";
                    kotak.style.transform = "translateY(0)";
                }, index * 200);
            });

            // Update header warna kalau cuma 1 pemenang
            if (winners.length === 1) {
                const warnaUtama = kandidatColors[kandidatNames.indexOf(winners[0].name)];
                elements.winnerHeader.style.background = `linear-gradient(135deg, ${warnaUtama}, ${warnaUtama}cc)`;
            } else {
                elements.winnerHeader.style.background = "linear-gradient(135deg, #7c3aed, #ec4899)";
            }
        } else {
            elements.pemenangSection.style.display = "none";
        }

        /// Update Chart + Detail Suara
        if (chartInstance) {
            updateChart();  // Cukup update data
        } else {
            initChart();    // Buat baru kalau belum ada
        }
        renderVoteDetails();
        renderVoters();

        // Filter kandidat
        elements.kandidatFilter.innerHTML = `<option value="">Semua Pemilih</option>` +
            kandidatNames.map((n, i) => `<option value="${i}">${n}</option>`).join('');

        renderVoters();
        updateConnectionStatus("online", "Terhubung");
    } catch (err) {
        console.error(err);
        toast("Gagal refresh: " + (err.reason || err.message || err), "error");
        updateConnectionStatus("offline", "Error");
    } finally {
        if (!silent) hideLoading();
    }
}

// ==================== REALTIME LISTENER ====================
function startRealtimeListener() {
    if (!window.pendingVoters) window.pendingVoters = new Set();
    if (!window.voterChoicesMap) window.voterChoicesMap = new Map();

    contract.on("SuaraMasuk", async (pemilih, kandidatId, event) => {
        pemilih = ethers.utils.getAddress(pemilih).toLowerCase();
        const id = Number(kandidatId);
        const namaKandidat = id < kandidatNames.length ? kandidatNames[id] : "Unknown";

        // === 1. LANGSUNG TAMBAH KE PENDING (MUNCUL <1 DETIK) ===
        window.pendingVoters.add(pemilih);
        window.voterChoicesMap.set(pemilih, namaKandidat);

        if (!allVoters.some(a => a.toLowerCase() === pemilih)) {
            allVoters = [ethers.utils.getAddress(pemilih), ...allVoters];
            filteredVoters = [...allVoters];
            elements.totalVotersCount.textContent = allVoters.length;
        }

        currentPage = 1;
        renderVoters();

        // TOAST KUNING (PENTING!)
        toast(`${pemilih.slice(0, 10)}... sedang mengirim suara...`, "warning");

        // === 2. TUNGGU CONFIRM + DELAY BUATAN 9 DETIK (BIAR KELIATAN LAMA!) ===
        try {
            await provider.waitForTransaction(event.transactionHash);

            // DELAY BUATAN — INI YANG BIKIN ORANG YAKIN!
            await new Promise(resolve => setTimeout(resolve, 9000)); // 9 detik

            // Setelah delay 9 detik
            const receipt = await provider.getTransactionReceipt(event.transactionHash);
            if (receipt && receipt.blockNumber) {
                const block = await provider.getBlock(receipt.blockNumber);
                if (block && block.timestamp) {
                    if (!window.voterTimeMap) window.voterTimeMap = new Map();
                    window.voterTimeMap.set(pemilih, block.timestamp);
                    renderVoters(); // update waktu langsung
                }
            }

            // Baru sekarang jadi Success + DING!
            window.pendingVoters.delete(pemilih);
            renderVoters();

            toast(
                `${pemilih.slice(0, 10)}... memilih <strong style="color:#34d399;">${namaKandidat}</strong>`,
                "success",
                { isVote: true }
            );
            renderVoters();
            await fullRefresh(true);
            logActivity(`Suara CONFIRMED → ${namaKandidat}`);

        } catch (err) {
            window.pendingVoters.delete(pemilih);
            renderVoters();
            toast("Transaksi gagal / dibatalkan", "error");
        }
    });
}

// ==================== TIMER ====================
function startRealTimeTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const sisa = votingEndTime - Math.floor(Date.now() / 1000);
        if (sisa <= 0) {
            elements.timer.textContent = elements.stickyTimer.textContent = "WAKTU HABIS!";
            clearInterval(timerInterval);
            fullRefresh();
            return;
        }
        const h = String(Math.floor(sisa / 3600)).padStart(2, '0');
        const m = String(Math.floor((sisa % 3600) / 60)).padStart(2, '0');
        const s = String(sisa % 60).padStart(2, '0');
        elements.timer.textContent = elements.stickyTimer.textContent = `${h}:${m}:${s}`;
    }, 1000);
}

// ==================== FORMAT WAKTU ALA ETHERSCAN ====================
const formatWaktuVoting = (timestamp) => {
    if (!timestamp) return "−";

    const sekarang = Math.floor(Date.now() / 1000);
    const selisih = sekarang - timestamp;

    if (selisih < 30) return "Baru saja";
    if (selisih < 90) return "1 menit lalu";
    if (selisih < 3300) return `${Math.floor(selisih / 60)} menit lalu`;
    if (selisih < 5400) return "1 jam lalu";
    if (selisih < 79200) return `${Math.floor(selisih / 3600)} jam lalu`;
    if (selisih < 172800) return "Kemarin";

    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
};

// ==================== VOTER LIST — VERSI ETHERSCAN STYLE ====================
async function renderVoters() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const page = filteredVoters.slice(start, end);

    if (page.length === 0) {
        elements.votersTableBody.innerHTML = `
            <tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:60px 0;font-size:15px;">
                Belum ada pemilih yang memberikan suara
            </td></tr>`;
        elements.pagination.style.display = "none";
        return;
    }

    const rows = page.map((addr, idx) => {
        const addrLower = addr.toLowerCase();
        const namaKandidat = window.voterChoicesMap?.get(addrLower) || "-";
        const isPending = window.pendingVoters?.has(addrLower);
        const timestamp = window.voterTimeMap?.get(addrLower);

        const waktuAgo = formatWaktuVoting(timestamp);
        const waktuFull = timestamp
            ? new Date(timestamp * 1000).toLocaleString('id-ID', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).replace(/\./g, ':')
            : "−";

        const statusHTML = isPending
            ? `<span style="color:#f59e0b;font-weight:700;"><i class="fas fa-hourglass-half"></i> Pending</span>`
            : `<span style="color:#10b981;font-weight:700;"><i class="fas fa-check-circle"></i> Success</span>`;

        return `
            <tr data-address="${addrLower}">
                <td>${start + idx + 1}</td>
                <td class="address-cell">
                <div class="etherscan-container">
                    <!-- Address + tooltip sendiri -->
                    <div class="addr-wrapper">
                    <span class="addr-short">
                        ${addr.slice(0, 10)}...${addr.slice(-8)}
                    </span>
                    <div class="tooltip tooltip-address">
                        <div class="tooltip-arrow"></div>
                        <div class="tooltip-content">${addr}</div>
                    </div>
                    </div>

                    <!-- Tombol Copy + tooltip sendiri -->
                    <div class="copy-wrapper">
                    <button class="copy-trigger" data-addr="${addr}">
                        <i class="fas fa-copy"></i>
                    </button>
                    <div class="tooltip tooltip-copy">
                        <div class="tooltip-arrow"></div>
                        <div class="tooltip-content">
                        <span class="copy-tooltip-text">Copy Address</span>
                        </div>
                    </div>
                    </div>
                </div>
                </td>
                <td><strong style="color:#a78bfa;">${namaKandidat}</strong></td>
                <td class="waktu-cell">
                    <span class="time-ago-wrapper" title="">
                        <span class="time-ago">${waktuAgo}</span>
                        <div class="tooltip">
                            <div class="tooltip-arrow"></div>
                            <div class="tooltip-content">${waktuFull}</div>
                        </div>
                    </span>
                </td>
                <td>${statusHTML}</td>
            </tr>`;
    });

    elements.votersTableBody.innerHTML = rows.join("");
    totalPages = Math.ceil(filteredVoters.length / itemsPerPage);
    elements.pageInfo.textContent = `Hal ${currentPage} / ${totalPages}`;
    elements.prevBtn.disabled = currentPage === 1;
    elements.nextBtn.disabled = currentPage === totalPages;
    elements.pagination.style.display = totalPages > 1 ? "flex" : "none";
}

document.addEventListener('click', e => {
    const btn = e.target.closest('.copy-trigger');
    if (!btn) return;

    const addr = btn.dataset.addr;
    navigator.clipboard.writeText(addr);
    toast('Address disalin!', 'success');

    btn.classList.add('copied');

    setTimeout(() => {
        btn.classList.remove('copied');
    }, 1800);
});

// ==================== FILTERS ====================
const applyFilters = () => {
    let list = [...allVoters];
    const q = elements.searchInput.value.trim().toLowerCase();
    const kandidatId = elements.kandidatFilter.value;

    // Filter berdasarkan search address
    if (q) {
        list = list.filter(addr => addr.toLowerCase().includes(q));
    }

    // Filter berdasarkan kandidat yang dipilih
    if (kandidatId !== "") {
        const id = parseInt(kandidatId);
        list = list.filter(addr => {
            const choice = window.voterChoicesMap?.get(addr.toLowerCase());
            if (!choice) return false;
            return kandidatNames.indexOf(choice) === id;
        });
    }

    filteredVoters = list;
    elements.totalVotersCount.textContent = filteredVoters.length;
    currentPage = 1;
    renderVoters();
};

elements.searchInput.addEventListener('input', applyFilters);
elements.kandidatFilter.addEventListener('change', applyFilters);
elements.pageSizeSelect.addEventListener('change', e => {
    itemsPerPage = Number(e.target.value);
    currentPage = 1;
    renderVoters();
});
elements.prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderVoters(); } };
elements.nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderVoters(); } };

// ==================== CONNECT WALLET ====================
elements.connectBtn.onclick = async () => {
    if (!window.ethereum) return toast("MetaMask tidak terdeteksi!", "error");

    try {
        elements.connectBtn.disabled = true;
        elements.connectBtn.innerHTML = "Menghubungkan...";
        showLoading("Meminta izin MetaMask...");

        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        signer = provider.getSigner();
        account = await signer.getAddress();

        const network = await provider.getNetwork();
        if ('0x' + network.chainId.toString(16) !== SEPOLIA_CHAIN_ID) {
            try {
                await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_CHAIN_ID }] });
            } catch (e) {
                if (e.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{ chainId: SEPOLIA_CHAIN_ID, chainName: 'Sepolia Testnet', rpcUrls: [RPC_URL], nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 }, blockExplorerUrls: ['https://sepolia.etherscan.io'] }]
                    });
                } else throw e;
            }
        }

        contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
        const ketua = await contract.ketuaPanitia();
        if (account.toLowerCase() !== ketua.toLowerCase()) {
            throw new Error(`Bukan Ketua Panitia!\nKetua: ${ketua}\nKamu: ${account}`);
        }

        elements.login.style.display = "none";
        elements.panel.style.display = "block";
        elements.adminAddr.textContent = `${account.slice(0, 10)}...${account.slice(-8)}`;
        toast("Login berhasil sebagai Ketua Panitia!", "normal");
        logActivity("Login berhasil");

        await fullRefresh();
        await loadAllVotersFromLogs();
        startRealtimeListener();
        startRealTimeTimer();
        startLiveClock();
        initChart();

        const saved = JSON.parse(localStorage.getItem("adminLogs") || "[]");
        elements.activityList.innerHTML = saved.map(l => `<div>[${new Date(l.time).toLocaleTimeString('id-ID')}] ${l.msg}</div>`).join("");

    } catch (err) {
        console.error(err);
        toast(err.message || "Gagal connect", "error");
    } finally {
        hideLoading();
        elements.connectBtn.disabled = false;
        elements.connectBtn.innerHTML = '<i class="fas fa-wallet"></i> Connect MetaMask (Ketua Panitia)';
    }
};

// ==================== ACCOUNT & CHAIN CHANGE ====================
window.ethereum?.on('accountsChanged', (accs) => {
    if (accs.length === 0) {
        elements.walletLockedWarning.style.display = "block";
        toast("MetaMask terkunci!", "warning");
    } else if (accs[0] !== account) {
        location.reload();
    }
});
window.ethereum?.on('chainChanged', () => location.reload());

// TAMBAHKAN INI — FUNGSI UNTUK LOAD SEMUA PEMILIH DARI LOG
async function loadAllVotersFromLogs() {
    if (!provider || !contract) return;

    try {
        showLoading("Memuat pemilih + pilihan kandidat dari blockchain...");

        // Ambil semua log event SuaraMasuk
        const logs = await provider.getLogs({
            fromBlock: 0,
            address: CONTRACT_ADDRESS,
            topics: [ethers.utils.id("SuaraMasuk(address,uint256)")]
        });

        // Pastikan kandidatNames sudah ada
        if (kandidatNames.length === 0) {
            kandidatNames = await contract.getKandidat();
        }

        const voterChoices = new Map(); // address -> nama kandidat
        const votersSet = new Set();

        logs.forEach(log => {
            try {
                const pemilih = ethers.utils.getAddress("0x" + log.topics[1].slice(-40));

                let kandidatId;
                if (log.data && log.data !== "0x") {
                    kandidatId = parseInt(log.data, 16);
                } else {
                    kandidatId = log.topics[2] ? parseInt(log.topics[2], 16) : 999;
                }

                const namaKandidat = (kandidatId < kandidatNames.length && kandidatId >= 0)
                    ? kandidatNames[kandidatId]
                    : `Invalid (${kandidatId})`;

                voterChoices.set(pemilih.toLowerCase(), namaKandidat);
                votersSet.add(pemilih);

                // TAMBAH WAKTU VOTING DARI BLOCKCHAIN
                if (!window.voterTimeMap) window.voterTimeMap = new Map();
                if (log.blockNumber) {
                    // Simpan timestamp block (nanti di-convert jadi tanggal)
                    provider.getBlock(log.blockNumber).then(block => {
                        if (block && block.timestamp) {
                            window.voterTimeMap.set(pemilih.toLowerCase(), block.timestamp);
                            // Update tabel langsung kalau sudah ter-load
                            if (elements.panel.style.display !== "none") renderVoters();
                        }
                    }).catch(() => { });
                }

            } catch (err) {
                console.warn("Error parsing log:", log, err);
            }
        });

        // Update global state
        allVoters = Array.from(votersSet);
        filteredVoters = [...allVoters];
        window.voterChoicesMap = voterChoices;

        elements.totalVotersCount.textContent = allVoters.length;
        currentPage = 1;
        renderVoters();

        //toast(`Berhasil load ${allVoters.length} pemilih + pilihan kandidat!`, "success");
        logActivity(`Loaded ${allVoters.length} voters dari event log`);

    } catch (err) {
        console.error("Gagal load voters:", err);
        toast("Gagal memuat data pemilih. Coba refresh.", "error");
    } finally {
        hideLoading();
    }
}

// ==================== BUKA VOTING ====================
elements.bukaVotingBtn.onclick = () => {
    if (elements.bukaVotingBtn.disabled) return;

    // Pastikan fungsi showModal ada
    if (typeof showModal !== "function") {
        if (confirm("Yakin buka voting 6 jam? (Tidak bisa dibatalkan)")) {
            bukaVotingLangsung();
        }
        return;
    }

    showModal("Buka Voting 6 Jam?", "Setelah dibuka, voting <strong>tidak bisa dibatalkan</strong> dan akan berjalan selama <strong>6 jam</strong>.", bukaVotingLangsung);
};

async function bukaVotingLangsung() {
    showLoading("Membuka voting di blockchain...");
    try {
        const tx = await contract.bukaVoting(DURASI_6_JAM);
        toast(`Transaksi terkirim: ${tx.hash.slice(0, 10)}...`, "success");
        logActivity(`Tx buka voting: ${tx.hash}`);
        await tx.wait();
        toast("VOTING BERHASIL DIBUKA!", "normal");
        logActivity("Voting dibuka!");
        await fullRefresh();
    } catch (err) {
        console.error(err);
        toast("Gagal buka voting: " + (err.reason || err.message || "Unknown error"), "error");
        logActivity("Gagal buka voting");
    } finally {
        hideLoading();
    }
}

// ==================== REFRESH & SCROLL ====================
elements.stickyRefresh.onclick = () => fullRefresh();
elements.scrollTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
window.addEventListener('scroll', () => {
    elements.scrollTopBtn.style.display = window.scrollY > 500 ? "block" : "none";
});

// ==================== INIT ====================
document.querySelector('.container').style.opacity = '1';

if (!window.ethereum) {
    updateConnectionStatus("offline", "MetaMask tidak terdeteksi");
    toast("MetaMask tidak terdeteksi! Install dulu ya", "error");
} else {
    updateConnectionStatus("waiting", "Menunggu koneksi...");
    toast("Admin Panel siap! Connect MetaMask untuk mulai.", "info");
}

startLiveClock();

function updateCopyCount() {
    const el = document.getElementById("totalCount");
    if (el) el.textContent = allVoters.length;
}

const updateCountEverywhere = () => {
    elements.totalVotersCount.textContent = allVoters.length;
    updateCopyCount();
};

updateCountEverywhere();

// Total count update tiap detik (cepet banget keliatan naik)
setInterval(() => {
    const el = document.getElementById("totalCount");
    if (el) el.textContent = allVoters.length;
}, 1000);

// Waktu relatif update tiap 30 detik (mirip Etherscan)
setInterval(() => {
    if (allVoters.length > 0 && elements.panel?.style.display !== "none") {
        renderVoters();
    }
}, 30000);

// ==================== COPY SEMUA ADDRESS ====================
elements.copyAllBtn.onclick = () => {
    if (allVoters.length === 0) {
        return toast("Belum ada pemilih yang voting!", "error");
    }

    const text = allVoters.join("\n");

    navigator.clipboard.writeText(text)
        .then(() => {
            toast(`Berhasil copy ${allVoters.length} address!`, "success");
        })
        .catch(err => {
            console.error("Copy gagal:", err);
            // Fallback untuk browser lama
            const textarea = document.createElement("textarea");
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            toast(`Berhasil copy ${allVoters.length} address! (fallback)`, "success");
        });
};

// ==================== EXPORT CSV LENGKAP ====================
elements.exportCSV.onclick = async () => {
    if (allVoters.length === 0) return toast("Belum ada data!", "error");

    showLoading("Membuat CSV...");

    let csv = "No,Address,Memilih,Waktu Voting,Status\n";

    allVoters.forEach((addr, i) => {
        const lower = addr.toLowerCase();
        const nama = window.voterChoicesMap?.get(lower) || "-";
        const status = window.pendingVoters?.has(lower) ? "Pending" : "Success";

        // FORMAT: 2025-11-10 10:27:00
        const timestamp = window.voterTimeMap?.get(lower);
        const waktuVoting = timestamp
            ? new Date(timestamp * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace('T', ' ').slice(0, 19)
            : "-";

        csv += `${i + 1},${addr},${nama},${waktuVoting},${status}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PILKADES_2025_HASIL_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    hideLoading();
    toast("CSV berhasil di-download!", "success");
};

// ==================== EXPORT PDF ====================
elements.exportPDF.onclick = () => {
    if (allVoters.length === 0) return toast("Belum ada data!", "error");
    if (!window.pdfLibsReady) {
        toast("PDF masih loading... tunggu 5 detik lalu klik lagi", "warning");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "mm", "a4");

    const rows = allVoters.map((addr, i) => {
        const lower = addr.toLowerCase();
        const nama = window.voterChoicesMap?.get(lower) || "-";
        const status = window.pendingVoters?.has(lower) ? "Pending" : "Success";

        // FORMAT: 2025-11-10 10:27:00
        const timestamp = window.voterTimeMap?.get(lower);
        const waktuVoting = timestamp
            ? new Date(timestamp * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace('T', ' ').slice(0, 19)
            : "-";

        return [i + 1, addr, nama, waktuVoting, status];
    });

    doc.setFontSize(20);
    doc.text("HASIL VOTING PILKADES 2025", 148, 20, { align: "center" });
    doc.setFontSize(11);
    doc.text(`Total: ${allVoters.length} pemilih • ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`, 148, 30, { align: "center" });

    doc.autoTable({
        head: [["No", "Address", "Kandidat", "Time", "Status"]],
        body: rows,
        startY: 40,
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
        styles: { fontSize: 9 },
        columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 110 },
            2: { cellWidth: 70 },
            3: { cellWidth: 50 },
        }
    });

    doc.save(`Pilkades2025_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast("PDF berhasil di-download!", "success");
};

// Load jsPDF
(function () {
    window.pdfLibsReady = false;  // <— ini yang penting

    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js';
        s2.onload = () => {
            window.pdfLibsReady = true;  // <— jadi true kalau sudah selesai
            console.log("PDF library 100% siap!");
        };
        document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
})();