-- Perbaikan skema #46: Laporan Kerja Lapangan (bukti kerja berfoto).
--
-- Menggantikan alur lama "kirim foto + jumlah pcs lewat grup WA":
-- setiap pekerjaan lapangan (pemasangan pamflet/spanduk/reklame, survey,
-- servis, pengiriman) dicatat per titik lokasi -- jumlah, waktu, dan foto
-- berwatermark waktu+GPS -- lalu dicetak jadi Bukti Laporan Pelaksanaan
-- Pekerjaan resmi berkop untuk klien.
--
-- 1. Tabel laporan_kerja: satu baris per laporan; kolom titik (jsonb)
--    berisi daftar titik lokasi + foto (thumbnail base64 + path arsip
--    foto penuh di bucket Storage "lampiran" yang sudah ada sejak fix32).
--    RLS Owner+Admin (Marketing tidak ada akses), pola sama seperti
--    utang_usaha. Kiriman dari HP pekerja (Mode Pekerja, tanpa login)
--    masuk lewat server PDF dengan service role -- tidak butuh kebijakan
--    tambahan.
-- 2. Didaftarkan ke Realtime publication supaya kiriman pekerja langsung
--    muncul di layar Owner/Admin tanpa muat ulang.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

create table if not exists laporan_kerja (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  tanggal date,
  jenis text,
  judul text,
  klien_id text,
  proyek_id text,
  karyawan_id text,
  petugas text,
  catatan text,
  titik jsonb not null default '[]',
  dibuat_oleh text,
  dibuat_tanggal date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table laporan_kerja enable row level security;
drop policy if exists "akses laporan kerja" on laporan_kerja;
create policy "akses laporan kerja" on laporan_kerja for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

-- Daftarkan ke Realtime publication (pola blok DO dari fix29, idempoten).
do $$
declare
  t text;
begin
  foreach t in array array['laporan_kerja'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
