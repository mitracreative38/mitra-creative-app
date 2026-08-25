-- Perbaikan skema #42: Integrasi keuangan proyek (Gelombang Integrasi A).
-- Kolom kas_usaha_transaksi.sumber_invoice_id menautkan transaksi Kas
-- Masuk yang dibuat OTOMATIS saat status Invoice diubah jadi "Dibayar" --
-- satu kali input di Invoice langsung tercatat di Kas Perusahaan, Termin
-- proyek, Laba Rugi, Neraca, dan KPI (tidak perlu input ulang manual),
-- dan otomatis terhapus kalau status invoice dibatalkan.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table kas_usaha_transaksi add column if not exists sumber_invoice_id text;
