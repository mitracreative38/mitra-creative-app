-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Aktifkan tim multi-akun: Owner + Admin + Marketing (jalankan sekali)
--
-- Ini tambahan setelah supabase_setup.sql dan supabase_realtime_setup.sql.
-- Dengan ini, Anda (Owner) bisa mengundang anggota tim (misal Admin atau
-- Marketing) lewat email. Mereka login dengan cara yang sama (kode OTP),
-- lalu otomatis bekerja di DATA PERUSAHAAN YANG SAMA dengan Anda — bukan
-- data terpisah masing-masing.
--
-- Cara pakai:
-- 1. Buka project Supabase Anda di supabase.com
-- 2. Klik menu "SQL Editor" di sidebar kiri
-- 3. Klik "New query", tempel seluruh isi file ini, lalu klik "Run"
-- ============================================================================

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid references auth.users(id) on delete cascade,
  member_email text not null,
  role text not null check (role in ('admin', 'marketing')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  unique (owner_id, member_email)
);

alter table team_members enable row level security;

-- Owner bisa lihat & kelola (undang/hapus) daftar anggota timnya sendiri.
create policy "Owner kelola anggota timnya sendiri"
  on team_members for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Anggota yang diundang bisa menemukan undangannya sendiri (dicocokkan lewat
-- email login mereka), dan melihat status keanggotaannya sendiri setelah aktif.
create policy "Anggota bisa lihat undangan/keanggotaannya sendiri"
  on team_members for select
  using (member_id = auth.uid() or lower(member_email) = lower(auth.jwt() ->> 'email'));

-- Anggota bisa "mengklaim" undangan pending miliknya sendiri saat pertama
-- kali login (mengisi member_id, mengubah status jadi aktif) -- tidak bisa
-- mengubah baris anggota lain atau baris yang sudah aktif.
create policy "Anggota bisa klaim undangan pending miliknya sendiri"
  on team_members for update
  using (status = 'pending' and lower(member_email) = lower(auth.jwt() ->> 'email'))
  with check (member_id = auth.uid());

-- Perbarui aturan akses app_state supaya anggota tim yang aktif juga bisa
-- baca & tulis data milik Owner-nya (data perusahaan bersama), bukan cuma
-- Owner itu sendiri.
drop policy if exists "Pengguna hanya bisa lihat datanya sendiri" on app_state;
create policy "Owner & anggota tim aktif bisa lihat data perusahaan"
  on app_state for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from team_members
      where team_members.owner_id = app_state.user_id
        and team_members.member_id = auth.uid()
        and team_members.status = 'active'
    )
  );

drop policy if exists "Pengguna hanya bisa mengubah datanya sendiri" on app_state;
create policy "Owner & anggota tim aktif bisa mengubah data perusahaan"
  on app_state for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from team_members
      where team_members.owner_id = app_state.user_id
        and team_members.member_id = auth.uid()
        and team_members.status = 'active'
    )
  );

-- Kebijakan insert tetap khusus Owner (baris app_state pertama kali dibuat
-- oleh Owner saat login pertama / push pertama).
