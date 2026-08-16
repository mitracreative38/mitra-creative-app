-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE 0.5 — Log Aktivitas Tim (jalankan sekali di Supabase SQL Editor,
-- SETELAH supabase_relational_schema_fix13.sql)
--
-- Owner menemukan transaksi Kas Perusahaan bisa diubah diam-diam tanpa
-- jejak. Tabel baru ini mencatat SETIAP perubahan (tambah/ubah/hapus) yang
-- dilakukan Admin/Marketing/siapa pun di SEMUA modul, supaya Owner selalu
-- tahu "siapa mengubah apa, kapan, dari nilai apa ke nilai apa" -- append-
-- only, tidak bisa diedit atau dihapus oleh siapa pun termasuk Owner
-- sendiri (sama seperti idiom app_backups di fix11).
--
-- Aman dijalankan kapan saja -- cuma menambah 1 tabel baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  actor_email text not null,
  actor_role text not null check (actor_role in ('owner','admin','marketing')),
  module text not null,
  action text not null check (action in ('create','update','delete')),
  record_id text not null,
  summary text not null,
  diff jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_company_created_idx
  on activity_log (company_id, created_at desc);
create index if not exists activity_log_company_module_idx
  on activity_log (company_id, module, created_at desc);

alter table activity_log enable row level security;

-- Owner boleh baca SEMUA log aktivitas perusahaannya.
create policy "baca aktivitas - owner saja" on activity_log for select
  using (auth.uid() = company_id);

-- Owner/Admin/Marketing boleh MENULIS baris atas nama diri sendiri saja
-- (actor_id dipin ke auth.uid(), tidak bisa dipalsukan jadi orang lain).
create policy "tulis aktivitas - actor dipin" on activity_log for insert
  with check (
    has_company_access(company_id, array['admin','marketing'])
    and actor_id = auth.uid()
  );

-- Sengaja TIDAK ADA kebijakan update/delete untuk siapa pun -- di bawah
-- RLS, ini berarti update/delete ditolak untuk semua orang termasuk
-- Owner, sama seperti app_backups. Log ini murni jejak audit, harus
-- append-only.
