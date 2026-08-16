-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE 0.6 — Penawaran multi-brand (Mitra Creative / Mata Resolusi)
-- (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix15.sql)
--
-- Owner punya anak cabang "mata.resolusi" yang dipakai sebagai PEMBANDING
-- di tender -- Penawaran atas nama Mata Resolusi sengaja dibuat dengan
-- harga sedikit lebih tinggi dari Mitra Creative supaya Mitra Creative
-- terlihat lebih kompetitif. Perubahan ini menambah kolom di tabel
-- "penawaran" yang sudah ada (bukan tabel baru) supaya kedua brand tetap
-- 1 daftar yang sama, cuma dibedakan lewat kolom "brand":
--
-- - brand: 'mitra' (default, penawaran biasa) atau 'mataresolusi'.
-- - markup_percent: berapa persen markup yang dipakai saat dokumen ini
--   dibuat (cuma diisi kalau brand='mataresolusi', dan cuma buat referensi
--   tampilan -- angka di tiap item tetap yang menentukan total, bukan
--   kolom ini).
-- - source_penawaran_id: kalau dokumen ini hasil "Buat Pembanding" dari
--   sebuah Penawaran Mitra Creative, id penawaran asalnya dicatat di sini
--   (beda dari revisi_dari_id yang dipakai untuk fitur "Duplikat sebagai
--   Revisi" -- ini bukan revisi, tapi dokumen brand lain yang berdiri
--   sendiri).
--
-- Juga menambah 2 kolom baru di company_profile: markup default (%) untuk
-- Mata Resolusi, dan counter nomor urut terpisah supaya penomoran Mata
-- Resolusi tidak "bocor" berurutan dengan nomor Mitra Creative.
--
-- Aman dijalankan berkali-kali (idempotent) -- add column if not exists.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table penawaran add column if not exists brand text not null default 'mitra' check (brand in ('mitra', 'mataresolusi'));
alter table penawaran add column if not exists markup_percent numeric;
alter table penawaran add column if not exists source_penawaran_id text references penawaran(id) on delete set null;

alter table company_profile add column if not exists mata_resolusi_markup_percent numeric not null default 5;
alter table company_profile add column if not exists mata_resolusi_penawaran_counter integer not null default 0;
