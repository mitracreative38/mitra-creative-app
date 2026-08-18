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
async function getRecipients(supabaseAdmin, companyId, includeTeam) {
  const recipients = [];
  const { data: ownerUser } = await supabaseAdmin.auth.admin.getUserById(companyId);
  const { data: profile } = await supabaseAdmin.from("company_profile").select("telepon").eq("company_id", companyId).maybeSingle();
  recipients.push({ email: ownerUser && ownerUser.user ? ownerUser.user.email : null, whatsapp: profile ? profile.telepon : null });
  if (includeTeam) {
    const { data: members } = await supabaseAdmin.from("team_members").select("member_email, member_whatsapp").eq("owner_id", companyId).eq("status", "active");
    (members || []).forEach(m => recipients.push({ email: m.member_email, whatsapp: m.member_whatsapp }));
  }
  return recipients;
}

async function notifyRecipients(recipients, subject, pesan) {
  for (const r of recipients) {
    if (r.whatsapp) await sendWhatsApp(r.whatsapp, pesan);
    if (r.email) await sendEmail(r.email, subject, pesan);
  }
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
    } catch (err) {
      console.error(`[reminders] gagal proses perusahaan ${c.company_id}:`, err.message);
    }
  }

  if (terkirim) console.log(`[reminders] ${terkirim} pengingat terkirim.`);
  return { terkirim, total: (companies || []).length };
}

module.exports = { checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS };
