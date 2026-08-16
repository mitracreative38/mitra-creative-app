// Backup otomatis terjadwal (Fase 0.2) -- mengambil cuplikan (snapshot)
// blob app_state tiap perusahaan secara berkala dan menyimpannya ke tabel
// app_backups, supaya keamanan data tidak lagi bergantung pada Owner
// mengingat untuk export manual.
//
// Dipicu lewat pengecekan periodik (bukan cron absolut) supaya bertahan
// terhadap restart/redeploy Railway: tiap kali checkAndRunBackups() jalan,
// dicek dari DATABASE (bukan memori proses) kapan backup TERAKHIR tiap
// perusahaan, dan cuma bikin snapshot baru kalau sudah lewat BACKUP_INTERVAL_MS
// sejak itu -- jadi tetap benar walau prosesnya baru saja restart.
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // sekali per ~24 jam per perusahaan
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // simpan 30 hari, lebih lama otomatis dibuang

async function checkAndRunBackups(supabaseAdmin) {
  if (!supabaseAdmin) return { skipped: true };

  const { data: companies, error: companiesErr } = await supabaseAdmin.from("app_state").select("user_id, data");
  if (companiesErr) {
    console.error("[backup] gagal ambil daftar app_state:", companiesErr.message);
    return { error: companiesErr.message };
  }

  const cutoff = new Date(Date.now() - BACKUP_INTERVAL_MS).toISOString();
  let backedUp = 0;

  for (const row of companies || []) {
    try {
      const { data: lastBackup, error: lastErr } = await supabaseAdmin
        .from("app_backups")
        .select("created_at")
        .eq("company_id", row.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastErr) throw lastErr;

      const needsBackup = !lastBackup || lastBackup.created_at < cutoff;
      if (!needsBackup) continue;

      const { error: insertErr } = await supabaseAdmin.from("app_backups").insert({
        company_id: row.user_id,
        data: row.data
      });
      if (insertErr) throw insertErr;
      backedUp++;

      // Buang backup lebih lama dari masa simpan, supaya tabel tidak tumbuh tak terbatas.
      const pruneCutoff = new Date(Date.now() - RETENTION_MS).toISOString();
      await supabaseAdmin.from("app_backups").delete().eq("company_id", row.user_id).lt("created_at", pruneCutoff);
    } catch (err) {
      console.error(`[backup] gagal backup company ${row.user_id}:`, err.message);
    }
  }

  if (backedUp) console.log(`[backup] ${backedUp} perusahaan berhasil di-backup.`);
  return { backedUp, total: (companies || []).length };
}

module.exports = { checkAndRunBackups, BACKUP_INTERVAL_MS };
