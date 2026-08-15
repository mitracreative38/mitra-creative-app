-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE A — Fondasi skema data relasional (jalankan sekali di Supabase SQL Editor)
--
-- Ini bagian pertama dari "Cetak Biru Data Tim": memecah data yang sekarang
-- tersimpan sebagai satu blok JSON (tabel app_state) menjadi 14 tabel
-- sungguhan, masing-masing dengan aturan aksesnya sendiri (RLS) per peran
-- Owner / Admin / Marketing.
--
-- PENTING: file ini TIDAK menyentuh atau menghapus apa pun dari tabel
-- app_state / team_members yang sudah berjalan. Aplikasi akan terus memakai
-- app_state seperti biasa sampai kode aplikasinya dipindah modul demi modul
-- (Fase B & C, dikerjakan bertahap di sesi-sesi berikutnya). Menjalankan file
-- ini sekarang aman — cuma menambah tabel baru yang belum dipakai siapa pun.
--
-- Cara pakai:
-- 1. Buka project Supabase Anda di supabase.com
-- 2. Klik menu "SQL Editor" di sidebar kiri
-- 3. Klik "New query", tempel seluruh isi file ini, lalu klik "Run"
-- ============================================================================

-- Konvensi: "company_id" di setiap tabel di bawah adalah id akun Owner
-- (auth.users.id) — persis nilai yang sama dipakai sebagai app_state.user_id
-- dan team_members.owner_id, supaya konsisten dengan yang sudah ada.

-- Fungsi bantu: dipakai berulang di semua tabel di bawah untuk mengecek
-- apakah pemanggil adalah Owner perusahaan itu, atau anggota tim aktif
-- dengan salah satu peran yang diizinkan.
create or replace function has_company_access(cid uuid, allowed_roles text[])
returns boolean as $$
  select auth.uid() = cid
    or exists (
      select 1 from team_members
      where owner_id = cid and member_id = auth.uid()
        and status = 'active' and role = any(allowed_roles)
    );
$$ language sql security definer stable;

