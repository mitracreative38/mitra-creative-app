-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Fix 34: Foto nota/bukti pada transaksi Kas Perusahaan
--
-- Kolom jalur lampiran (bucket Storage "lampiran" dari Fix 32) untuk
-- transaksi Kas Perusahaan — dipakai fitur "Biaya Operasional & Lain-lain"
-- di Margin Proyek dan field nota di form transaksi Kas, supaya setiap
-- pengeluaran (bensin, transport, dll) bisa punya bukti fisik.
--
-- Aman dijalankan berkali-kali (idempotent).
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table kas_usaha_transaksi add column if not exists lampiran_path text;

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
