// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract PilkadesVoting is EIP712 {
    address public immutable ketuaPanitia;
    uint256 public immutable totalKandidat;
    uint256 public totalPemilih = 0;

    string[] private daftarKandidat;

    // Keamanan voting
    mapping(address => bool) private telahMemilih;
    mapping(address => uint256) public noncePemilih;        // anti-replay
    mapping(uint256 => uint256) private suaraKandidat;

    // Role
    mapping(address => bool) public panitia;
    address public relayer;

    // Status voting
    bool public votingDibuka = false;
    uint256 public waktuMulai;
    uint256 public waktuSelesai;

    // EIP-712 type hash
    bytes32 private constant _VOTE_TYPEHASH = 
        keccak256("Vote(address pemilih,uint256 kandidatId,uint256 nonce)");

    // === EVENT ===
    event VotingDibuka(uint256 mulai, uint256 selesai);
    event VotingSelesaiOtomatis(uint256 waktuSelesai);
    event SuaraMasuk(address indexed pemilih, uint256 kandidatId);
    event PemilihTercatat(address indexed pemilih);                    // untuk audit
    event KandidatTerdaftar(string nama, uint256 index);
    event PanitiaDitambahkan(address indexed akun);
    event PanitiaDihapus(address indexed akun);
    event RelayerDiubah(address indexed relayerLama, address indexed relayerBaru);

    // === MODIFIER ===
    modifier hanyaPanitia() {
        require(panitia[msg.sender], "Hanya panitia");
        _;
    }

    modifier hanyaRelayer() {
        require(msg.sender == relayer, "Hanya relayer");
        _;
    }

    modifier hanyaKetua() {
        require(msg.sender == ketuaPanitia, "Hanya ketua panitia");
        _;
    }

    modifier saatVotingBerlangsung() {
        _autoTutup();
        require(votingDibuka, "Voting belum dibuka atau sudah selesai");
        require(block.timestamp <= waktuSelesai, "Waktu voting habis");
        _;
    }

    modifier votingBelumBerlangsung() {
        require(!votingDibuka, "Tidak boleh saat voting berlangsung");
        _;
    }

    // === INTERNAL ===
    function _autoTutup() internal {
        if (votingDibuka && block.timestamp > waktuSelesai) {
            votingDibuka = false;
            emit VotingSelesaiOtomatis(waktuSelesai);
        }
    }

    // === CONSTRUCTOR ===
    constructor(
        string[] memory _kandidat,
        address _relayer
    ) EIP712("PilkadesVoting", "1") {
        uint256 len = _kandidat.length;
        require(len >= 2 && len <= 10, "Kandidat: 2-10");
        require(_relayer != address(0), "Relayer tidak boleh nol");

        ketuaPanitia = msg.sender;
        panitia[msg.sender] = true;
        relayer = _relayer;
        totalKandidat = len;
        daftarKandidat = _kandidat;

        for (uint256 i = 0; i < len; i++) {
            emit KandidatTerdaftar(_kandidat[i], i);
        }
        emit PanitiaDitambahkan(msg.sender);
        emit RelayerDiubah(address(0), _relayer);
    }

    // === ADMIN FUNCTION ===
    function ubahRelayer(address _relayerBaru) external hanyaKetua {
        require(_relayerBaru != address(0), "Relayer nol");
        address lama = relayer;
        relayer = _relayerBaru;
        emit RelayerDiubah(lama, _relayerBaru);
    }

    function tambahPanitia(address _akun) external hanyaKetua {
        require(_akun != address(0), "Alamat nol");
        panitia[_akun] = true;
        emit PanitiaDitambahkan(_akun);
    }

    function hapusPanitia(address _akun) external hanyaKetua votingBelumBerlangsung {
        require(_akun != ketuaPanitia, "Tidak bisa hapus ketua");
        require(panitia[_akun], "Bukan panitia");
        panitia[_akun] = false;
        emit PanitiaDihapus(_akun);
    }

    // === BUKA VOTING (HANYA SEKALI) ===
    function bukaVoting(uint256 _durasiDetik) external hanyaPanitia {
        _autoTutup();
        require(!votingDibuka, "Voting sudah dibuka/selesai");
        require(_durasiDetik >= 1 hours, "Durasi minimal 1 jam");

        votingDibuka = true;
        waktuMulai = block.timestamp;
        waktuSelesai = block.timestamp + _durasiDetik;
        emit VotingDibuka(waktuMulai, waktuSelesai);
    }

    // === VOTE DENGAN TANDA TANGAN (EIP-712) - INI YANG DIPAKAI ===
    function voteDenganTandaTangan(
        address pemilih,
        uint256 kandidatId,
        bytes calldata signature
    ) external hanyaRelayer saatVotingBerlangsung {
        require(pemilih != relayer, "Relayer tidak boleh vote");
        require(!telahMemilih[pemilih], "Sudah memilih");
        require(kandidatId < totalKandidat, "Kandidat invalid");

        uint256 currentNonce = noncePemilih[pemilih];

        // EIP-712 structured data
        bytes32 structHash = keccak256(
            abi.encode(
                _VOTE_TYPEHASH,
                pemilih,
                kandidatId,
                currentNonce
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(hash, signature);
        require(signer == pemilih, "Signature tidak valid atau salah pemilih");

        // Update state
        telahMemilih[pemilih] = true;
        noncePemilih[pemilih]++;
        suaraKandidat[kandidatId]++;
        totalPemilih++;

        emit PemilihTercatat(pemilih);
        emit SuaraMasuk(pemilih, kandidatId);
    }

    // === VIEW FUNCTIONS ===
    function getHasil() external view returns (uint256[] memory hasil) {
        hasil = new uint256[](totalKandidat);
        for (uint256 i = 0; i < totalKandidat; i++) {
            hasil[i] = suaraKandidat[i];
        }
    }

    function getKandidat() external view returns (string[] memory) {
        return daftarKandidat;
    }

    function statusVoting() external view returns (string memory) {
        if (!votingDibuka) {
            return (waktuSelesai > 0 && block.timestamp > waktuSelesai) 
                ? "Selesai" 
                : "Belum dibuka";
        }
        return block.timestamp > waktuSelesai ? "Selesai" : "Berlangsung";
    }

    function getTotalPemilih() external view returns (uint256) {
        return totalPemilih;
    }

    function getWaktuTersisa() external view returns (uint256) {
        if (!votingDibuka || block.timestamp >= waktuSelesai) return 0;
        return waktuSelesai - block.timestamp;
    }

    function getWaktuTutup() external view returns (uint256) {
        return waktuSelesai;
    }

    function sudahMemilih(address _user) external view returns (bool) {
        return telahMemilih[_user];
    }

    function getVoteCount(uint256 kandidatId) external view returns (uint256) {
        require(kandidatId < totalKandidat, "Invalid kandidat");
        return suaraKandidat[kandidatId];
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

    // Fallback
    receive() external payable {}
    fallback() external payable {}
}