// Pengingat WhatsApp/Email otomatis terjadwal (Fase 1.0) -- follow-up
// Klien yang jatuh tempo, transaksi Kas Perusahaan yang menunggu
// persetujuan, dan (Fase 1.2) Termin/Piutang yang sudah lewat tanggal
// perkiraan cair. Dipicu lewat pengecekan periodik yang sama seperti Backup
// Otomatis (server/lib/backup.js): tiap jam dicek dari tabel
// reminder_log kapan terakhir kali suatu jenis pengingat dikirim untuk
// perusahaan itu, dan cuma benar-benar mengirim kalau sudah lewat
// REMINDER_COOLDOWN_MS -- supaya efeknya sekali sehari per jenis
// pengingat, tapi tetap tahan restart/redeploy sama seperti backup.
const { sendWhatsApp, sendEmail } = require("./notifications");

const REMINDER_CHECK_INTERVAL_MS = 60 * 60 * 1000; // dicek tiap jam
const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000; // kirim ulang jenis yang sama paling cepat ~20 jam kemudian

async function shouldSend(supabaseAdmin, companyId, jenis) {
  const { data } = await supabaseAdmin.from("reminder_log").select("last_sent_at").eq("company_id", companyId).eq("jenis", jenis).maybeSingle();
  if (!data) return true;
  return new Date(data.last_sent_at).getTime() < Date.now() - REMINDER_COOLDOWN_MS;
}
async function markSent(supabaseAdmin, companyId, jenis) {
  await supabaseAdmin.from("reminder_log").upsert({ company_id: companyId, jenis, last_sent_at: new Date().toISOString() }, { onConflict: "company_id,jenis" });
}

// includeTeam=true: Owner + semua anggota tim aktif (dipakai untuk
// pengingat follow-up Klien -- siapa pun di tim bisa menindaklanjuti).
// includeTeam=false: Owner saja (dipakai untuk approval Kas Perusahaan --
// cuma Owner yang bisa menyetujui).
// roleFilter (opsional): batasi anggota tim ke peran tertentu (mis.
// "admin" saja untuk pengingat Stok Menipis -- Marketing sama sekali
// tidak punya akses ke halaman Stok Material di aplikasi, jadi tidak
// perlu ikut menerima pengingat yang halamannya saja tidak bisa mereka buka).
async function getRecipients(supabaseAdmin, companyId, includeTeam, roleFilter) {
  const recipients = [];
  const { data: ownerUser } = await supabaseAdmin.auth.admin.getUserById(companyId);
  const { data: profile } = await supabaseAdmin.from("company_profile").select("telepon").eq("company_id", companyId).maybeSingle();
  recipients.push({ email: ownerUser && ownerUser.user ? ownerUser.user.email : null, whatsapp: profile ? profile.telepon : null });
  if (includeTeam) {
    let query = supabaseAdmin.from("team_members").select("member_email, member_whatsapp").eq("owner_id", companyId).eq("status", "active");
    if (roleFilter) query = query.eq("role", roleFilter);
    const { data: members } = await query;
    (members || []).forEach(m => recipients.push({ email: m.member_email, whatsapp: m.member_whatsapp }));
  }
  return recipients;
}

// Sama seperti stokQty() di www/app.js -- dihitung ulang di sini karena
// tabel stok_material menyimpan stok_awal + riwayat transaksi (jsonb),
// bukan kuantitas jadi.
function computeStokQty(item) {
  let qty = item.stok_awal || 0;
  (item.transactions || []).forEach(t => {
    if (t.tipe === "Masuk") qty += t.qty || 0;
    else if (t.tipe === "Keluar") qty -= t.qty || 0;
  });
  return qty;
}

async function notifyRecipients(recipients, subject, pesan) {
  for (const r of recipients) {
    if (r.whatsapp) await sendWhatsApp(r.whatsapp, pesan);
    if (r.email) await sendEmail(r.email, subject, pesan);
  }
}

