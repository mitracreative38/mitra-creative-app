-- Fase 1.3: Notifikasi Stok Menipis -- perluasan sistem pengingat WA/Email
-- otomatis (Fase 1.0, fix20.sql) dengan jenis baru: "stok_menipis"
-- (Stok Material yang sisa kuantitasnya sudah di bawah/sama dengan
-- Stok Minimum yang diset per barang).
--
-- Sama seperti fix22.sql: kolom `jenis` di reminder_log dibatasi CHECK
-- constraint, perlu di-drop & dibuat ulang dengan daftar yang ditambah
-- (Postgres tidak punya "ALTER CONSTRAINT ... ADD VALUE" untuk CHECK).
alter table reminder_log drop constraint if exists reminder_log_jenis_check;
alter table reminder_log add constraint reminder_log_jenis_check
  check (jenis in ('follow_up_klien', 'kas_menunggu_persetujuan', 'termin_jatuh_tempo', 'stok_menipis'));

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
