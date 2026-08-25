-- Fix 43: kolom sumber_aset_tetap_id di kas_usaha_transaksi.
-- Dipakai fitur integrasi "aset tetap Dijual otomatis tercatat sebagai
-- Kas Masuk": transaksi Kas hasil penjualan aset bertaut ke aset tetapnya,
-- sehingga tidak dobel catat dan ikut terhapus/terubah kalau status aset
-- diubah lagi.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table kas_usaha_transaksi
  add column if not exists sumber_aset_tetap_id text;
