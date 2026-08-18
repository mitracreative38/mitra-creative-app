-- Fase 1.2: Pengingat Termin/Piutang Jatuh Tempo -- perluasan sistem
-- pengingat WA/Email otomatis (Fase 1.0, fix20.sql) dengan jenis baru:
-- "termin_jatuh_tempo" (transaksi Kas Masuk berstatus "pending" yang
-- tanggal perkiraan cairnya sudah lewat).
--
-- Kolom `jenis` di tabel reminder_log dibatasi dengan CHECK constraint
-- ('follow_up_klien', 'kas_menunggu_persetujuan') sejak fix20.sql --
-- perlu di-drop & dibuat ulang dengan daftar yang sudah ditambah, karena
-- Postgres tidak punya "ALTER CONSTRAINT ... ADD VALUE" untuk CHECK
-- (beda dari enum type).
alter table reminder_log drop constraint if exists reminder_log_jenis_check;
alter table reminder_log add constraint reminder_log_jenis_check
  check (jenis in ('follow_up_klien', 'kas_menunggu_persetujuan', 'termin_jatuh_tempo'));

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
