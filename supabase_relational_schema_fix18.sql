-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE 0.8 — Halaman KPI (Penjualan/Marketing, Proyek/Operasional,
-- Keuangan, Tim/Karyawan)
-- (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix17.sql)
--
-- Menambah 2 kolom target bulanan (diisi manual di halaman Pengaturan)
-- yang dipakai halaman KPI baru untuk membandingkan Omzet dan Laba Bersih
-- bulan berjalan terhadap target -- kolom lain di tabel company_profile
-- (approval_threshold, dst) sudah ada sejak Fase 0.4.
--
-- Aman dijalankan berkali-kali (idempotent) -- add column if not exists.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table company_profile add column if not exists target_omzet_bulanan numeric not null default 0;
alter table company_profile add column if not exists target_laba_bersih_bulanan numeric not null default 0;
