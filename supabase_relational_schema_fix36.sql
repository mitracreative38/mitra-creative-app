-- Perbaikan skema #36: modul Sewa Aset.
-- Satu menu untuk semua aset yang disewakan perusahaan: baliho, kos-kosan,
-- tanah, rental kendaraan/alat, ruko/bangunan, dan lainnya. Kontrak sewa
-- (penyewa, periode, nilai) disimpan sebagai array jsonb di baris asetnya,
-- pola yang sama seperti kolom peminjaman di tabel alat / invoices di
-- tabel proyek. Pembayaran sewa dicatat sebagai transaksi Kas Perusahaan
-- (Masuk, kategori "Pendapatan Sewa Aset") dengan tautan sumber_sewa_id
-- supaya bisa dihitung pendapatan per aset dan ikut Laporan Keuangan/KPI
-- otomatis.
-- RLS: Owner & Admin akses penuh, Marketing tidak ada akses (pola yang
-- sama seperti stok_material/alat, lihat fix7 & fix24).
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

create table if not exists aset_sewa (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  jenis text,
  lokasi text,
  deskripsi text,
  harga_sewa numeric not null default 0,
  satuan_sewa text,
  aktif boolean not null default true,
  -- Kontrak sewa: [{id, penyewa, kontak, mulai, selesai, nilai, catatan}]
  kontrak jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table aset_sewa enable row level security;
drop policy if exists "akses aset sewa" on aset_sewa;
create policy "akses aset sewa" on aset_sewa for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

-- Tautan transaksi Kas Perusahaan ke kontrak sewa asalnya (pola yang sama
-- seperti sumber_slip_id / sumber_belanja_id).
alter table kas_usaha_transaksi add column if not exists sumber_sewa_id text;

-- Daftarkan ke Realtime publication supaya perubahan aset sewa muncul
-- otomatis di perangkat lain tanpa refresh (pola blok DO dari fix29 --
-- aman dijalankan berkali-kali dan kompatibel PostgreSQL lama).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aset_sewa'
  ) then
    execute 'alter publication supabase_realtime add table public.aset_sewa';
  end if;
end $$;
