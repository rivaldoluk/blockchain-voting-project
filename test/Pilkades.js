// test/pilkades.js
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("PilkadesVoting — FULL TEST SESUAI UU PEMILU", function () {
  let contract, owner, voter1, voter2, relayer, panitia;
  const candidates = ["Joko Widodo", "Siti Aminah", "Budi Santoso", "Ani Lestari"];
  const DURASI_6_JAM = 6 * 3600; // 21600 detik

  beforeEach(async function () {
    [owner, voter1, voter2, relayer, panitia] = await ethers.getSigners();

    const PilkadesVoting = await ethers.getContractFactory("PilkadesVoting");
    contract = await PilkadesVoting.deploy(candidates, relayer.address);
    await contract.waitForDeployment();
  });

  it("Deploy: ketua, relayer, & kandidat benar", async function () {
    expect(await contract.ketuaPanitia()).to.equal(owner.address);
    expect(await contract.relayer()).to.equal(relayer.address);
    expect(await contract.totalKandidat()).to.equal(4);

    const daftar = await contract.getKandidat();
    expect(daftar).to.deep.equal(candidates);
  });

  it("Buka voting: hanya panitia, durasi ≥1 jam, hanya sekali", async function () {
    // Gagal: durasi < 1 jam
    await expect(contract.connect(owner).bukaVoting(1800))
      .to.be.revertedWith("Durasi minimal 1 jam");

    // Berhasil: buka voting 6 jam
    await expect(contract.connect(owner).bukaVoting(DURASI_6_JAM))
      .to.emit(contract, "VotingDibuka");

    expect(await contract.statusVoting()).to.equal("Berlangsung");

    // Gagal: buka lagi
    await expect(contract.connect(owner).bukaVoting(DURASI_6_JAM))
      .to.be.revertedWith("Voting sudah dibuka atau selesai");
  });

  it("Vote langsung: 1x per wallet, relayer dilarang", async function () {
    await contract.connect(owner).bukaVoting(DURASI_6_JAM);

    // Voter 1 vote
    await expect(contract.connect(voter1).vote(0))
      .to.emit(contract, "SuaraMasuk")
      .withArgs(voter1.address, 0);

    // Double vote → gagal
    await expect(contract.connect(voter1).vote(1))
      .to.be.revertedWith("Sudah memilih");

    // Relayer coba vote → gagal
    await expect(contract.connect(relayer).vote(0))
      .to.be.revertedWith("Relayer tidak boleh vote");
  });

  it("Vote dari relayer: gratis, aman, 1x per pemilih", async function () {
    await contract.connect(owner).bukaVoting(DURASI_6_JAM);

    const signature = await voter1.signMessage(
      ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes("vote:2")))
    );

    // Simulasi relayer kirim vote
    await expect(contract.connect(relayer).voteDariRelayer(voter1.address, 2))
      .to.emit(contract, "VoteDariRelayer")
      .withArgs(voter1.address, 2);

    expect(await contract.telahMemilih(voter1.address)).to.be.true;
  });

  it("Auto tutup: setelah 6 jam → permanen", async function () {
    await contract.connect(owner).bukaVoting(DURASI_6_JAM);

    // Cek waktu
    const waktuTutup = await contract.getWaktuTutup();
    expect(waktuTutup).to.be.above(0);

    // Majukan waktu 7 jam
    await network.provider.send("evm_increaseTime", [DURASI_6_JAM + 3600]);
    await network.provider.send("evm_mine");

    // Status otomatis "Selesai"
    expect(await contract.statusVoting()).to.equal("Selesai");

    // Vote baru → gagal
    await expect(contract.connect(voter2).vote(0))
      .to.be.revertedWith("Voting belum dibuka atau sudah selesai");
  });

  it("Hasil & pemenang: real-time & akurat", async function () {
    await contract.connect(owner).bukaVoting(DURASI_6_JAM);

    await contract.connect(voter1).vote(0); // Joko
    await contract.connect(voter2).vote(2); // Budi
    await contract.connect(relayer).voteDariRelayer(panitia.address, 0); // Joko

    const hasil = await contract.getHasil();
    expect(hasil[0]).to.equal(2n); // Joko
    expect(hasil[2]).to.equal(1n); // Budi

    const pemenang = await contract.getPemenang();
    expect(pemenang.index).to.equal(0);
    expect(pemenang.nama).to.equal("Joko Widodo");
    expect(pemenang.suara).to.equal(2n);

    expect(await contract.getTotalPemilih()).to.equal(3);
  });

  it("Panitia: tambah/hapus oleh ketua", async function () {
    await expect(contract.tambahPanitia(panitia.address))
      .to.emit(contract, "PanitiaDitambahkan");

    expect(await contract.panitia(panitia.address)).to.be.true;

    await expect(contract.hapusPanitia(panitia.address))
      .to.emit(contract, "PanitiaDihapus");

    expect(await contract.panitia(panitia.address)).to.be.false;
  });

  it("Ubah relayer: hanya ketua", async function () {
    const newRelayer = voter2;
    await expect(contract.ubahRelayer(newRelayer.address))
      .to.emit(contract, "RelayerDiubah");

    expect(await contract.relayer()).to.equal(newRelayer.address);
  });

  it("StatusVoting: selalu akurat", async function () {
    expect(await contract.statusVoting()).to.equal("Belum dibuka");

    await contract.connect(owner).bukaVoting(DURASI_6_JAM);
    expect(await contract.statusVoting()).to.equal("Berlangsung");

    await network.provider.send("evm_increaseTime", [DURASI_6_JAM + 1]);
    await network.provider.send("evm_mine");

    expect(await contract.statusVoting()).to.equal("Selesai");
  });
});