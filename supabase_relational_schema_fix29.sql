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
-- Pakai blok DO + cek pg_publication_tables (bukan "ADD TABLE IF NOT
-- EXISTS", yang cuma didukung PostgreSQL 15+) supaya aman dijalankan
-- berkali-kali di versi PostgreSQL manapun yang dipakai Supabase.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'company_profile', 'klien', 'ahsp', 'rab', 'penawaran', 'proyek', 'karyawan',
    'stok_material', 'gudang', 'pemasok', 'alat', 'stok_opname',
    'kas_usaha_transaksi', 'kas_pribadi_transaksi', 'karyawan_gaji', 'kas_saldo_awal'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