-- ----------------------------------------------------------------------------
-- KLIEN — Owner, Admin, Marketing: baca-tulis penuh
-- ----------------------------------------------------------------------------
create table if not exists klien (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  tahap text,
  tahap_sejak date,
  sumber text,
  kontak_list jsonb not null default '[]',
  follow_up_berikutnya date,
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table klien enable row level security;
create policy "akses klien" on klien for all
  using (has_company_access(company_id, array['admin','marketing']))
  with check (has_company_access(company_id, array['admin','marketing']));

-- ----------------------------------------------------------------------------
-- AHSP — Owner, Admin: baca-tulis. Marketing: baca saja (referensi harga)
-- ----------------------------------------------------------------------------
create table if not exists ahsp (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  kode text,
  uraian text not null,
  satuan text,
  komponen jsonb not null default '[]',
  referensi text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ahsp enable row level security;
create policy "baca ahsp" on ahsp for select
  using (has_company_access(company_id, array['admin','marketing']));
create policy "tulis ahsp" on ahsp for insert
  with check (has_company_access(company_id, array['admin']));
create policy "ubah ahsp" on ahsp for update
  using (has_company_access(company_id, array['admin']));
create policy "hapus ahsp" on ahsp for delete
  using (has_company_access(company_id, array['admin']));

-- ----------------------------------------------------------------------------
-- RAB — Owner, Admin, Marketing: baca-tulis penuh
-- ----------------------------------------------------------------------------
create table if not exists rab (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  nomor text,
  klien_id uuid references klien(id) on delete set null,
  nama_proyek text,
  items jsonb not null default '[]',
  total numeric not null default 0,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table rab enable row level security;
create policy "akses rab" on rab for all
  using (has_company_access(company_id, array['admin','marketing']))
  with check (has_company_access(company_id, array['admin','marketing']));

-- ----------------------------------------------------------------------------
-- PENAWARAN — Owner, Admin, Marketing: baca-tulis penuh
-- ----------------------------------------------------------------------------
create table if not exists penawaran (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  nomor text,
  rab_id uuid references rab(id) on delete set null,
  klien_id uuid references klien(id) on delete set null,
  items jsonb not null default '[]',
  total numeric not null default 0,
  status text,
  tanggal date,
  berlaku_sampai date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table penawaran enable row level security;
create policy "akses penawaran" on penawaran for all
  using (has_company_access(company_id, array['admin','marketing']))
  with check (has_company_access(company_id, array['admin','marketing']));

-- ----------------------------------------------------------------------------
-- PROYEK — Owner, Admin: baca-tulis. Marketing: tidak ada akses.
-- ----------------------------------------------------------------------------
create table if not exists proyek (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  klien_id uuid references klien(id) on delete set null,
  sumber_id uuid,
  sumber_tipe text,
  anggaran jsonb not null default '{}',
  progress numeric not null default 0,
  dokumen jsonb not null default '[]',
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table proyek enable row level security;
create policy "akses proyek" on proyek for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

-- ----------------------------------------------------------------------------
-- KARYAWAN — data dasar (nama/jabatan/status), aman dilihat Admin.
-- Nominal gaji TIDAK di sini — lihat tabel karyawan_gaji di bawah.
-- ----------------------------------------------------------------------------
create table if not exists karyawan (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  jabatan text,
  tipe_gaji text,
  status text,
  tanggal_masuk date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table karyawan enable row level security;
create policy "akses karyawan" on karyawan for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

-- ----------------------------------------------------------------------------
-- KARYAWAN_GAJI — nominal upah, potongan, pinjaman. Owner saja.
-- ----------------------------------------------------------------------------
create table if not exists karyawan_gaji (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  karyawan_id uuid not null references karyawan(id) on delete cascade,
  upah numeric not null default 0,
  potongan_pinjaman numeric not null default 0,
  sisa_pinjaman numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table karyawan_gaji enable row level security;
create policy "akses gaji" on karyawan_gaji for all
  using (has_company_access(company_id, array[]::text[]))
  with check (has_company_access(company_id, array[]::text[]));

-- ----------------------------------------------------------------------------
-- ABSENSI — Owner, Admin: baca-tulis. Marketing: tidak ada akses.
-- ----------------------------------------------------------------------------
create table if not exists absensi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  karyawan_id uuid not null references karyawan(id) on delete cascade,
  tanggal date not null,
  hadir boolean not null default true,
  jam_lembur numeric not null default 0,
  lokasi text,
  created_at timestamptz not null default now()
);
alter table absensi enable row level security;
create policy "akses absensi" on absensi for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

-- ----------------------------------------------------------------------------
-- KAS_USAHA_TRANSAKSI — perlakuan khusus sesuai keputusan Owner:
-- Admin boleh INPUT transaksi, tapi hanya boleh MELIHAT transaksi yang
-- mereka input sendiri (created_by = akun mereka) — bukan seluruh riwayat.
-- Ini supaya Admin tidak bisa menjumlahkan sendiri dan mengetahui saldo.
-- Marketing: tidak ada akses sama sekali.
-- ----------------------------------------------------------------------------
create table if not exists kas_usaha_transaksi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  tanggal date not null,
  keterangan text,
  kategori text,
  klien_id uuid references klien(id) on delete set null,
  proyek_id uuid references proyek(id) on delete set null,
  tipe text not null check (tipe in ('Masuk', 'Keluar')),
  status text,
  jumlah numeric not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table kas_usaha_transaksi enable row level security;

create policy "lihat kas usaha - owner semua, admin baris sendiri"
  on kas_usaha_transaksi for select
  using (
    auth.uid() = company_id
    or (
      created_by = auth.uid()
      and exists (
        select 1 from team_members
        where owner_id = company_id and member_id = auth.uid()
          and status = 'active' and role = 'admin'
      )
    )
  );

create policy "input kas usaha"
  on kas_usaha_transaksi for insert
  with check (
    has_company_access(company_id, array['admin'])
    and created_by = auth.uid()
  );

create policy "ubah kas usaha - owner semua, admin baris sendiri"
  on kas_usaha_transaksi for update
  using (
    auth.uid() = company_id
    or (
      created_by = auth.uid()
      and exists (
        select 1 from team_members
        where owner_id = company_id and member_id = auth.uid()
          and status = 'active' and role = 'admin'
      )
    )
  );

create policy "hapus kas usaha - owner semua, admin baris sendiri"
  on kas_usaha_transaksi for delete
  using (
    auth.uid() = company_id
    or (
      created_by = auth.uid()
      and exists (
        select 1 from team_members
        where owner_id = company_id and member_id = auth.uid()
          and status = 'active' and role = 'admin'
      )
    )
  );

-- ----------------------------------------------------------------------------
-- KAS_PRIBADI_TRANSAKSI — sepenuhnya milik Owner, tidak ada peran lain.
-- ----------------------------------------------------------------------------
create table if not exists kas_pribadi_transaksi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  tanggal date not null,
  keterangan text,
  kategori text,
  tipe text not null check (tipe in ('Masuk', 'Keluar')),
  jumlah numeric not null,
  created_at timestamptz not null default now()
);
alter table kas_pribadi_transaksi enable row level security;
create policy "akses kas pribadi" on kas_pribadi_transaksi for all
  using (has_company_access(company_id, array[]::text[]))
  with check (has_company_access(company_id, array[]::text[]));

-- ----------------------------------------------------------------------------
-- STOK_MATERIAL — Owner, Admin: baca-tulis. Marketing: tidak ada akses.
-- ----------------------------------------------------------------------------
create table if not exists stok_material (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  satuan text,
  jumlah numeric not null default 0,
  lokasi text,
  harga_satuan numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table stok_material enable row level security;
create policy "akses stok" on stok_material for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

-- ----------------------------------------------------------------------------
-- PEMASOK — Owner, Admin: baca-tulis. Marketing: tidak ada akses.
-- ----------------------------------------------------------------------------
create table if not exists pemasok (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  kontak text,
  riwayat_harga jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table pemasok enable row level security;
create policy "akses pemasok" on pemasok for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

-- ============================================================================
-- Selesai Fase A. 12 tabel modul + 1 fungsi bantu dibuat (di luar app_state
-- dan team_members yang sudah ada sebelumnya = genap 14 tabel total).
-- Aplikasi belum memakai tabel-tabel ini sampai Fase B (migrasi data) dan
-- Fase C (pemindahan kode modul) dikerjakan di sesi-sesi berikutnya.
-- ============================================================================
