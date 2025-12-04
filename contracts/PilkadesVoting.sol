// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract PilkadesVoting is EIP712 {
    address public immutable ketuaPanitia;
    uint256 public immutable totalKandidat;

    string[] private daftarKandidat;

    // === KEAMANAN & ANONIMITAS ===
    mapping(address => bool) private telahMemilih;        // Hanya tahu sudah/belum vote
    mapping(address => uint256) public noncePemilih;      // Anti-replay attack
    mapping(uint256 => uint256) private suaraKandidat;    // Hanya jumlah suara per kandidat

    uint256 public totalPemilih = 0;

    // === ROLE & RELAYER ===
    mapping(address => bool) public panitia;
    address public relayer;

    // === STATUS VOTING ===
    bool public votingDibuka = false;
    uint256 public waktuMulai = 0;
    uint256 public waktuSelesai = 0;

    // EIP-712 Type Hash
    bytes32 private constant _VOTE_TYPEHASH = 
        keccak256("Vote(address pemilih,uint256 kandidatId,uint256 nonce)");

    // === EVENTS (untuk transparansi publik) ===
    event VotingDibuka(uint256 mulai, uint256 selesai, uint256 durasi);
    event VotingSelesaiOtomatis(uint256 waktuSelesai);
    event SuaraMasuk(uint256 kandidatId, uint256 totalSuaraKandidat); // TIDAK ADA ADDRESS PEMILIH!
    event RelayerDiubah(address indexed relayerLama, address indexed relayerBaru);
    event PanitiaDitambahkan(address indexed akun);
    event PanitiaDihapus(address indexed akun);

    // === MODIFIERS ===
    modifier hanyaKetua() {
        require(msg.sender == ketuaPanitia, "Hanya ketua panitia");
        _;
    }

    modifier hanyaRelayer() {
        require(msg.sender == relayer, "Hanya relayer resmi");
        _;
    }

    modifier saatVotingBerlangsung() {
        if (votingDibuka && block.timestamp > waktuSelesai) {
            votingDibuka = false;
            emit VotingSelesaiOtomatis(waktuSelesai);
        }
        require(votingDibuka && block.timestamp <= waktuSelesai, "Voting tidak sedang berlangsung");
        _;
    }

    modifier votingBelumDimulai() {
        require(!votingDibuka, "Voting sudah dimulai");
        _;
    }

    // === CONSTRUCTOR ===
    constructor(
        string[] memory _kandidat,
        address _relayer
    ) EIP712("PilkadesVoting", "1") {
        uint256 len = _kandidat.length;
        require(len >= 2 && len <= 10, "Jumlah kandidat 2-10");
        require(_relayer != address(0), "Relayer tidak valid");

        ketuaPanitia = msg.sender;
        panitia[msg.sender] = true;
        relayer = _relayer;
        totalKandidat = len;

        // Simpan nama kandidat
        for (uint256 i = 0; i < len; i++) {
            daftarKandidat.push(_kandidat[i]);
        }

        emit RelayerDiubah(address(0), _relayer);
        emit PanitiaDitambahkan(msg.sender);
    }

    // === ADMIN: HANYA KETUA YANG BISA BUKA VOTING (SESUAI HUKUM) ===
    function bukaVoting(uint256 _durasiDetik) external hanyaKetua votingBelumDimulai {
        require(_durasiDetik >= 1 hours && _durasiDetik <= 7 days, "Durasi 1 jam - 7 hari");

        votingDibuka = true;
        waktuMulai = block.timestamp;
        waktuSelesai = block.timestamp + _durasiDetik;

        emit VotingDibuka(waktuMulai, waktuSelesai, _durasiDetik);
    }

    // === ADMIN: Ubah relayer (hanya ketua) ===
    function ubahRelayer(address _baru) external hanyaKetua {
        require(_baru != address(0), "Relayer tidak valid");
        address lama = relayer;
        relayer = _baru;
        emit RelayerDiubah(lama, _baru);
    }

    // === VOTE DENGAN TANDA TANGAN (EIP-712) - 100% ANONIM ===
    function voteDenganTandaTangan(
        address pemilih,
        uint256 kandidatId,
        bytes calldata signature
    ) external hanyaRelayer saatVotingBerlangsung {
        require(pemilih != relayer, "Relayer tidak boleh vote");
        require(!telahMemilih[pemilih], "Sudah memilih");
        require(kandidatId < totalKandidat, "Kandidat tidak valid");

        uint256 currentNonce = noncePemilih[pemilih];

        bytes32 structHash = keccak256(abi.encode(_VOTE_TYPEHASH, pemilih, kandidatId, currentNonce));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);

        require(signer == pemilih, "Tanda tangan tidak valid");

        // Update state
        telahMemilih[pemilih] = true;
        noncePemilih[pemilih]++;
        suaraKandidat[kandidatId]++;
        totalPemilih++;

        // Event: HANYA tampilkan kandidatId, TIDAK ADA address pemilih!
        emit SuaraMasuk(kandidatId, suaraKandidat[kandidatId]);
    }

    // === VIEW FUNCTIONS (untuk frontend & transparansi publik) ===
    function getKandidat() external view returns (string[] memory) {
        return daftarKandidat;
    }

    function getHasil() external view returns (uint256[] memory hasil) {
        hasil = new uint256[](totalKandidat);
        for (uint256 i = 0; i < totalKandidat; i++) {
            hasil[i] = suaraKandidat[i];
        }
    }

    function statusVoting() external view returns (string memory) {
        if (!votingDibuka) {
            return (waktuSelesai > 0 && block.timestamp > waktuSelesai) ? "Selesai" : "Belum Dibuka";
        }
        return block.timestamp > waktuSelesai ? "Selesai" : "Berlangsung";
    }

    function getWaktuTersisa() external view returns (uint256) {
        if (!votingDibuka || block.timestamp >= waktuSelesai) return 0;
        return waktuSelesai - block.timestamp;
    }

    function getTotalPemilih() external view returns (uint256) {
        return totalPemilih;
    }

    function sudahMemilih(address _user) external view returns (bool) {
        return telahMemilih[_user];
    }

    function getPemenang() external view returns (uint256 index, string memory nama, uint256 suara) {
        uint256 maxSuara = 0;
        index = 0;
        for (uint256 i = 0; i < totalKandidat; i++) {
            if (suaraKandidat[i] > maxSuara) {
                maxSuara = suaraKandidat[i];
                index = i;
            }
        }
        nama = daftarKandidat[index];
        suara = maxSuara;
    }

    // === Fallback ===
    receive() external payable {}
    fallback() external payable {}
}
