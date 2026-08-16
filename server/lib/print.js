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

module.exports = { buildPenawaranPrintHtml, wrapPrintPage, rupiah, formatTanggal, escapeHtml };
