-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE 1.0 — Pengingat WhatsApp/Email otomatis (follow-up Klien jatuh
-- tempo & transaksi Kas Perusahaan menunggu persetujuan)
-- (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix19.sql)
--
-- Tabel kecil untuk melacak kapan terakhir kali pengingat jenis tertentu
-- dikirim ke suatu perusahaan -- supaya pengecekan yang jalan tiap jam
-- (server/index.js) tidak mengirim WA/email berkali-kali di hari yang
-- sama, cukup sekali per jenis pengingat per hari. Owner-only karena
-- murni state internal server (dibaca/ditulis pakai service role di
-- server/lib/reminders.js), tidak pernah diakses langsung dari klien.
--
-- Aman dijalankan berkali-kali (idempotent).
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

create table if not exists reminder_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  jenis text not null check (jenis in ('follow_up_klien', 'kas_menunggu_persetujuan')),
  last_sent_at timestamptz not null default now(),
  unique (company_id, jenis)
);
alter table reminder_log enable row level security;
-- Tidak ada kebijakan sama sekali untuk siapa pun -- tabel ini murni
-- dibaca/ditulis lewat service role di server (bypass RLS), klien tidak
-- pernah perlu mengaksesnya langsung.
