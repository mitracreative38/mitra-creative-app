-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Fix 31: Jadwal servis alat
--
-- Menambah kolom tanggal servis/kalibrasi berikutnya di tabel alat.
-- Alat yang jadwal servisnya sudah lewat atau tinggal <= 14 hari muncul
-- di panel "Perlu Perhatian" Dashboard.
--
-- Aman dijalankan berkali-kali (idempotent).
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table alat add column if not exists servis_berikutnya date;

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
