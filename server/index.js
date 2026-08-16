require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { buildPenawaranPrintHtml, buildRabPrintHtml, buildSlipGajiPrintHtml, wrapPrintPage } = require("./lib/print");
const { getBrowser } = require("./lib/browser");
const { checkAndRunBackups } = require("./lib/backup");

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Sama seperti SUPABASE_ANON_KEY yang sudah dipakai di www/app.js -- ini
// key publik (aman ditaruh di kode), dibatasi oleh RLS di sisi database,
// bukan rahasia seperti service role key.
const SUPABASE_ANON_KEY = "sb_publishable_Hlr2FaEP0WH0EWg9ECO2-A_qvAYcoKs";
// Alamat stylesheet ASLI aplikasi -- dipakai supaya PDF yang dihasilkan
// selalu identik dengan tampilan cetak di aplikasi, tanpa duplikasi CSS.
const APP_STYLE_URL = (process.env.APP_STYLE_URL || "https://mitracreative38.github.io/mitra-creative-app/style.css");
// Situs statis (GitHub Pages) yang boleh memanggil server ini. Bisa diisi
// beberapa origin dipisah koma lewat env var, untuk dev lokal + produksi.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || "https://mitracreative38.github.io")
  .split(",")
  .map(o => o.trim())
  .concat(["http://localhost:8947", "http://localhost:8000"]);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[startup] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset di environment -- endpoint yang butuh akses database akan gagal sampai ini diisi.");
}

// service_role key melewati RLS -- HANYA dipakai di server ini, tidak pernah
// dikirim ke frontend. Dipakai untuk operasi lintas-perusahaan (mis. cek
// semua follow-up klien yang jatuh tempo hari ini untuk pengingat WA/email).
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    supabaseConfigured: !!supabaseAdmin,
    time: new Date().toISOString()
  });
});

// Membuat client Supabase yang "menjadi" pemanggil aslinya (bukan lewat
// service role) -- request ke database tetap tunduk pada RLS tabel yang
// bersangkutan persis seperti kalau pemanggilnya mengakses langsung dari
// browser. Ini dipakai untuk endpoint PDF supaya tidak perlu menulis ulang
// logika otorisasi "siapa boleh lihat Penawaran siapa" di server --
// aturan yang sudah ada di database (Fase A/C) otomatis berlaku.
function supabaseAsCaller(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false }
  });
}

// Profil perusahaan (nama, alamat, dst.) masih di blob app_state, RLS
// tabel itu sudah mengizinkan anggota tim aktif membacanya (Fase D cuma
// mengosongkan field Kas/gaji dari blob, bukan field ini).
async function getProfil(sbUser, companyId) {
  const { data: stateRow } = await sbUser.from("app_state").select("data").eq("user_id", companyId).maybeSingle();
  const blob = (stateRow && stateRow.data) || {};
  return {
    company: blob.company, alamat: blob.alamat, telepon: blob.telepon,
    ownerNama: blob.ownerNama, ownerJabatan: blob.ownerJabatan
  };
}

// Merender bodyHtml jadi PDF lewat Puppeteer dan mengirimkannya sebagai
// respons unduhan -- dipakai sama oleh ketiga endpoint /api/pdf/*.
async function sendPdfResponse(res, bodyHtml, filename) {
  const fullHtml = wrapPrintPage(bodyHtml, APP_STYLE_URL);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });
    // page.pdf() balikin Uint8Array biasa (bukan Node Buffer) di versi
    // puppeteer ini -- res.send() Express butuh Buffer sungguhan supaya
    // body respons binary-nya terkirim benar, bukan malah dikira object
    // dan di-JSON.stringify.
    const pdfBuffer = Buffer.from(await page.pdf({ format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } }));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/[\\/]/g, "-")}.pdf"`);
    res.send(pdfBuffer);
  } finally {
    await page.close();
  }
}

// Semua endpoint /api/pdf/* butuh header Authorization -- dicek di sini
// supaya tidak diulang di tiap route.
function requireAccessToken(req, res) {
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    res.status(401).json({ error: "Perlu login -- header Authorization tidak ada." });
    return null;
  }
  if (!SUPABASE_URL) {
    res.status(500).json({ error: "Server belum dikonfigurasi (SUPABASE_URL kosong)." });
    return null;
  }
  return accessToken;
}

