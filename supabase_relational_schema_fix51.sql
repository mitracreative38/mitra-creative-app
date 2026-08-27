-- Fix 51: Skema Pembayaran (DP/Termin/Retensi) terstruktur di Penawaran &
-- RAB, otomatis "dimaterialisasi" jadi Rencana Termin saat proyek di-ACC --
-- supaya tidak perlu ketik ulang tanggal/jumlah tiap kali menagih.
-- Kolom jsonb baru saja, tidak mengubah kebijakan RLS yang sudah ada (RLS
-- Postgres berlaku per baris, bukan per kolom -- kebijakan lama pada
-- tabel rab/penawaran/proyek otomatis berlaku untuk kolom baru ini juga).
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table rab add column if not exists skema_pembayaran jsonb not null default '[]'::jsonb;
alter table penawaran add column if not exists skema_pembayaran jsonb not null default '[]'::jsonb;
alter table proyek add column if not exists rencana_termin jsonb not null default '[]'::jsonb;
