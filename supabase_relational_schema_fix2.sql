-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Perbaikan tambahan (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix.sql)
--
-- Ditemukan saat memindah modul AHSP (Fase C, lanjutan setelah Klien):
-- tabel ahsp kelupaan beberapa kolom yang ternyata dipakai aplikasi.
-- Aman dijalankan kapan saja -- cuma menambah kolom baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table ahsp add column if not exists kategori text;
alter table ahsp add column if not exists mode text;
alter table ahsp add column if not exists harga_manual numeric not null default 0;
alter table ahsp add column if not exists overhead numeric not null default 0;
alter table ahsp add column if not exists riwayat_harga jsonb not null default '[]';
