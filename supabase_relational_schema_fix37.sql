-- Perbaikan skema #37: Gelombang 1 kontrol uang -- Utang Usaha, Opname
-- Kas, dan Anggaran Biaya bulanan.
--
-- 1. utang_usaha: belanja tempo ke toko/pemasok (kebalikan piutang) --
--    jumlah, jatuh tempo, tautan pembayaran ke Kas Perusahaan lewat kolom
--    baru kas_usaha_transaksi.sumber_utang_id. RLS Owner+Admin (Marketing
--    tidak ada akses), pola sama seperti stok_material/aset_sewa.
-- 2. kas_opname: rekonsiliasi saldo fisik vs sistem. HANYA Owner (saldo
--    kas dirahasiakan dari Admin sejak Fase D, opname otomatis membuka
--    saldo -- jadi RLS-nya auth.uid() = company_id).
-- 3. company_profile.anggaran_biaya: anggaran belanja bulanan per
--    kategori (jsonb, mis. {"Biaya Bahan": 5000000}).
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

create table if not exists utang_usaha (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  pemasok_id text,
  pemasok_nama text,
  keterangan text,
  tanggal date,
  jatuh_tempo date,
  jumlah numeric not null default 0,
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table utang_usaha enable row level security;
drop policy if exists "akses utang usaha" on utang_usaha;
create policy "akses utang usaha" on utang_usaha for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

create table if not exists kas_opname (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  tanggal date not null,
  sistem numeric not null default 0,
  fisik numeric not null default 0,
  selisih numeric not null default 0,
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table kas_opname enable row level security;
drop policy if exists "opname kas - owner saja" on kas_opname;
create policy "opname kas - owner saja" on kas_opname for all
  using (auth.uid() = company_id)
  with check (auth.uid() = company_id);

alter table kas_usaha_transaksi add column if not exists sumber_utang_id text;
alter table company_profile add column if not exists anggaran_biaya jsonb not null default '{}';

-- Daftarkan ke Realtime publication (pola blok DO dari fix29, idempoten).
do $$
declare
  t text;
begin
  foreach t in array array['utang_usaha', 'kas_opname'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
