require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const { buildPenawaranPrintHtml, buildRabPrintHtml, buildSlipGajiPrintHtml, wrapPrintPage } = require("./lib/print");
const { getBrowser } = require("./lib/browser");
const { checkAndRunBackups } = require("./lib/backup");
const { checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS } = require("./lib/reminders");
const { createInvoice, verifyCallbackToken, markPaymentPaid, checkPendingPayments, RECONCILE_INTERVAL_MS } = require("./lib/payment");
const { pairDevice, submitPing, submitAbsenApp, cleanupOldLokasiPekerja, getAlatDipinjamPekerja, kembalikanAlatPekerja, submitLaporKerja } = require("./lib/pekerjaTracking");

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
// Halaman yang dituju setelah klien selesai membayar lewat Xendit --
// murni kosmetik (Xendit tetap menandai invoice lunas lewat webhook
// terlepas dari apakah klien benar-benar diarahkan ke sini).
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || "https://mitracreative38.github.io/mitra-creative-app/index.html");
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
// Limit default express.json() (100kb) dinaikkan supaya foto selfie
// (base64, /api/pekerja/absen) dan foto laporan kerja lapangan (s/d 12
// foto base64 sekali kirim, /api/pekerja/lapor) tidak ditolak sebelum
// sempat diproses.
app.use(express.json({ limit: "25mb" }));

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
// Dulu baca dari app_state (blob JSON, RLS Owner-only) -- sejak Fase D
// mempersempit RLS app_state, Admin/Marketing yang minta unduh PDF selalu
// mendapat baris kosong dari situ (RLS menolak sesi mereka membaca baris
// milik Owner), jadi kop surat PDF-nya tampil kosong sama sekali. Dipindah
// ke tabel company_profile (Fase 0.4) yang RLS-nya memang didesain supaya
// Admin & Marketing bisa BACA (lihat supabase_relational_schema_fix12.sql).
async function getProfil(sbUser, companyId) {
  const { data: row } = await sbUser.from("company_profile").select("*").eq("company_id", companyId).maybeSingle();
  const r = row || {};
  return {
    company: r.company, alamat: r.alamat, telepon: r.telepon,
    ownerNama: r.owner_nama, ownerJabatan: r.owner_jabatan
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

// Payment Gateway (Fase 1.1): membuat link pembayaran Xendit untuk Termin
// Proyek atau DP Penawaran. Baris payment_transactions dibuat lewat
// sbUser (bukan supabaseAdmin) supaya kebijakan RLS "buat link
// pembayaran" (Owner/Admin saja, lihat supabase_relational_schema_fix21.sql)
// yang benar-benar menentukan siapa boleh membuat link -- kalau insert
// itu ditolak RLS (mis. dipanggil Marketing), endpoint ini otomatis ikut
// gagal, tidak perlu cek peran berulang di sini. Update baris dengan info
// invoice (xendit_invoice_id/payment_url) sengaja lewat supabaseAdmin,
// murni pencatatan lanjutan setelah insert di atas berhasil (jadi
// otorisasinya sudah selesai di titik itu) -- desain ini sengaja TIDAK
// pernah mengizinkan klien mengubah kolom "status" sama sekali (lihat
// fix21.sql: tidak ada kebijakan update untuk klien).
app.post("/api/payment/create", async (req, res) => {
  const accessToken = requireAccessToken(req, res);
  if (!accessToken) return;
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY kosong)." });
  }
  try {
    const sbUser = supabaseAsCaller(accessToken);
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sesi tidak valid, silakan login ulang." });

    const { jenis, proyekId, penawaranId, jumlah, deskripsi, kategori, companyId } = req.body || {};
    if (!["termin_proyek", "dp_penawaran", "kas_umum"].includes(jenis)) {
      return res.status(400).json({ error: "jenis harus 'termin_proyek', 'dp_penawaran', atau 'kas_umum'." });
    }
    if (!companyId) return res.status(400).json({ error: "companyId wajib diisi." });
    if (!Number(jumlah) || Number(jumlah) <= 0) return res.status(400).json({ error: "Jumlah harus lebih dari 0." });
    if (!deskripsi || !String(deskripsi).trim()) return res.status(400).json({ error: "Deskripsi wajib diisi." });

    const id = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const row = {
      id,
      company_id: companyId,
      proyek_id: jenis === "termin_proyek" ? (proyekId || null) : null,
      penawaran_id: jenis === "dp_penawaran" ? (penawaranId || null) : null,
      jenis,
      deskripsi: String(deskripsi).trim(),
      jumlah: Number(jumlah),
      kategori: jenis === "kas_umum" ? (String(kategori || "").trim() || "Pendapatan Jasa") : null,
      status: "pending",
      created_by: user.id
    };
    const { error: insertErr } = await sbUser.from("payment_transactions").insert(row);
    if (insertErr) throw insertErr;

    const inv = await createInvoice({
      externalId: id,
      amount: row.jumlah,
      description: row.deskripsi,
      successRedirectUrl: APP_PUBLIC_URL
    });
    if (inv.skipped) {
      return res.status(503).json({ error: "Payment gateway belum dikonfigurasi (XENDIT_SECRET_KEY belum diisi di server)." });
    }

    const { error: updateErr } = await supabaseAdmin.from("payment_transactions")
      .update({ xendit_invoice_id: inv.id, payment_url: inv.invoice_url, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateErr) throw updateErr;

    res.json({ id, paymentUrl: inv.invoice_url });
  } catch (err) {
    console.error("[payment/create] gagal:", err);
    res.status(500).json({ error: "Gagal membuat link pembayaran: " + err.message });
  }
});

// Webhook Xendit -- dipanggil server-ke-server (bukan dari browser aplikasi
// ini), jadi TIDAK ada header Authorization Supabase sama sekali. Satu-
// satunya penjaga di sini adalah header x-callback-token yang harus cocok
// dengan XENDIT_CALLBACK_TOKEN (diset di dashboard Xendit & env server) --
// tanpa ini, siapa pun yang tahu URL endpoint ini bisa memalsukan
// notifikasi "sudah dibayar" dan memicu pencatatan Kas palsu.
app.post("/api/payment/webhook", async (req, res) => {
  if (!verifyCallbackToken(req.headers["x-callback-token"])) {
    return res.status(401).json({ error: "Token webhook tidak valid." });
  }
  if (!supabaseAdmin) return res.status(500).json({ error: "Server belum dikonfigurasi." });
  try {
    const { external_id: paymentId, status, id: xenditInvoiceId } = req.body || {};
    if (status !== "PAID" && status !== "SETTLED") {
      return res.json({ ok: true, ignored: true });
    }
    const { data: payment, error } = await supabaseAdmin.from("payment_transactions").select("*").eq("id", paymentId).maybeSingle();
    if (error) throw error;
    if (!payment) return res.status(404).json({ error: "Payment tidak ditemukan." });
    await markPaymentPaid(supabaseAdmin, payment, xenditInvoiceId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[payment/webhook] gagal:", err);
    res.status(500).json({ error: "Gagal memproses webhook: " + err.message });
  }
});

// Pelacakan Lokasi Pekerja (Fase 1.5): HP pekerja lapangan TIDAK login
// lewat Supabase Auth (tidak selalu punya email aktif), jadi 2 endpoint
// ini SENGAJA tidak memakai requireAccessToken -- kredensialnya adalah
// kode pairing lalu device_token, divalidasi manual di lib/pekerjaTracking.js
// lewat service role (satu-satunya cara menyentuh tabel pekerja_device_secret
// yang sengaja tidak punya kebijakan RLS untuk klien manapun).
app.post("/api/pekerja/pair", async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Server belum dikonfigurasi." });
  try {
    const result = await pairDevice(supabaseAdmin, req.body && req.body.pairingCode);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error("[pekerja/pair] gagal:", err);
    res.status(500).json({ error: "Gagal memasangkan perangkat: " + err.message });
  }
});
app.post("/api/pekerja/ping", async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Server belum dikonfigurasi." });
  try {
    const { deviceToken, lat, lng, accuracy, capturedAt } = req.body || {};
    const result = await submitPing(supabaseAdmin, deviceToken, { lat, lng, accuracy, capturedAt });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error("[pekerja/ping] gagal:", err);
    res.status(500).json({ error: "Gagal mengirim lokasi: " + err.message });
  }
});