// Tanggal & jam dihitung dalam WIB (UTC+7, tanpa DST) -- server bisa saja
// berjalan di zona UTC, dan ringkasan "hari ini" harus mengikuti hari
// kalender pemiliknya, bukan hari UTC (pelajaran dari bug uang makan
// mingguan di www/app.js).
function wibNow() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}
function wibTodayIso() {
  return wibNow().toISOString().slice(0, 10);
}
const rp = n => `Rp${(n || 0).toLocaleString("id-ID")}`;

// Ringkasan harian untuk Owner (Gelombang 3): satu pesan tiap sore berisi
// uang masuk/keluar hari itu, piutang & utang yang harus dikejar, dan
// follow-up yang jatuh tempo -- supaya Owner tetap memantau tanpa harus
// membuka aplikasi. Dikirim HANYA setelah jam kirim WIB (default 17:00,
// bisa diubah lewat env RINGKASAN_HARIAN_JAM); pola cooldown reminder_log
// yang sama menjaga maksimal sekali sehari.
async function kirimRingkasanHarian(supabaseAdmin, c) {
  const jamKirim = parseInt(process.env.RINGKASAN_HARIAN_JAM || "17", 10);
  if (wibNow().getUTCHours() < jamKirim) return false;
  if (!await shouldSend(supabaseAdmin, c.company_id, "ringkasan_harian")) return false;
  const today = wibTodayIso();

  const { data: txnHariIni } = await supabaseAdmin.from("kas_usaha_transaksi")
    .select("tipe, status, jumlah")
    .eq("company_id", c.company_id)
    .eq("tanggal", today);
  const masuk = (txnHariIni || []).filter(t => t.tipe === "Masuk" && (t.status || "lunas") === "lunas");
  const keluar = (txnHariIni || []).filter(t => t.tipe === "Keluar" && (t.status || "lunas") !== "menunggu_persetujuan");
  const totalMasuk = masuk.reduce((s, t) => s + (t.jumlah || 0), 0);
  const totalKeluar = keluar.reduce((s, t) => s + Math.max(0, t.jumlah || 0), 0);

  const { data: piutangRows } = await supabaseAdmin.from("kas_usaha_transaksi")
    .select("jumlah")
    .eq("company_id", c.company_id)
    .eq("tipe", "Masuk")
    .eq("status", "pending");
  const totalPiutang = (piutangRows || []).reduce((s, t) => s + (t.jumlah || 0), 0);

  // Utang usaha jatuh tempo <= 7 hari yang masih ada sisanya (pembayaran
  // tertaut lewat kas_usaha_transaksi.sumber_utang_id).
  const batasUtang = new Date(wibNow().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: utangRows } = await supabaseAdmin.from("utang_usaha")
    .select("id, pemasok_nama, jumlah, jatuh_tempo")
    .eq("company_id", c.company_id)
    .lte("jatuh_tempo", batasUtang);
  let utangSegera = [];
  if ((utangRows || []).length) {
    const { data: bayarRows } = await supabaseAdmin.from("kas_usaha_transaksi")
      .select("sumber_utang_id, jumlah")
      .eq("company_id", c.company_id)
      .in("sumber_utang_id", utangRows.map(u => u.id));
    const dibayar = {};
    (bayarRows || []).forEach(b => { dibayar[b.sumber_utang_id] = (dibayar[b.sumber_utang_id] || 0) + (b.jumlah || 0); });
    utangSegera = utangRows
      .map(u => ({ ...u, sisa: (u.jumlah || 0) - (dibayar[u.id] || 0) }))
      .filter(u => u.sisa > 0);
  }

  const { data: followUp } = await supabaseAdmin.from("klien")
    .select("nama")
    .eq("company_id", c.company_id)
    .lte("follow_up_berikutnya", today)
    .not("tahap", "in", "(Selesai,Hilang)");

  const adaIsi = (txnHariIni || []).length || utangSegera.length || (followUp || []).length;
  if (!adaIsi) return false; // hari benar-benar sepi -- jangan kirim pesan kosong

  const baris = [
    `📊 Ringkasan Harian ${today} -- ${c.company || "Perusahaan Anda"}`,
    "",
    `💵 Uang masuk hari ini: ${rp(totalMasuk)} (${masuk.length} transaksi)`,
    `💸 Uang keluar hari ini: ${rp(totalKeluar)} (${keluar.length} transaksi)`,
    `📈 Selisih: ${rp(totalMasuk - totalKeluar)}`,
    `🧾 Piutang belum cair (total): ${rp(totalPiutang)}`
  ];
  if (utangSegera.length) {
    const totalUtang = utangSegera.reduce((s, u) => s + u.sisa, 0);
    baris.push(`💳 Utang jatuh tempo ≤7 hari: ${utangSegera.length} tagihan, total ${rp(totalUtang)}`);
    utangSegera.slice(0, 5).forEach(u => baris.push(`   - ${u.pemasok_nama || "(tanpa nama)"}: sisa ${rp(u.sisa)} (jatuh tempo ${u.jatuh_tempo})`));
  }
  if ((followUp || []).length) {
    baris.push(`📞 Follow-up klien jatuh tempo: ${followUp.length} klien (${followUp.slice(0, 5).map(k => k.nama).join(", ")}${followUp.length > 5 ? ", ..." : ""})`);
  }
  baris.push("", "Buka aplikasi untuk detail lengkap.");

  const recipients = await getRecipients(supabaseAdmin, c.company_id, false);
  await notifyRecipients(recipients, `Ringkasan Harian ${today}`, baris.join("\n"));
  await markSent(supabaseAdmin, c.company_id, "ringkasan_harian");
  return true;
}