app.get("/api/pdf/penawaran/:id", async (req, res) => {
  const accessToken = requireAccessToken(req, res);
  if (!accessToken) return;
  try {
    const sbUser = supabaseAsCaller(accessToken);

    const { data: pw, error: pwErr } = await sbUser.from("penawaran").select("*").eq("id", req.params.id).maybeSingle();
    if (pwErr) throw pwErr;
    if (!pw) {
      // Bisa berarti benar-benar tidak ada, ATAU ada tapi RLS menolak
      // pemanggil ini melihatnya -- keduanya sengaja dibalas sama (404),
      // supaya tidak membocorkan informasi mana yang sebenarnya terjadi.
      return res.status(404).json({ error: "Penawaran tidak ditemukan." });
    }

    const profil = await getProfil(sbUser, pw.company_id);
    const bodyHtml = buildPenawaranPrintHtml(pw, profil);
    await sendPdfResponse(res, bodyHtml, `Penawaran-${pw.nomor || pw.id}`);
  } catch (err) {
    console.error("[pdf/penawaran] gagal:", err);
    res.status(500).json({ error: "Gagal membuat PDF: " + err.message });
  }
});

app.get("/api/pdf/rab/:id", async (req, res) => {
  const accessToken = requireAccessToken(req, res);
  if (!accessToken) return;
  try {
    const sbUser = supabaseAsCaller(accessToken);

    const { data: rab, error: rabErr } = await sbUser.from("rab").select("*").eq("id", req.params.id).maybeSingle();
    if (rabErr) throw rabErr;
    if (!rab) {
      return res.status(404).json({ error: "RAB tidak ditemukan." });
    }

    const profil = await getProfil(sbUser, rab.company_id);
    const bodyHtml = buildRabPrintHtml(rab, profil);
    await sendPdfResponse(res, bodyHtml, `RAB-${rab.nomor || rab.id}`);
  } catch (err) {
    console.error("[pdf/rab] gagal:", err);
    res.status(500).json({ error: "Gagal membuat PDF: " + err.message });
  }
});

app.get("/api/pdf/slip-gaji/:id", async (req, res) => {
  const accessToken = requireAccessToken(req, res);
  if (!accessToken) return;
  try {
    const sbUser = supabaseAsCaller(accessToken);

    // karyawan_gaji.slip_gaji satu kolom array berisi SEMUA slip milik
    // satu karyawan (bukan satu baris per slip) -- RLS tabel ini
    // Owner-only, jadi select tanpa filter company_id pun otomatis cuma
    // mengembalikan baris milik pemanggil kalau dia memang Owner-nya
    // (kosong kalau bukan).
    const { data: gajiRows, error: gajiErr } = await sbUser.from("karyawan_gaji").select("*");
    if (gajiErr) throw gajiErr;
    let found = null;
    let companyId = null;
    for (const row of gajiRows || []) {
      const slip = (row.slip_gaji || []).find(s => s.id === req.params.id);
      if (slip) { found = slip; companyId = row.company_id; break; }
    }
    if (!found) {
      return res.status(404).json({ error: "Slip gaji tidak ditemukan." });
    }

    const profil = await getProfil(sbUser, companyId);
    const bodyHtml = buildSlipGajiPrintHtml(found, profil);
    await sendPdfResponse(res, bodyHtml, `Slip-Gaji-${found.namaKaryawan}-${found.mulai}`);
  } catch (err) {
    console.error("[pdf/slip-gaji] gagal:", err);
    res.status(500).json({ error: "Gagal membuat PDF: " + err.message });
  }
});

// Backup otomatis (Fase 0.2): dicek setiap jam, tapi tiap perusahaan cuma
// benar-benar di-backup kalau sudah lewat ~24 jam sejak backup terakhirnya
// (dicek dari database, jadi tahan restart/redeploy -- lihat lib/backup.js).
const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;
if (supabaseAdmin) {
  setInterval(() => { checkAndRunBackups(supabaseAdmin).catch(err => console.error("[backup] gagal:", err.message)); }, BACKUP_CHECK_INTERVAL_MS);
  // Jalan sekali singkat setelah startup juga, supaya tidak perlu nunggu 1 jam pertama.
  setTimeout(() => { checkAndRunBackups(supabaseAdmin).catch(err => console.error("[backup] gagal:", err.message)); }, 30 * 1000);
}

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});

module.exports = app;
