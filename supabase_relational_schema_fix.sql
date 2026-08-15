-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Perbaikan Fase A (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema.sql)
--
-- Ditemukan saat mulai memindah modul Klien (Fase C): kolom "id" di 12
-- tabel Fase A dibuat bertipe uuid, padahal id yang dipakai aplikasi
-- (dihasilkan fungsi uid() di app.js) berupa string acak seperti
-- "m5x2p8k9q1a" — BUKAN format uuid. Kalau tidak diperbaiki, setiap
-- percobaan menyimpan data ke tabel-tabel ini akan gagal.
--
-- Tabel-tabel ini masih kosong (aplikasi belum memakainya sama sekali),
-- jadi perbaikan ini aman — tidak ada data yang hilang.
--
-- Juga menambah beberapa kolom yang kelupaan di rancangan awal tabel klien.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table klien alter column id type text, alter column id drop default;

alter table ahsp alter column id type text, alter column id drop default;

alter table rab alter column id type text, alter column id drop default;
alter table rab alter column klien_id type text;

alter table penawaran alter column id type text, alter column id drop default;
alter table penawaran alter column rab_id type text;
alter table penawaran alter column klien_id type text;

alter table proyek alter column id type text, alter column id drop default;
alter table proyek alter column klien_id type text;
alter table proyek alter column sumber_id type text;

alter table karyawan alter column id type text, alter column id drop default;

alter table karyawan_gaji alter column id type text, alter column id drop default;
alter table karyawan_gaji alter column karyawan_id type text;

alter table absensi alter column id type text, alter column id drop default;
alter table absensi alter column karyawan_id type text;

alter table kas_usaha_transaksi alter column id type text, alter column id drop default;
alter table kas_usaha_transaksi alter column klien_id type text;
alter table kas_usaha_transaksi alter column proyek_id type text;

alter table kas_pribadi_transaksi alter column id type text, alter column id drop default;

alter table stok_material alter column id type text, alter column id drop default;

alter table pemasok alter column id type text, alter column id drop default;

-- Kolom klien yang kelupaan di rancangan awal (ada di data aplikasi tapi
-- belum ada tempatnya di tabel).
alter table klien add column if not exists kontak_nama text;
alter table klien add column if not exists telepon text;
alter table klien add column if not exists email text;
alter table klien add column if not exists alamat text;
alter table klien add column if not exists riwayat_kontak jsonb not null default '[]';
