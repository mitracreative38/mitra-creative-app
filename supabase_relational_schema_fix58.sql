-- Fix 58: kolom acuan_penawaran di tabel proyek.
--
-- Permintaan Owner (9/10): rincian perhitungan penawaran jangan hilang
-- saat naik jadi proyek -- aplikasi kini menyimpan SNAPSHOT rincian item
-- + totals penawaran/RAB sumber di proyek (panel "Acuan Perhitungan
-- Penawaran" di Margin Proyek, baca-saja, tahan walau dokumen sumbernya
-- dihapus). Kolom ini menyimpan snapshot itu di cloud supaya ikut
-- tersinkron ke perangkat Admin.
--
-- Aplikasi tetap aman walau SQL ini belum dijalankan (kolomnya dilepas
-- otomatis saat sinkron), tapi snapshot-nya tidak ikut ke cloud.
-- Aman dijalankan berkali-kali (idempotent).
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table proyek add column if not exists acuan_penawaran jsonb;
