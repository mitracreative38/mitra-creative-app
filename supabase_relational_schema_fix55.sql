-- Fix 55: Harga Nego & analisa kalah tender di Penawaran.
--
-- Menambah 2 kolom pada tabel penawaran:
--   nego         : riwayat negosiasi harga per ronde
--                  [{id, tanggal, nilai, catatan}, ...] — nilai terakhir
--                  adalah harga deal yang dipakai saat ACC → Proyek.
--   alasan_kalah : diisi saat penawaran DITOLAK,
--                  {aspek: ["Harga", "Kualitas/Spesifikasi", ...],
--                   catatan, tanggal} — bahan rekap Analisa Kalah Tender
--                  di KPI Penjualan.
--
-- Jalankan sekali di Supabase SQL Editor SETELAH deploy kode versi ini.
-- Aman diulang (add column if not exists). RLS tabel penawaran tidak
-- berubah — kolom baru otomatis mengikuti kebijakan baris yang sudah ada.

alter table penawaran
  add column if not exists nego jsonb not null default '[]'::jsonb,
  add column if not exists alasan_kalah jsonb;
