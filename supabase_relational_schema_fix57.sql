-- Fix 57: kolom skema_pembayaran yang TERTINGGAL di tabel proyek.
--
-- Fix 51 dulu menambahkan skema_pembayaran ke rab & penawaran + kolom
-- rencana_termin ke proyek -- tapi aplikasi ternyata juga mengirim
-- skema_pembayaran untuk tabel PROYEK, dan kolomnya tidak pernah dibuat.
-- Akibatnya SETIAP upsert mirror proyek ditolak PostgREST ("Could not find
-- the 'skema_pembayaran' column of 'proyek' in the schema cache") dan
-- proyek-proyek baru macet di perangkat pembuatnya (kasus 19 proyek yang
-- tidak muncul di perangkat Admin, 23/9).
--
-- Aman dijalankan berkali-kali (idempotent).
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table proyek add column if not exists skema_pembayaran jsonb not null default '[]'::jsonb;
