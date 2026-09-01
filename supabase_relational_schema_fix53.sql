-- Fix 53: kolom sumber_pribadi_id di kas_usaha_transaksi.
-- Transaksi Kas Pribadi Owner bertipe "Masuk" dengan Sumber Dana
-- "Kas Usaha" (prive/penarikan dana pribadi) kini otomatis membuat
-- transaksi Kas Keluar berpasangan di Kas Perusahaan, supaya laporan
-- perusahaan ikut mencatat uang yang keluar. Kolom ini menautkan
-- transaksi Kas Perusahaan otomatis itu ke transaksi Kas Pribadi
-- sumbernya (pola yang sama dengan sumber_sewa_id / sumber_aset_tetap_id).
-- Jalankan sekali di Supabase SQL Editor setelah deploy kode.

alter table kas_usaha_transaksi
  add column if not exists sumber_pribadi_id text;
