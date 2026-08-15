-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Perbaikan tambahan (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix2.sql)
--
-- Ditemukan saat memindah modul RAB (Fase C, lanjutan setelah Klien & AHSP):
-- tabel rab kelupaan beberapa kolom yang ternyata dipakai aplikasi.
-- Aman dijalankan kapan saja -- cuma menambah kolom baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table rab add column if not exists klien text;
alter table rab add column if not exists lokasi text;
alter table rab add column if not exists kategori text;
alter table rab add column if not exists tanggal date;
alter table rab add column if not exists ppn numeric not null default 0;
alter table rab add column if not exists pph numeric not null default 0;
alter table rab add column if not exists biaya_lain numeric not null default 0;
alter table rab add column if not exists proyek_id text references proyek(id) on delete set null;
