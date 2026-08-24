-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Fix 29: Update live (Realtime) tidak pernah jalan untuk 16 tabel relasional
--
-- Ditemukan: supabase_realtime_setup.sql (dari awal aplikasi ini dibuat)
-- CUMA mendaftarkan tabel app_state ke "Realtime publication" Supabase.
-- Sejak Fase 0.4 (jalur baca aplikasi dipindah dari blob app_state ke 16
-- tabel relasional terpisah), kode subscribeRealtime() di www/app.js SUDAH
-- benar mendengarkan perubahan di ke-16 tabel itu (REALTIME_RELATIONAL_
-- TABLES) -- tapi Supabase TIDAK PERNAH benar-benar mengirim notifikasi
-- perubahannya, karena tabel-tabel itu tidak pernah didaftarkan ke
-- publication. Akibatnya update live (tanpa refresh manual) rusak total
-- sejak Fase 0.4, untuk SEMUA peran -- ini kemungkinan besar akar
-- penyebab sebenarnya di balik keluhan "data yang diinput Admin tidak
-- langsung kebaca di sisi Owner".
--
-- Login/refresh manual TIDAK terdampak bug ini (buildStateFromRelational()
-- selalu query langsung ke tabel, tidak bergantung pada Realtime) -- yang
-- rusak murni "muncul otomatis tanpa perlu refresh".
--
-- Aman dijalankan berkali-kali (ADD TABLE IF NOT EXISTS).
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter publication supabase_realtime add table if not exists company_profile;
alter publication supabase_realtime add table if not exists klien;
alter publication supabase_realtime add table if not exists ahsp;
alter publication supabase_realtime add table if not exists rab;
alter publication supabase_realtime add table if not exists penawaran;
alter publication supabase_realtime add table if not exists proyek;
alter publication supabase_realtime add table if not exists karyawan;
alter publication supabase_realtime add table if not exists stok_material;
alter publication supabase_realtime add table if not exists gudang;
alter publication supabase_realtime add table if not exists pemasok;
alter publication supabase_realtime add table if not exists alat;
alter publication supabase_realtime add table if not exists stok_opname;
alter publication supabase_realtime add table if not exists kas_usaha_transaksi;
alter publication supabase_realtime add table if not exists kas_pribadi_transaksi;
alter publication supabase_realtime add table if not exists karyawan_gaji;
alter publication supabase_realtime add table if not exists kas_saldo_awal;

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