// Absen Masuk/Pulang lewat aplikasi (Fase 1.8): sama seperti /api/pekerja/pair
// & /ping, TIDAK memakai requireAccessToken -- device_token adalah
// kredensialnya. Foto selfie diunggah ke Storage lewat service role
// (satu-satunya cara menyentuh bucket "absensi-selfie" yang sengaja
// tidak punya kebijakan insert untuk klien manapun -- lihat fix27.sql).
app.post("/api/pekerja/absen", async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Server belum dikonfigurasi." });
  try {
    const { deviceToken, jenis, selfieBase64 } = req.body || {};
    const result = await submitAbsenApp(supabaseAdmin, deviceToken, { jenis, selfieBase64 });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error("[pekerja/absen] gagal:", err);
    res.status(500).json({ error: "Gagal mencatat absen: " + err.message });
  }
});

// Alat yang sedang dibawa pekerja (Fase 1.9): pengingat di HP + swakembali --
// sama seperti pair/ping/absen di atas, TIDAK memakai requireAccessToken,
// device_token adalah kredensialnya.
app.post("/api/pekerja/alat", async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Server belum dikonfigurasi." });
  try {
    const { deviceToken } = req.body || {};
    const result = await getAlatDipinjamPekerja(supabaseAdmin, deviceToken);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error("[pekerja/alat] gagal:", err);
    res.status(500).json({ error: "Gagal mengambil daftar alat: " + err.message });
  }
});
app.post("/api/pekerja/alat/kembalikan", async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Server belum dikonfigurasi." });
  try {
    const { deviceToken, alatId, peminjamanId, jumlahDikembalikan, kondisiKembali, catatan } = req.body || {};
    const result = await kembalikanAlatPekerja(supabaseAdmin, deviceToken, { alatId, peminjamanId, jumlahDikembalikan, kondisiKembali, catatan });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error("[pekerja/alat/kembalikan] gagal:", err);
    res.status(500).json({ error: "Gagal menandai alat kembali: " + err.message });
  }
});

