// Pengirim WhatsApp (Fonnte) & Email (Resend) generik -- dipakai oleh
// server/lib/reminders.js untuk pengingat otomatis, tapi ditulis sebagai
// helper umum supaya bisa dipakai fitur lain nanti (mis. notifikasi lain
// di luar pengingat terjadwal).
//
// Gagal-lembut secara sengaja: kalau API key belum diisi di environment
// (FONNTE_TOKEN / RESEND_API_KEY), fungsi cukup mencatat peringatan ke
// console dan mengembalikan { skipped: true } -- tidak pernah melempar
// error yang bisa menghentikan pengecekan pengingat perusahaan lain.
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

async function sendWhatsApp(nomor, pesan) {
  if (!FONNTE_TOKEN) {
    console.warn("[notifications] FONNTE_TOKEN belum diset -- WA tidak dikirim.");
    return { skipped: true };
  }
  if (!nomor) return { skipped: true, reason: "nomor kosong" };
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: FONNTE_TOKEN, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ target: nomor, message: pesan })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.status === false) {
      console.error("[notifications] gagal kirim WA ke", nomor, ":", body.reason || res.statusText);
      return { error: body.reason || res.statusText };
    }
    return { ok: true };
  } catch (err) {
    console.error("[notifications] gagal kirim WA ke", nomor, ":", err.message);
    return { error: err.message };
  }
}

async function sendEmail(to, subject, text) {
  if (!RESEND_API_KEY) {
    console.warn("[notifications] RESEND_API_KEY belum diset -- email tidak dikirim.");
    return { skipped: true };
  }
  if (!to) return { skipped: true, reason: "alamat email kosong" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [to], subject, text })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[notifications] gagal kirim email ke", to, ":", body.message || res.statusText);
      return { error: body.message || res.statusText };
    }
    return { ok: true };
  } catch (err) {
    console.error("[notifications] gagal kirim email ke", to, ":", err.message);
    return { error: err.message };
  }
}

module.exports = { sendWhatsApp, sendEmail };
