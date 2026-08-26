-- Fix 47: kolom golongan (penggolongan) di tabel stok_material.
-- Dipakai fitur pengelompokan Stok Material & Alat: Bahan Baku, Consumable
-- Produksi, Consumable Lapangan, Suku Cadang/Sparepart, Alat/Perkakas,
-- Lainnya -- terpisah dari kolom kategori (Material/Alat) yang sudah ada
-- dan dipakai integrasi AHSP, supaya pengawasan stok lebih rapi dan mudah
-- dicek per golongan. Barang lama otomatis masuk golongan "Lainnya".
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table stok_material
  add column if not exists golongan text not null default 'Lainnya';
