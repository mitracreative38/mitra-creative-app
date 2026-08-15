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
-- Kolom id yang mau diubah tipenya masih "dikunci" oleh kaitan foreign key
-- dari tabel lain, jadi kaitannya perlu dilepas dulu, tipe kolomnya
-- diubah, baru kaitannya disambung lagi.
--
-- Tabel-tabel ini masih kosong (aplikasi belum memakainya sama sekali),
-- jadi perbaikan ini aman — tidak ada data yang hilang.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

-- 1) Lepas semua kaitan foreign key yang menunjuk ke kolom id bertipe uuid
alter table rab drop constraint if exists rab_klien_id_fkey;
alter table penawaran drop constraint if exists penawaran_rab_id_fkey;
alter table penawaran drop constraint if exists penawaran_klien_id_fkey;
alter table proyek drop constraint if exists proyek_klien_id_fkey;
alter table kas_usaha_transaksi drop constraint if exists kas_usaha_transaksi_klien_id_fkey;
alter table kas_usaha_transaksi drop constraint if exists kas_usaha_transaksi_proyek_id_fkey;
alter table karyawan_gaji drop constraint if exists karyawan_gaji_karyawan_id_fkey;
alter table absensi drop constraint if exists absensi_karyawan_id_fkey;

-- 2) Ubah semua kolom id & kolom yang mengaitkan ke id itu jadi text
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

-- 3) Sambung lagi kaitan foreign key-nya (sekarang sama-sama text)
alter table rab add constraint rab_klien_id_fkey
  foreign key (klien_id) references klien(id) on delete set null;
alter table penawaran add constraint penawaran_rab_id_fkey
  foreign key (rab_id) references rab(id) on delete set null;
alter table penawaran add constraint penawaran_klien_id_fkey
  foreign key (klien_id) references klien(id) on delete set null;
alter table proyek add constraint proyek_klien_id_fkey
  foreign key (klien_id) references klien(id) on delete set null;
alter table kas_usaha_transaksi add constraint kas_usaha_transaksi_klien_id_fkey
  foreign key (klien_id) references klien(id) on delete set null;
alter table kas_usaha_transaksi add constraint kas_usaha_transaksi_proyek_id_fkey
  foreign key (proyek_id) references proyek(id) on delete set null;
alter table karyawan_gaji add constraint karyawan_gaji_karyawan_id_fkey
  foreign key (karyawan_id) references karyawan(id) on delete cascade;
alter table absensi add constraint absensi_karyawan_id_fkey
  foreign key (karyawan_id) references karyawan(id) on delete cascade;

-- 4) Kolom klien yang kelupaan di rancangan awal (ada di data aplikasi
-- tapi belum ada tempatnya di tabel).
alter table klien add column if not exists kontak_nama text;
alter table klien add column if not exists telepon text;
alter table klien add column if not exists email text;
alter table klien add column if not exists alamat text;
alter table klien add column if not exists riwayat_kontak jsonb not null default '[]';
