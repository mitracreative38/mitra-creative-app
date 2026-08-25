-- Fix 45: kolom pembinaan di tabel karyawan.
-- Dipakai modul Catatan Pembinaan/SP (SOP HRD): riwayat prestasi, teguran,
-- dan SP1-SP3 per karyawan -- tanggal, jenis, uraian, dan siapa pencatatnya
-- (terpatri dari akun login). Surat SP/teguran/penghargaan resmi bisa
-- dicetak dari aplikasi.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table karyawan
  add column if not exists pembinaan jsonb not null default '[]';
