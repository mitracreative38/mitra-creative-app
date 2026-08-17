// Payment Gateway (Xendit) -- Fase 1.1: link pembayaran online untuk Termin
// Pembayaran Proyek & DP Penawaran yang disetujui.
//
// XENDIT_SECRET_KEY dipakai membuat & mengecek Invoice (Basic Auth, key
// sebagai username, password kosong -- standar API Xendit).
// XENDIT_CALLBACK_TOKEN dipakai memverifikasi webhook (header
// x-callback-token yang dikirim Xendit) supaya tidak ada pihak luar yang
// bisa memalsukan notifikasi "sudah dibayar" dan membuat transaksi Kas
// palsu -- lihat verifyCallbackToken().
//
// Gagal-lembut kalau XENDIT_SECRET_KEY belum diisi (mengembalikan
// {skipped: true}), konsisten dengan pola server/lib/notifications.js.
const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY;
const XENDIT_CALLBACK_TOKEN = process.env.XENDIT_CALLBACK_TOKEN;
const XENDIT_API_BASE = "https://api.xendit.co";

function xenditAuthHeader() {
  return "Basic " + Buffer.from(`${XENDIT_SECRET_KEY}:`).toString("base64");
}

async function createInvoice({ externalId, amount, description, successRedirectUrl }) {
  if (!XENDIT_SECRET_KEY) {
    console.warn("[payment] XENDIT_SECRET_KEY belum diset -- link pembayaran tidak dibuat.");
    return { skipped: true };
  }
  const res = await fetch(`${XENDIT_API_BASE}/v2/invoices`, {
    method: "POST",
    headers: { Authorization: xenditAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      external_id: externalId,
      amount,
      description,
      currency: "IDR",
      success_redirect_url: successRedirectUrl
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `Xendit membalas status ${res.status}`);
  }
  return body; // { id, invoice_url, status, ... }
}

async function getInvoiceStatus(invoiceId) {
  const res = await fetch(`${XENDIT_API_BASE}/v2/invoices/${invoiceId}`, {
    headers: { Authorization: xenditAuthHeader() }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `Xendit membalas status ${res.status}`);
  }
  return body;
}

// Perbandingan token webhook -- sengaja perbandingan string biasa (bukan
// timing-safe) karena token ini statis & panjang (bukan per-request nonce),
// risikonya sama seperti API key lain yang sudah dipakai di aplikasi ini.
function verifyCallbackToken(headerToken) {
  return !!XENDIT_CALLBACK_TOKEN && !!headerToken && headerToken === XENDIT_CALLBACK_TOKEN;
}

// Menandai payment lunas: catat transaksi Kas Perusahaan + update baris
// payment_transactions + catat Aktivitas Tim -- dipakai BAIK oleh webhook
// MAUPUN oleh checkPendingPayments (reconciliation), supaya hasil akhirnya
// identik di kedua jalur. Idempotent: kalau payment.status sudah "paid",
// tidak melakukan apa-apa lagi (mencegah transaksi Kas dobel kalau webhook
// & reconciliation kebetulan memproses invoice yang sama).
async function markPaymentPaid(supabaseAdmin, payment, xenditInvoiceId) {
  if (payment.status === "paid") return { alreadyProcessed: true };

  const kasTxn = {
    id: `xnd-${payment.id}`,
    company_id: payment.company_id,
    tanggal: new Date().toISOString().slice(0, 10),
    keterangan: payment.deskripsi,
    kategori: "Pendapatan Jasa",
    proyek_id: payment.proyek_id || null,
    tipe: "Masuk",
    status: "lunas",
    jumlah: payment.jumlah,
    created_by: payment.company_id,
    extra: payment.jenis === "termin_proyek" ? "Termin (Payment Gateway)" : "DP Penawaran (Payment Gateway)",
    catatan: `Dibayar otomatis via Xendit -- invoice ${xenditInvoiceId || payment.xendit_invoice_id || ""}`
  };
  const { error: kasErr } = await supabaseAdmin.from("kas_usaha_transaksi").insert(kasTxn);
  if (kasErr) throw kasErr;

  const { error: payErr } = await supabaseAdmin.from("payment_transactions")
    .update({ status: "paid", paid_at: new Date().toISOString(), kas_transaksi_id: kasTxn.id, updated_at: new Date().toISOString() })
    .eq("id", payment.id);
  if (payErr) throw payErr;

  // Fire-and-forget: kegagalan mencatat log tidak boleh menggagalkan
  // pencatatan Kas yang sudah berhasil di atas.
  await supabaseAdmin.from("activity_log").insert({
    company_id: payment.company_id,
    actor_id: payment.company_id,
    actor_email: "sistem-pembayaran@xendit",
    actor_role: "owner",
    module: "pembayaran",
    action: "create",
    record_id: kasTxn.id,
    summary: `Pembayaran online diterima: ${payment.deskripsi} (Rp${Number(payment.jumlah || 0).toLocaleString("id-ID")})`,
    diff: { xenditInvoiceId: xenditInvoiceId || payment.xendit_invoice_id, jenis: payment.jenis }
  }).then(({ error }) => { if (error) console.error("[payment] gagal catat activity_log:", error.message); })
    .catch(err => console.error("[payment] gagal catat activity_log:", err.message));

  return { kasTxnId: kasTxn.id };
}

// Jaring pengaman kalau webhook Xendit gagal terkirim (mis. server sempat
// redeploy tepat saat webhook masuk): dicek tiap jam, mengambil ulang
// status LANGSUNG dari Xendit untuk semua link yang statusnya masih
// "pending" di database kita, lalu memproses yang ternyata sudah PAID
// lewat jalur yang SAMA PERSIS seperti webhook (markPaymentPaid) --
// ini juga jadi "check up pemeriksaan" independen: kalaupun webhook-nya
// dipalsukan/gagal, status akhirnya tetap ditentukan oleh Xendit sendiri
// lewat API resmi, bukan oleh payload webhook yang diterima.
const RECONCILE_INTERVAL_MS = 60 * 60 * 1000;
async function checkPendingPayments(supabaseAdmin) {
  if (!supabaseAdmin || !XENDIT_SECRET_KEY) return { skipped: true };

  const { data: pending, error } = await supabaseAdmin.from("payment_transactions")
    .select("*").eq("status", "pending").not("xendit_invoice_id", "is", null);
  if (error) {
    console.error("[payment] gagal ambil daftar link pending:", error.message);
    return { error: error.message };
  }

  let diperbaiki = 0;
  for (const payment of pending || []) {
    try {
      const inv = await getInvoiceStatus(payment.xendit_invoice_id);
      if (inv.status === "PAID" || inv.status === "SETTLED") {
        await markPaymentPaid(supabaseAdmin, payment, inv.id);
        diperbaiki++;
      } else if (inv.status === "EXPIRED") {
        await supabaseAdmin.from("payment_transactions")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", payment.id);
      }
    } catch (err) {
      console.error(`[payment] gagal cek ulang invoice ${payment.xendit_invoice_id}:`, err.message);
    }
  }
  if (diperbaiki) console.log(`[payment] ${diperbaiki} link pembayaran diperbaiki lewat pengecekan ulang (kemungkinan webhook gagal terkirim).`);
  return { diperbaiki, total: (pending || []).length };
}

module.exports = { createInvoice, getInvoiceStatus, verifyCallbackToken, markPaymentPaid, checkPendingPayments, RECONCILE_INTERVAL_MS };