// Laporan Kerja Lapangan dari HP pekerja: sama seperti pair/ping/absen,
// TIDAK memakai requireAccessToken -- device_token adalah kredensialnya.
// Foto diunggah ke bucket "lampiran" lewat service role.
app.post("/api/pekerja/lapor", async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: "Server belum dikonfigurasi." });
  try {
    const { deviceToken, jenis, lokasi, qty, satuan, catatan, koordinat, fotos } = req.body || {};
    const result = await submitLaporKerja(supabaseAdmin, deviceToken, { jenis, lokasi, qty, satuan, catatan, koordinat, fotos });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error("[pekerja/lapor] gagal:", err);
    res.status(500).json({ error: "Gagal mengirim laporan: " + err.message });
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

// Pengingat WhatsApp/Email otomatis (Fase 1.0): follow-up Klien jatuh
// tempo & Kas Perusahaan menunggu persetujuan -- dicek setiap jam, tapi
// tiap perusahaan cuma benar-benar dikirimi pengingat kalau sudah lewat
// ~20 jam sejak pengingat jenis yang sama terakhir dikirim (lihat
// lib/reminders.js). Kalau FONNTE_TOKEN/RESEND_API_KEY belum diisi,
// pengecekan tetap jalan tapi pengirimannya gagal-lembut (dicatat ke
// console, tidak pernah mengganggu fitur lain).
if (supabaseAdmin) {
  setInterval(() => { checkAndSendReminders(supabaseAdmin).catch(err => console.error("[reminders] gagal:", err.message)); }, REMINDER_CHECK_INTERVAL_MS);
  setTimeout(() => { checkAndSendReminders(supabaseAdmin).catch(err => console.error("[reminders] gagal:", err.message)); }, 45 * 1000);
}

// Pengecekan ulang berkala Payment Gateway (Fase 1.1): jaring pengaman
// kalau webhook Xendit gagal terkirim -- lihat lib/payment.js.
if (supabaseAdmin) {
  setInterval(() => { checkPendingPayments(supabaseAdmin).catch(err => console.error("[payment] gagal cek ulang:", err.message)); }, RECONCILE_INTERVAL_MS);
  setTimeout(() => { checkPendingPayments(supabaseAdmin).catch(err => console.error("[payment] gagal cek ulang:", err.message)); }, 60 * 1000);
}

// Bersih-bersih riwayat lokasi pekerja (Fase 1.5): dicek sekali sehari,
// hapus titik lokasi lebih dari 14 hari supaya tabel tidak membengkak
// (HP paired mengirim ping tiap ~10 menit selama jam kerja).
const LOKASI_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
if (supabaseAdmin) {
  setInterval(() => { cleanupOldLokasiPekerja(supabaseAdmin); }, LOKASI_CLEANUP_INTERVAL_MS);
  setTimeout(() => { cleanupOldLokasiPekerja(supabaseAdmin); }, 90 * 1000);
}

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});

module.exports = app;
