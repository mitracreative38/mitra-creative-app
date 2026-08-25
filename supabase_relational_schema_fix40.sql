-- Perbaikan skema #40: Modul QC (Quality Control) Produksi & Lapangan.
-- Kolom baru proyek.qc menyimpan daftar inspeksi QC per proyek (jsonb):
-- jenis (produksi/lapangan), petugas, checklist hasil per item
-- (lulus/perbaikan), status keseluruhan, ACC klien, dan tautan inspeksi
-- ulang. Menempel di tabel proyek yang sudah ada (pola sama seperti
-- kolom tahapan/invoices/bap dari fix33), jadi RLS-nya otomatis
-- mengikuti aturan proyek: Owner + Admin, Marketing tidak ada akses.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table proyek add column if not exists qc jsonb not null default '[]';