async function checkAndSendReminders(supabaseAdmin) {
  if (!supabaseAdmin) return { skipped: true };

  const { data: companies, error } = await supabaseAdmin.from("company_profile").select("company_id, company");
  if (error) {
    console.error("[reminders] gagal ambil daftar perusahaan:", error.message);
    return { error: error.message };
  }

  const today = new Date().toISOString().slice(0, 10);
  let terkirim = 0;

  for (const c of companies || []) {
    try {
      // ----- Follow-up Klien jatuh tempo -----
      const { data: klienJatuhTempo } = await supabaseAdmin.from("klien")
        .select("nama, tahap, follow_up_berikutnya")
        .eq("company_id", c.company_id)
        .lte("follow_up_berikutnya", today)
        .not("tahap", "in", "(Selesai,Hilang)");
      if ((klienJatuhTempo || []).length && await shouldSend(supabaseAdmin, c.company_id, "follow_up_klien")) {
        const daftar = klienJatuhTempo.map(k => `- ${k.nama} (${k.tahap}, jatuh tempo ${k.follow_up_berikutnya})`).join("\n");
        const pesan = `🔔 Pengingat Follow-up Klien -- ${c.company || "Perusahaan Anda"}\n\nAda ${klienJatuhTempo.length} klien yang follow-up-nya jatuh tempo:\n${daftar}`;
        const recipients = await getRecipients(supabaseAdmin, c.company_id, true);
        await notifyRecipients(recipients, "Pengingat Follow-up Klien", pesan);
        await markSent(supabaseAdmin, c.company_id, "follow_up_klien");
        terkirim++;
      }

      // ----- Kas Perusahaan menunggu persetujuan -----
      const { data: kasMenunggu } = await supabaseAdmin.from("kas_usaha_transaksi")
        .select("keterangan, jumlah")
        .eq("company_id", c.company_id)
        .eq("status", "menunggu_persetujuan");
      if ((kasMenunggu || []).length && await shouldSend(supabaseAdmin, c.company_id, "kas_menunggu_persetujuan")) {
        const totalRp = kasMenunggu.reduce((s, t) => s + (t.jumlah || 0), 0);
        const daftar = kasMenunggu.map(t => `- ${t.keterangan || "(tanpa keterangan)"} (Rp${(t.jumlah || 0).toLocaleString("id-ID")})`).join("\n");
        const pesan = `⏳ Kas Perusahaan Menunggu Persetujuan -- ${c.company || "Perusahaan Anda"}\n\nAda ${kasMenunggu.length} transaksi pengeluaran menunggu persetujuan Anda, total Rp${totalRp.toLocaleString("id-ID")}:\n${daftar}`;
        const recipients = await getRecipients(supabaseAdmin, c.company_id, false);
        await notifyRecipients(recipients, "Kas Perusahaan Menunggu Persetujuan", pesan);
        await markSent(supabaseAdmin, c.company_id, "kas_menunggu_persetujuan");
        terkirim++;
      }

      // ----- Termin/Piutang jatuh tempo (Fase 1.2) -- transaksi Kas Masuk
      // berstatus "pending" (belum cair) yang tanggal perkiraannya sudah
      // lewat, supaya klien segera ditagih alih-alih baru ketahuan saat
      // dicek manual di Proyeksi Arus Kas / Neraca. -----
      const { data: terminJatuhTempo } = await supabaseAdmin.from("kas_usaha_transaksi")
        .select("keterangan, jumlah, tanggal")
        .eq("company_id", c.company_id)
        .eq("tipe", "Masuk")
        .eq("status", "pending")
        .lt("tanggal", today);
      if ((terminJatuhTempo || []).length && await shouldSend(supabaseAdmin, c.company_id, "termin_jatuh_tempo")) {
        const totalRp = terminJatuhTempo.reduce((s, t) => s + (t.jumlah || 0), 0);
        const daftar = terminJatuhTempo.map(t => `- ${t.keterangan || "(tanpa keterangan)"} (Rp${(t.jumlah || 0).toLocaleString("id-ID")}, jatuh tempo ${t.tanggal})`).join("\n");
        const pesan = `💰 Pengingat Termin/Piutang Jatuh Tempo -- ${c.company || "Perusahaan Anda"}\n\nAda ${terminJatuhTempo.length} termin yang belum cair & sudah lewat tanggal perkiraan, total Rp${totalRp.toLocaleString("id-ID")}:\n${daftar}\n\nSegera hubungi klien untuk menagih.`;
        const recipients = await getRecipients(supabaseAdmin, c.company_id, true);
        await notifyRecipients(recipients, "Pengingat Termin/Piutang Jatuh Tempo", pesan);
        await markSent(supabaseAdmin, c.company_id, "termin_jatuh_tempo");
        terkirim++;
      }

      // ----- Stok Material menipis (Fase 1.3) -- barang yang sisa
      // kuantitasnya sudah di bawah/sama dengan Stok Minimum yang diset
      // per barang, supaya bisa dipesan ulang sebelum benar-benar habis
      // dan menghambat proyek berjalan. -----
      const { data: stokRows } = await supabaseAdmin.from("stok_material")
        .select("nama, satuan, stok_awal, stok_minimum, transactions")
        .eq("company_id", c.company_id);
      const stokMenipis = (stokRows || [])
        .map(s => ({ ...s, qty: computeStokQty(s) }))
        .filter(s => s.qty <= (s.stok_minimum || 0));
      if (stokMenipis.length && await shouldSend(supabaseAdmin, c.company_id, "stok_menipis")) {
        const daftar = stokMenipis.map(s => `- ${s.nama}: sisa ${s.qty} ${s.satuan || ""} (batas minimum ${s.stok_minimum || 0})`).join("\n");
        const pesan = `📦 Pengingat Stok Menipis -- ${c.company || "Perusahaan Anda"}\n\nAda ${stokMenipis.length} material yang stoknya sudah di bawah/sama dengan batas minimum:\n${daftar}\n\nSegera pesan ulang supaya proyek tidak terhambat.`;
        const recipients = await getRecipients(supabaseAdmin, c.company_id, true, "admin");
        await notifyRecipients(recipients, "Pengingat Stok Menipis", pesan);
        await markSent(supabaseAdmin, c.company_id, "stok_menipis");
        terkirim++;
      }

      // ----- Ringkasan harian Owner (Gelombang 3) -----
      if (await kirimRingkasanHarian(supabaseAdmin, c)) terkirim++;
    } catch (err) {
      console.error(`[reminders] gagal proses perusahaan ${c.company_id}:`, err.message);
    }
  }

  if (terkirim) console.log(`[reminders] ${terkirim} pengingat terkirim.`);
  return { terkirim, total: (companies || []).length };
}

module.exports = { checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS };
