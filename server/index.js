require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { execSync } = require("child_process");
const { createClient } = require("@supabase/supabase-js");
const puppeteer = require("puppeteer-core");
const { buildPenawaranPrintHtml, wrapPrintPage } = require("./lib/print");

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
// Lokasi executable Chromium yang dipakai Puppeteer untuk merender PDF.
// Tidak pakai Chromium bawaan puppeteer (yang biasa didownload otomatis)
// supaya build lebih ringan & cepat -- pakai yang di-install lewat
// nixpacks.toml (nixPkgs "chromium") di server ini. Path Chromium hasil
// install Nix punya hash acak (tidak bisa ditebak/di-hardcode di awal),
// tapi Nixpacks menaruhnya di PATH, jadi bisa dicari otomatis lewat
// `which chromium` saat server start -- tidak perlu Owner mengisi env var
// tambahan secara manual. PUPPETEER_EXECUTABLE_PATH tetap bisa diisi
// manual untuk override (dipakai juga untuk pengembangan lokal).
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

// Kalau env var PUPPETEER_EXECUTABLE_PATH tidak diisi manual, cari
// Chromium yang di-install nixpacks.toml lewat PATH (`which`) -- ini yang
// dipakai di Railway secara default, tanpa Owner perlu mengisi env var
// tambahan secara manual.
let resolvedChromiumPath = null;
function resolveChromiumPath() {
  if (PUPPETEER_EXECUTABLE_PATH) return PUPPETEER_EXECUTABLE_PATH;
  if (resolvedChromiumPath) return resolvedChromiumPath;
  for (const bin of ["chromium", "chromium-browser", "google-chrome-stable"]) {
    try {
      resolvedChromiumPath = execSync(`which ${bin}`, { encoding: "utf8" }).trim();
      if (resolvedChromiumPath) return resolvedChromiumPath;
    } catch (e) { /* coba nama berikutnya */ }
  }
  return null;
}

let browserPromise = null;
async function getBrowser() {
  const executablePath = resolveChromiumPath();
  if (!executablePath) {
    throw new Error("Chromium tidak ditemukan di server ini -- pastikan nixpacks.toml (nixPkgs \"chromium\") sudah ter-deploy, atau isi env var PUPPETEER_EXECUTABLE_PATH manual. Lihat server/README.md.");
  }
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath,
      // Wajib di kontainer Linux tanpa user namespace (Railway dst.) --
      // tanpa ini Chromium gagal start dengan error sandbox.
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }).catch(err => { browserPromise = null; throw err; });
  }
  return browserPromise;
}

app.get("/api/pdf/penawaran/:id", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    return res.status(401).json({ error: "Perlu login -- header Authorization tidak ada." });
  }
  if (!SUPABASE_URL) {
    return res.status(500).json({ error: "Server belum dikonfigurasi (SUPABASE_URL kosong)." });
  }
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

    // Profil perusahaan (nama, alamat, dst.) masih di blob app_state, RLS
    // tabel itu sudah mengizinkan anggota tim aktif membacanya (Fase D
    // cuma mengosongkan field Kas/gaji dari blob, bukan field ini).
    const { data: stateRow } = await sbUser.from("app_state").select("data").eq("user_id", pw.company_id).maybeSingle();
    const blob = (stateRow && stateRow.data) || {};
    const profil = {
      company: blob.company, alamat: blob.alamat, telepon: blob.telepon,
      ownerNama: blob.ownerNama, ownerJabatan: blob.ownerJabatan
    };

    const bodyHtml = buildPenawaranPrintHtml(pw, profil);
    const fullHtml = wrapPrintPage(bodyHtml, APP_STYLE_URL);

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(fullHtml, { waitUntil: "networkidle0" });
      // page.pdf() balikin Uint8Array biasa (bukan Node Buffer) di versi
      // puppeteer-core ini -- res.send() Express butuh Buffer sungguhan
      // supaya body respons binary-nya terkirim benar, bukan malah
      // dikira object dan di-JSON.stringify.
      const pdfBuffer = Buffer.from(await page.pdf({ format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } }));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Penawaran-${(pw.nomor || pw.id).toString().replace(/[\\/]/g, "-")}.pdf"`);
      res.send(pdfBuffer);
    } finally {
      await page.close();
    }
  } catch (err) {
    console.error("[pdf/penawaran] gagal:", err);
    res.status(500).json({ error: "Gagal membuat PDF: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});

module.exports = app;
