-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Perbaikan tambahan (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix4.sql)
--
-- Ditemukan saat memindah modul Proyek (Fase C, lanjutan setelah Klien,
-- AHSP, RAB & Penawaran): tabel proyek kelupaan banyak kolom -- rancangan
-- awal (Fase A) menebak bentuk datanya sebelum benar-benar melihat kode
-- modul Proyek yang sesungguhnya (paling kompleks di aplikasi ini: ada
-- progress fisik, dokumen SPK/BAST, subkontraktor, belanja material).
-- Kolom lama (anggaran, progress, sumber_id, sumber_tipe) dibiarkan ada
-- tapi tidak dipakai -- tidak ada salahnya, dan aman daripada menghapus.
--
-- Aman dijalankan kapan saja -- cuma menambah kolom baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table proyek add column if not exists klien text;
alter table proyek add column if not exists lokasi text;
alter table proyek add column if not exists nilai_kontrak numeric not null default 0;
alter table proyek add column if not exists tanggal_mulai date;
alter table proyek add column if not exists tanggal_selesai date;
alter table proyek add column if not exists biaya_bahan numeric not null default 0;
alter table proyek add column if not exists biaya_upah numeric not null default 0;
alter table proyek add column if not exists biaya_lain numeric not null default 0;
alter table proyek add column if not exists karyawan_ids jsonb not null default '[]';
alter table proyek add column if not exists subkontraktor jsonb not null default '[]';
alter table proyek add column if not exists belanja_material jsonb not null default '[]';
alter table proyek add column if not exists sumber_rab_id text references rab(id) on delete set null;
alter table proyek add column if not exists sumber_penawaran_id text references penawaran(id) on delete set null;
alter table proyek add column if not exists progress_rencana jsonb not null default '[]';
alter table proyek add column if not exists progress_realisasi jsonb not null default '[]';
