-- Perbaikan skema #39: Gelombang 3 -- Daftar Aset Tetap + penyusutan.
-- Tabel aset_tetap mencatat aset perusahaan yang dipakai jangka panjang
-- (kendaraan, mesin cetak, komputer, bangunan, dll): harga beli, umur
-- ekonomis, dan nilai residu. Aplikasi menghitung penyusutan garis lurus
-- otomatis per bulan sehingga nilai buku setiap aset selalu terbaru dan
-- masuk ke Neraca (baris "Aset Tetap (nilai buku)"). Akses Owner + Admin,
-- pola RLS sama seperti aset_sewa/utang_usaha.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

create table if not exists aset_tetap (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  kategori text,
  tanggal_beli date,
  harga_beli numeric not null default 0,
  nilai_residu numeric not null default 0,
  umur_tahun numeric not null default 0,
  status text not null default 'aktif',
  tanggal_lepas date,
  nilai_lepas numeric not null default 0,
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table aset_tetap enable row level security;
drop policy if exists "akses aset tetap" on aset_tetap;
create policy "akses aset tetap" on aset_tetap for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

-- Daftarkan ke Realtime publication (pola blok DO dari fix29, idempoten).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aset_tetap'
  ) then
    execute 'alter publication supabase_realtime add table public.aset_tetap';
  end if;
end $$;
