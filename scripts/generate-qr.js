// scripts/generate-qr.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const qrcode = require("qrcode");
const PDFDocument = require("pdfkit");
const { format } = require("date-fns");

// CONFIG — UBAH SESUAI KEBUTUHAN
const JUMLAH_PEMILIH = 1000;
const DOMAIN_URL = "https://pilkades-import.vercel.app/"; // Ganti domain kamu
const OUTPUT_FOLDER = path.join(__dirname, "../qr-output");
const PDF_PER_PAGE = 20;

// Buat folder
if (!fs.existsSync(OUTPUT_FOLDER)) {
  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
}

console.log("GENERATE QR CODE UNTUK PEMILIH");
console.log("=".repeat(60));
console.log(`Jumlah Pemilih : ${JUMLAH_PEMILIH}`);
console.log(`Domain         : ${DOMAIN_URL}`);
console.log(`Output         : ${OUTPUT_FOLDER}`);
console.log("=".repeat(60));

async function generate() {
  const wallets = [];
  const startTime = Date.now();

  for (let i = 0; i < JUMLAH_PEMILIH; i++) {
    const wallet = ethers.Wallet.createRandom();
    wallets.push({
      index: i + 1,
      address: wallet.address,
      privateKey: wallet.privateKey,
      url: `${DOMAIN_URL}?pk=${wallet.privateKey.slice(2)}`
    });

    if ((i + 1) % 100 === 0 || i === JUMLAH_PEMILIH - 1) {
      process.stdout.write(`Progress: ${i + 1}/${JUMLAH_PEMILIH} wallet dibuat...\r`);
    }
  }

  console.log("\nSemua wallet selesai dibuat!");

  // Simpan data rahasia
  const secretData = wallets.map(w => ({
    no: w.index,
    address: w.address,
    privateKey: w.privateKey
  }));

  fs.writeFileSync(
    path.join(OUTPUT_FOLDER, "RAHASIA_PEMILIH.json"),
    JSON.stringify(secretData, null, 2)
  );
  console.log("RAHASIA_PEMILIH.json → tersimpan");

  // Generate QR individual
  console.log("Membuat QR Code individual...");
  for (const w of wallets) {
    const filePath = path.join(OUTPUT_FOLDER, `QR_${String(w.index).padStart(4, "0")}.png`);
    await qrcode.toFile(filePath, w.url, { width: 300, margin: 2 });
  }

  // Generate PDF
  console.log("Membuat PDF siap cetak...");
  const pdfPath = path.join(OUTPUT_FOLDER, `QR_PEMILIH_PILKADES_${JUMLAH_PEMILIH}_ORANG.pdf`);
  const doc = new PDFDocument({ margin: 30, size: "A4" });
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);

  const qrPerRow = 4;
  const qrPerCol = 5;
  const qrSize = 110;
  const marginX = 40;
  const marginY = 60;
  const spacingX = 120;
  const spacingY = 120;

  wallets.forEach((w, i) => {
    if (i % PDF_PER_PAGE === 0 && i > 0) doc.addPage();

    const row = Math.floor((i % PDF_PER_PAGE) / qrPerRow);
    const col = (i % PDF_PER_PAGE) % qrPerRow;
    const x = marginX + col * spacingX;
    const y = marginY + row * spacingY;

    const qrPath = path.join(OUTPUT_FOLDER, `QR_${String(w.index).padStart(4, "0")}.png`);
    if (fs.existsSync(qrPath)) {
      doc.image(qrPath, x, y, { width: qrSize });
    }

    doc.fontSize(9).text(`No. ${w.index}`, x, y + qrSize + 5, { align: "center", width: qrSize });
  });

  doc.fontSize(10).text(
    `Pilkades Desa • ${format(new Date(), "dd MMMM yyyy")} • Total: ${JUMLAH_PEMILIH} Pemilih`,
    50, doc.page.height - 50, { align: "center" }
  );

  doc.end();

  await new Promise(resolve => stream.on("finish", resolve));

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("SELESAI!");
  console.log("=".repeat(60));
  console.log(`Waktu       : ${duration} detik`);
  console.log(`PDF         : ${pdfPath}`);
  console.log(`Folder QR   : ${OUTPUT_FOLDER}`);
  console.log(`Rahasia     : RAHASIA_PEMILIH.json → SIMPAN AMAN!`);
  console.log("=".repeat(60));
  console.log("Cetak PDF → potong → bagi ke warga → SELESAI!");
}

generate().catch(err => {
  console.error("Gagal generate:", err);
  process.exit(1);
});