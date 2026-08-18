-- Fase 1.4: Modul Alat (peminjaman/kembali per proyek, terpisah dari Stok
-- Material karena sifatnya beda -- dipinjam-kembalikan, bukan dipakai
-- habis) + Stock Opname Harian (bandingkan jumlah fisik hasil hitung
-- langsung dengan jumlah tercatat di sistem, untuk Stok Material MAUPUN
-- Alat, supaya selisih -- hilang/rusak/salah catat -- ketahuan cepat).
--
-- Pola RLS & tipe kolom id sama seperti stok_material (Owner & Admin
-- boleh akses penuh, Marketing tidak ada akses sama sekali -- lihat
-- supabase_relational_schema_fix7.sql).
create table if not exists alat (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  kategori text,
  satuan text,
  kondisi text,
  jumlah_unit numeric not null default 0,
  catatan text,
  -- Riwayat peminjaman (siapa, proyek mana, kapan pinjam/rencana kembali/
  -- aktual kembali, kondisi saat kembali) disimpan sebagai array di sini,
  -- sama seperti pola "subkontraktor"/"belanja_material" pada tabel proyek.
  peminjaman jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table alat enable row level security;
create policy "akses alat" on alat for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

create table if not exists stok_opname (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  tanggal date not null,
  -- Satu baris per sesi opname (satu tanggal), berisi array semua barang
  -- (Material & Alat) yang dicek pada sesi itu: {itemType, itemId, nama,
  -- tercatat, fisik, selisih, catatan}.
  items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stok_opname_company_tanggal_idx
  on stok_opname (company_id, tanggal desc);
alter table stok_opname enable row level security;
create policy "akses stok opname" on stok_opname for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
