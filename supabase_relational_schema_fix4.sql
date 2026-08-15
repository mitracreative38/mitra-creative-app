-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Perbaikan tambahan (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix3.sql)
--
-- Ditemukan saat memindah modul Penawaran (Fase C, lanjutan setelah Klien,
-- AHSP & RAB): tabel penawaran kelupaan beberapa kolom yang ternyata
-- dipakai aplikasi. Aman dijalankan kapan saja -- cuma menambah kolom baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table penawaran add column if not exists kepada text;
alter table penawaran add column if not exists alamat_klien text;
alter table penawaran add column if not exists perihal text;
alter table penawaran add column if not exists kategori text;
alter table penawaran add column if not exists diskon numeric not null default 0;
alter table penawaran add column if not exists ppn numeric not null default 0;
alter table penawaran add column if not exists pph numeric not null default 0;
alter table penawaran add column if not exists syarat text;
alter table penawaran add column if not exists penutup text;
alter table penawaran add column if not exists ttd_nama text;
alter table penawaran add column if not exists ttd_jabatan text;
alter table penawaran add column if not exists proyek_id text references proyek(id) on delete set null;
alter table penawaran add column if not exists revisi_dari_id text references penawaran(id) on delete set null;
alter table penawaran add column if not exists revisi_ke integer not null default 0;
