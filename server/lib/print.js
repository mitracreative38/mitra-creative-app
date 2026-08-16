// Porting dari fungsi-fungsi murni (tanpa DOM/browser) di www/app.js yang
// dipakai untuk membangun tampilan cetak Penawaran -- SENGAJA diduplikasi
// di sini (bukan di-share lewat import) karena app.js ditulis untuk
// berjalan di browser (referensi `state`, elemen DOM, dst.), sedangkan
// kode ini berjalan di server lewat Puppeteer. Kalau template cetak di
// app.js berubah, bagian yang sama di sini perlu disesuaikan juga.

const COMPANY_ADDRESS = "Jl. Taman Asri No. 15, Pedurungan Tengah, Semarang";
const COMPANY_PHONE = "0895811220203";

const BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function rupiah(n) {
  n = Number(n) || 0;
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatTanggal(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return `${d} ${BULAN_ID[m - 1]} ${y}`;
}

function escapeHtml(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function itemsSubtotal(items) {
  return (items || []).reduce((s, it) => s + (it.volume || 0) * (it.hargaSatuan || 0), 0);
}

function penawaranTotals(pw) {
  const subtotal = itemsSubtotal(pw.items);
  const diskonValue = subtotal * (pw.diskon || 0) / 100;
  const dpp = subtotal - diskonValue;
  const ppnValue = dpp * (pw.ppn || 0) / 100;
  const pphValue = dpp * (pw.pph || 0) / 100;
  const total = dpp + ppnValue;
  return { subtotal, diskonValue, dpp, ppnValue, pphValue, total };
}

const LOGO_SVG = `<svg viewBox="0 0 64 64" width="52" height="52" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f5a623"/>
      <stop offset="1" stop-color="#d0221e"/>
    </linearGradient>
  </defs>
  <path d="M4 8 L20 8 L20 40 Q20 48 26 48 Q32 48 32 40 L32 8 L48 8 L48 40 Q48 56 32 56 Q16 56 16 40 Z" fill="url(#lgGrad)"/>
  <path d="M20 8 L20 32 Q20 40 26 40 Q28 40 28 34 L28 8 Z" fill="#f7c948" opacity="0.9"/>
</svg>`;

// pw: baris tabel "penawaran" (kolom snake_case dari Supabase) digabung
// dengan profil perusahaan (company/alamat/telepon/ownerNama/ownerJabatan
// dari app_state.data). Sengaja menerima objek datar, bukan bentuk state
// browser, supaya jelas apa saja yang dibutuhkan endpoint ini.
function buildPenawaranPrintHtml(pw, profil) {
  const { subtotal, diskonValue, ppnValue, pphValue, total } = penawaranTotals(pw);
  const items = pw.items || [];
  const itemsRows = items.map((it, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${escapeHtml(it.uraian)}</td>
      <td class="c">${escapeHtml(it.satuan)}</td>
      <td class="r">${it.volume}</td>
      <td class="r">${rupiah(it.hargaSatuan)}</td>
      <td class="r">${rupiah((it.volume || 0) * (it.hargaSatuan || 0))}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="c">Belum ada item</td></tr>`;

  return `
    <div class="letterhead">
      <div class="letterhead-logo">${LOGO_SVG}</div>
      <div class="letterhead-text">
        <div class="lh-name">${escapeHtml(profil.company || "CV. Mitra Creative")}</div>
        <div class="lh-tagline">CONTRACTOR SIPIL - ADVERTISING - KONTRUKSI - PENGADAAN BARANG DAN JASA</div>
        <div class="lh-address">${escapeHtml(profil.alamat || COMPANY_ADDRESS)} - ${escapeHtml(profil.telepon || COMPANY_PHONE)}</div>
      </div>
    </div>
    <div class="letterhead-rule"></div>

    <div class="doc-meta">
      <table class="meta-table">
        <tr><td>Nomor</td><td>:</td><td>${escapeHtml(pw.nomor)}</td></tr>
        <tr><td>Lampiran</td><td>:</td><td>1 (satu) berkas</td></tr>
        <tr><td>Perihal</td><td>:</td><td>${escapeHtml(pw.perihal || "Penawaran Harga")}</td></tr>
      </table>
      <div class="doc-date">Semarang, ${formatTanggal(pw.tanggal)}</div>
    </div>

    <div class="doc-kepada">
      Kepada Yth,<br>
      <strong>${escapeHtml(pw.kepada || "-")}</strong><br>
      ${escapeHtml(pw.alamat_klien || "")}
    </div>

    <p class="doc-p">Dengan hormat,<br>
    Bersama ini kami sampaikan penawaran harga untuk pekerjaan <strong>${escapeHtml(pw.perihal || "-")}</strong> dengan rincian sebagai berikut:</p>

    <table class="doc-items">
      <thead><tr><th>No</th><th>Uraian Pekerjaan</th><th class="c">Satuan</th><th class="r">Volume</th><th class="r">Harga Satuan</th><th class="r">Jumlah</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <table class="doc-summary-table">
      <tr><td>Subtotal</td><td class="r">${rupiah(subtotal)}</td></tr>
      ${pw.diskon ? `<tr><td>Diskon (${pw.diskon}%)</td><td class="r">- ${rupiah(diskonValue)}</td></tr>` : ""}
      ${pw.ppn ? `<tr><td>PPN (${pw.ppn}%)</td><td class="r">${rupiah(ppnValue)}</td></tr>` : ""}
      <tr class="total-row"><td>Total Penawaran</td><td class="r">${rupiah(total)}</td></tr>
    </table>
    ${pw.pph ? `<p class="doc-p" style="font-size:11px; color:#777;">*Sudah termasuk PPh Final (${pw.pph}%) sebesar ${rupiah(pphValue)} sesuai Syarat &amp; Ketentuan di bawah.</p>` : ""}

    <div class="doc-syarat">
      <strong>Syarat &amp; Ketentuan:</strong>
      <div class="syarat-text">${(pw.syarat || "").split("\n").map(l => `<div>${escapeHtml(l)}</div>`).join("")}</div>
    </div>

    <p class="doc-p">${escapeHtml(pw.penutup || "")}</p>

    <div class="doc-signature">
      Hormat kami,<br>${escapeHtml(profil.company || "CV. Mitra Creative")}
      <div class="sign-space"></div>
      <strong>${escapeHtml(pw.ttd_nama || profil.ownerNama || "")}</strong><br>
      ${escapeHtml(pw.ttd_jabatan || profil.ownerJabatan || "")}
    </div>
  `;
}

function rabTotals(rab) {
  const subtotal = itemsSubtotal(rab.items);
  const ppnValue = subtotal * (rab.ppn || 0) / 100;
  const pphValue = subtotal * (rab.pph || 0) / 100;
  const total = subtotal + ppnValue + (rab.biaya_lain || 0);
  return { subtotal, ppnValue, pphValue, total };
}

// rab: baris tabel "rab" (kolom snake_case) digabung dengan profil
// perusahaan, sama polanya dengan buildPenawaranPrintHtml di atas.
function buildRabPrintHtml(rab, profil) {
  const { subtotal, ppnValue, pphValue, total } = rabTotals(rab);
  const items = rab.items || [];
  const itemsRows = items.map((it, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${escapeHtml(it.uraian)}</td>
      <td class="c">${escapeHtml(it.satuan)}</td>
      <td class="r">${it.volume}</td>
      <td class="r">${rupiah(it.hargaSatuan)}</td>
      <td class="r">${rupiah((it.volume || 0) * (it.hargaSatuan || 0))}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="c">Belum ada item</td></tr>`;

  return `
    <div class="letterhead">
      <div class="letterhead-logo">${LOGO_SVG}</div>
      <div class="letterhead-text">
        <div class="lh-name">${escapeHtml(profil.company || "CV. Mitra Creative")}</div>
        <div class="lh-tagline">CONTRACTOR SIPIL - ADVERTISING - KONTRUKSI - PENGADAAN BARANG DAN JASA</div>
        <div class="lh-address">${escapeHtml(profil.alamat || COMPANY_ADDRESS)} - ${escapeHtml(profil.telepon || COMPANY_PHONE)}</div>
      </div>
    </div>
    <div class="letterhead-rule"></div>
    <h3 style="text-align:center; margin:6px 0 4px; letter-spacing:.5px;">RENCANA ANGGARAN BIAYA (RAB)</h3>
    <p class="doc-p" style="text-align:center; margin:0 0 16px;">Dokumen internal — bukan dokumen resmi untuk klien</p>

    <table class="meta-table">
      <tr><td>No. RAB</td><td>:</td><td>${escapeHtml(rab.nomor || "-")}</td></tr>
      <tr><td>Nama Proyek</td><td>:</td><td>${escapeHtml(rab.nama_proyek || "-")}</td></tr>
      <tr><td>Klien</td><td>:</td><td>${escapeHtml(rab.klien || "-")}</td></tr>
      <tr><td>Lokasi</td><td>:</td><td>${escapeHtml(rab.lokasi || "-")}</td></tr>
      <tr><td>Kategori</td><td>:</td><td>${escapeHtml(rab.kategori || "-")}</td></tr>
      <tr><td>Tanggal</td><td>:</td><td>${formatTanggal(rab.tanggal)}</td></tr>
    </table>

    <table class="doc-items" style="margin-top:16px;">
      <thead><tr><th>No</th><th>Uraian Pekerjaan</th><th class="c">Satuan</th><th class="r">Volume</th><th class="r">Harga Satuan</th><th class="r">Jumlah</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <table class="doc-summary-table">
      <tr><td>Subtotal</td><td class="r">${rupiah(subtotal)}</td></tr>
      ${rab.ppn ? `<tr><td>PPN (${rab.ppn}%)</td><td class="r">${rupiah(ppnValue)}</td></tr>` : ""}
      ${rab.biaya_lain ? `<tr><td>Biaya Lain-lain</td><td class="r">${rupiah(rab.biaya_lain)}</td></tr>` : ""}
      <tr class="total-row"><td>Total RAB</td><td class="r">${rupiah(total)}</td></tr>
    </table>
    ${rab.pph ? `<p class="doc-p" style="font-size:11px; color:#777;">*Sudah termasuk PPh Final (${rab.pph}%) sebesar ${rupiah(pphValue)}.</p>` : ""}

    <p style="font-size:11px; color:#777; margin-top:10px;">Dicetak ${formatTanggal(new Date().toISOString().slice(0, 10))}.</p>
  `;
}

function slipTotalPotongan(sl) {
  return (sl.uangMakan || 0) + (sl.bon || 0) + (sl.potonganPinjaman || 0);
}
function slipGajiBersih(sl) {
  return (sl.upahKotor || 0) - slipTotalPotongan(sl);
}

// sl: satu entri dari array karyawan_gaji.slip_gaji (sudah membawa
// namaKaryawan/jabatan/tipeGaji apa adanya sejak dibuat, tidak perlu
// join ke tabel karyawan lagi).
function buildSlipGajiPrintHtml(sl, profil) {
  return `
    <div class="letterhead">
      <div class="letterhead-logo">${LOGO_SVG}</div>
      <div class="letterhead-text">
        <div class="lh-name">${escapeHtml(profil.company || "CV. Mitra Creative")}</div>
        <div class="lh-tagline">CONTRACTOR SIPIL - ADVERTISING - KONTRUKSI - PENGADAAN BARANG DAN JASA</div>
        <div class="lh-address">${escapeHtml(profil.alamat || COMPANY_ADDRESS)} - ${escapeHtml(profil.telepon || COMPANY_PHONE)}</div>
      </div>
    </div>
    <div class="letterhead-rule"></div>
    <h3 style="text-align:center; margin:6px 0 16px; letter-spacing:.5px;">SLIP GAJI KARYAWAN</h3>
    <table class="meta-table" style="margin-bottom:14px;">
      <tr><td>Nama</td><td>:</td><td><strong>${escapeHtml(sl.namaKaryawan)}</strong></td></tr>
      <tr><td>Jabatan</td><td>:</td><td>${escapeHtml(sl.jabatan || "-")}</td></tr>
      <tr><td>Periode</td><td>:</td><td>${formatTanggal(sl.mulai)} — ${formatTanggal(sl.selesai)}</td></tr>
    </table>
    <table class="doc-items">
      <thead><tr><th>Uraian</th><th>Keterangan</th><th class="r">Jumlah</th></tr></thead>
      <tbody>
        ${sl.tipeGaji === "Bulanan" ? `
        <tr><td>Gaji Bulanan</td><td>Gaji tetap bulanan</td><td class="r">${rupiah(sl.gajiBulanan)}</td></tr>
        <tr><td>Bonus Target</td><td>Realisasi ${rupiah(sl.realisasi)} − Target ${rupiah(sl.target)} × ${sl.persenBonus}%</td><td class="r">${rupiah(sl.bonus)}</td></tr>
        ` : `
        <tr><td>Upah Harian</td><td>${sl.hariHadir} hari × ${rupiah(sl.upahHarian)}</td><td class="r">${rupiah(sl.totalUpahHarian)}</td></tr>
        <tr><td>Lembur</td><td>${sl.jamLembur} jam × ${rupiah(sl.tarifLembur)}</td><td class="r">${rupiah(sl.totalLembur)}</td></tr>
        `}
      </tbody>
    </table>
    <table class="doc-summary-table">
      <tr class="total-row"><td>Upah Kotor</td><td class="r">${rupiah(sl.upahKotor)}</td></tr>
      <tr><td>Uang Makan (sudah diterima)</td><td class="r">- ${rupiah(sl.uangMakan)}</td></tr>
      <tr><td>Bon Mingguan</td><td class="r">- ${rupiah(sl.bon)}</td></tr>
      <tr><td>Potongan Pinjaman</td><td class="r">- ${rupiah(sl.potonganPinjaman)}</td></tr>
      <tr class="total-row"><td>Gaji Bersih (Take Home)</td><td class="r">${rupiah(slipGajiBersih(sl))}</td></tr>
    </table>
    <p class="doc-p">Sisa Pinjaman Sebelum: <strong>${rupiah(sl.sisaSebelum)}</strong> &nbsp;→&nbsp; Sisa Pinjaman Sesudah: <strong>${rupiah(sl.sisaSesudah)}</strong></p>
    <div style="display:flex; justify-content:space-between; margin-top:30px; font-size:12.5px;">
      <div>
        Diterima oleh,
        <div class="sign-space"></div>
        <strong>${escapeHtml(sl.namaKaryawan)}</strong>
      </div>
      <div style="text-align:right;">
        Dibayar oleh,<br>${escapeHtml(profil.company || "CV. Mitra Creative")}
        <div class="sign-space"></div>
        <strong>${escapeHtml(profil.ownerNama || "")}</strong><br>${escapeHtml(profil.ownerJabatan || "")}
      </div>
    </div>
  `;
}

// Halaman HTML lengkap yang di-render Puppeteer. Memakai stylesheet ASLI
// aplikasi (di-host di GitHub Pages) lewat <link>, supaya hasil cetak PDF
// ini selalu identik dengan tampilan cetak di aplikasi -- tidak ada CSS
// yang diduplikasi/bisa berbeda sendiri dari yang di www/style.css.
function wrapPrintPage(bodyHtml, styleUrl) {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${styleUrl}">
</head>
<body class="printing-quote">
<div id="printArea">${bodyHtml}</div>
</body>
</html>`;
}

module.exports = { buildPenawaranPrintHtml, buildRabPrintHtml, buildSlipGajiPrintHtml, wrapPrintPage, rupiah, formatTanggal, escapeHtml };
