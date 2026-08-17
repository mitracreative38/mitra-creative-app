-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE 0.9 — Manajemen Konstruksi di halaman Proyek: Jadwal Pekerjaan
-- (Gantt sederhana), Laporan Harian Lapangan, dan Perubahan Pekerjaan
-- (Adendum) yang otomatis menyesuaikan Nilai Kontrak saat disetujui.
-- (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix18.sql)
--
-- 3 kolom baru di tabel proyek, mengikuti pola kolom jsonb yang sudah
-- ada (progress_rencana, progress_realisasi, dokumen, dst) -- masing-
-- masing menyimpan array item sebagai satu kolom, konsisten dengan
-- pola array-per-proyek yang sudah dipakai modul lain di tabel ini.
--
-- Aman dijalankan berkali-kali (idempotent) -- add column if not exists.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table proyek add column if not exists jadwal_pekerjaan jsonb not null default '[]';
alter table proyek add column if not exists laporan_harian jsonb not null default '[]';
alter table proyek add column if not exists perubahan_pekerjaan jsonb not null default '[]';
