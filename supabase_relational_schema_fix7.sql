-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Perbaikan tambahan (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix6.sql)
--
-- Ditemukan saat memindah modul Stok Material & Alat (Fase C, lanjutan
-- setelah Klien, AHSP, RAB, Penawaran, Proyek & Karyawan):
--
-- 1) Tabel "stok_material" rancangan awal (Fase A) menebak bentuk datanya
--    (kolom jumlah & lokasi) sebelum melihat kode modul yang sesungguhnya.
--    Di aplikasi, tiap barang punya stokAwal + stokMinimum, dan riwayat
--    keluar/masuknya tersimpan sebagai daftar transaksi MENYATU di dalam
--    data barang itu sendiri (bukan tabel terpisah). Kolom lama (jumlah,
--    lokasi) dibiarkan ada tapi tidak dipakai -- aman daripada dihapus.
--
-- 2) Aplikasi ternyata juga punya data "Gudang / Lokasi Stok" (daftar
--    nama gudang, dipakai sebagai referensi di tiap transaksi stok) yang
--    sama sekali belum ada tabelnya di Fase A -- jadi dibuatkan tabel baru
--    "gudang" di sini, dengan aturan akses yang sama seperti stok_material
--    (Owner & Admin, Marketing tidak ada akses).
--
-- Aman dijalankan kapan saja -- cuma menambah kolom/tabel baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table stok_material add column if not exists kategori text;
alter table stok_material add column if not exists stok_awal numeric not null default 0;
alter table stok_material add column if not exists stok_minimum numeric not null default 0;
alter table stok_material add column if not exists transactions jsonb not null default '[]';

create table if not exists gudang (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table gudang enable row level security;
create policy "akses gudang" on gudang for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));
