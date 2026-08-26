-- Fix 49: dua kolom jsonb baru untuk fitur catatan tindak lanjut.
-- (a) proyek.pekerjaan_tambahan -- Catatan Pekerjaan Susulan: pekerjaan
--     tambahan yang muncul belakangan (permintaan klien/temuan lapangan),
--     dicatat dulu lalu ditindaklanjuti kapan saja (dibuat penawaran /
--     dikerjakan / selesai).
-- (b) laporan_kerja.tindak_lanjut -- Rencana Tindak Lanjut hasil survey/
--     laporan kerja: daftar item yang mau dibuatkan penawaran atau
--     dikerjakan langsung, dengan status yang selalu bisa diperbarui.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table proyek
  add column if not exists pekerjaan_tambahan jsonb not null default '[]';

alter table laporan_kerja
  add column if not exists tindak_lanjut jsonb not null default '[]';
