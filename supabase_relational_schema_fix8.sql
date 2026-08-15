-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Perbaikan tambahan (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix7.sql)
--
-- Ditemukan saat memindah modul Pemasok (Fase C, lanjutan setelah Klien,
-- AHSP, RAB, Penawaran, Proyek, Karyawan & Stok): tabel "pemasok" rancangan
-- awal (Fase A) menebak kolom "kontak" dan "riwayat_harga" sebelum melihat
-- kode modul yang sesungguhnya. Di aplikasi, field pemasoknya adalah
-- nama/kategori/telepon/alamat/catatan -- dan riwayat harga pembelian
-- TIDAK disimpan di data pemasok sama sekali, melainkan dihitung otomatis
-- dari riwayat transaksi Stok Material & Belanja Material Proyek yang
-- mengaitkan diri ke pemasokId (lihat pemasokRiwayat() di app.js). Jadi
-- kolom riwayat_harga tidak pernah akan terisi -- dibiarkan ada, aman.
--
-- Aman dijalankan kapan saja -- cuma menambah kolom baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table pemasok add column if not exists kategori text;
alter table pemasok add column if not exists telepon text;
alter table pemasok add column if not exists alamat text;
alter table pemasok add column if not exists catatan text;
