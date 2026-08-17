-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE 0.7 — Perbaikan dari audit menyeluruh RAB/Penawaran/Kas/Stok/Gaji
-- (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix16.sql)
--
-- Audit menemukan bug: tombol "Buat Penawaran dari RAB Ini" menyalin item,
-- PPN, dan PPh dari RAB ke Penawaran baru, TAPI diam-diam tidak menyalin
-- rab.biayaLain ("Biaya Lain-lain") -- karena tabel/model "penawaran" sama
-- sekali tidak punya kolom setara. Akibatnya harga yang ditawarkan ke
-- klien bisa lebih murah dari yang seharusnya tanpa peringatan apa pun.
-- Diperbaiki dengan menambah kolom biaya_lain di penawaran (persis seperti
-- yang sudah ada di rab), dan kode aplikasi (www/app.js, server/lib/print.js)
-- sekarang menyalin nilainya saat konversi RAB -> Penawaran.
--
-- Sekalian menambah fitur "Duplikat sebagai Revisi" untuk RAB (sebelumnya
-- cuma ada di Penawaran) -- supaya user bisa merevisi RAB tanpa menimpa
-- versi lama dan kehilangan riwayat, sama seperti pola yang sudah ada di
-- Penawaran (revisi_dari_id/revisi_ke).
--
-- Aman dijalankan berkali-kali (idempotent) -- add column if not exists.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table penawaran add column if not exists biaya_lain numeric not null default 0;

alter table rab add column if not exists revisi_dari_id text references rab(id) on delete set null;
alter table rab add column if not exists revisi_ke integer not null default 0;
