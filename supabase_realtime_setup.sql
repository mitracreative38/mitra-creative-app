-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Aktifkan sinkronisasi REAL-TIME (jalankan sekali di Supabase SQL Editor)
--
-- Ini tambahan setelah supabase_setup.sql. Tanpa ini, sinkronisasi tetap
-- jalan, tapi perangkat lain baru menerima data terbaru saat login/refresh.
-- Dengan ini, perubahan di satu perangkat langsung muncul otomatis di
-- perangkat lain yang sedang terbuka, tanpa perlu refresh manual.
--
-- Cara pakai:
-- 1. Buka project Supabase Anda di supabase.com
-- 2. Klik menu "SQL Editor" di sidebar kiri
-- 3. Klik "New query", tempel seluruh isi file ini, lalu klik "Run"
-- ============================================================================

alter publication supabase_realtime add table app_state;
