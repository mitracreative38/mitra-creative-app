-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Setup Supabase untuk sinkronisasi cloud (jalankan sekali di Supabase SQL Editor)
--
-- Cara pakai:
-- 1. Buka project Supabase Anda di supabase.com
-- 2. Klik menu "SQL Editor" di sidebar kiri
-- 3. Klik "New query", tempel seluruh isi file ini, lalu klik "Run"
-- ============================================================================

-- Tabel tunggal: satu baris per akun (user), menyimpan seluruh data aplikasi
-- sebagai satu JSON (persis struktur yang sekarang tersimpan di localStorage
-- browser). Ini pendekatan paling sederhana & paling minim risiko — tidak
-- perlu mendesain ulang puluhan tabel relasional untuk setiap modul.
create table if not exists app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Aktifkan Row Level Security — WAJIB, supaya walau kunci "anon public" ada
-- di kode aplikasi (yang memang publik/aman), tidak ada yang bisa baca atau
-- ubah data akun lain. Setiap akun hanya bisa akses barisnya sendiri.
alter table app_state enable row level security;

create policy "Pengguna hanya bisa lihat datanya sendiri"
  on app_state for select
  using (auth.uid() = user_id);

create policy "Pengguna hanya bisa menambah datanya sendiri"
  on app_state for insert
  with check (auth.uid() = user_id);

create policy "Pengguna hanya bisa mengubah datanya sendiri"
  on app_state for update
  using (auth.uid() = user_id);
