-- Fase 1.5: Pelacakan Lokasi Pekerja (antisipasi HP pekerja hilang di
-- lapangan). Pekerja lapangan (data Karyawan) umumnya tidak punya akses
-- email aktif seperti Admin/Marketing, jadi HP mereka TIDAK login lewat
-- OTP email seperti anggota tim -- melainkan dipasangkan (paired) sekali
-- lewat kode 6-digit yang dibuat Owner/Admin dari halaman Karyawan.
--
-- Tiga tabel:
-- 1. pekerja_device -- status pairing per HP (kode, kadaluarsa, terpasang
--    ke Karyawan mana). Owner/Admin baca/tulis lewat RLS normal seperti
--    tabel lain.
-- 2. pekerja_device_secret -- menyimpan device_token (kredensial jangka
--    panjang HP yang sudah terpasang) TERPISAH dari (1) dan SENGAJA TIDAK
--    ADA satu pun kebijakan RLS untuk peran apa pun -- dengan RLS aktif
--    tanpa kebijakan, tabel ini hanya bisa disentuh lewat service role di
--    server (lihat server/index.js endpoint /api/pekerja/pair & /ping),
--    tidak pernah lewat sesi browser Owner/Admin sekalipun. Ini mencegah
--    token itu pernah terekspos ke sesi klien manapun.
-- 3. lokasi_pekerja -- log posisi (lat/lng) yang dikirim HP pekerja
--    secara berkala. Hanya bisa diisi lewat server (service role, via
--    endpoint /api/pekerja/ping yang memvalidasi device_token) -- SENGAJA
--    TIDAK ADA kebijakan insert/update/delete untuk klien manapun,
--    supaya tidak ada yang bisa mengirim/memalsukan titik lokasi selain
--    lewat jalur tervalidasi itu. Owner/Admin cuma boleh SELECT.
create table if not exists pekerja_device (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  karyawan_id text not null references karyawan(id) on delete cascade,
  pairing_code text not null,
  status text not null default 'pending' check (status in ('pending','paired','revoked')),
  expires_at timestamptz not null,
  paired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Kode pairing cuma perlu unik selagi masih "pending" (belum dipasang/
-- kadaluarsa) -- kode lama yang sudah terpasang/revoked boleh dipakai
-- ulang nomornya di kode baru berikutnya.
create unique index if not exists pekerja_device_pending_code_idx
  on pekerja_device (pairing_code) where status = 'pending';
create index if not exists pekerja_device_company_idx
  on pekerja_device (company_id, karyawan_id);
alter table pekerja_device enable row level security;
create policy "akses pairing pekerja" on pekerja_device for all
  using (has_company_access(company_id, array['admin']))
  with check (has_company_access(company_id, array['admin']));

create table if not exists pekerja_device_secret (
  device_id text primary key references pekerja_device(id) on delete cascade,
  device_token text not null unique,
  created_at timestamptz not null default now()
);
alter table pekerja_device_secret enable row level security;
-- Sengaja TIDAK ADA kebijakan select/insert/update/delete sama sekali.

create table if not exists lokasi_pekerja (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  karyawan_id text not null references karyawan(id) on delete cascade,
  device_id text references pekerja_device(id) on delete set null,
  lat numeric not null,
  lng numeric not null,
  accuracy numeric,
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists lokasi_pekerja_company_karyawan_idx
  on lokasi_pekerja (company_id, karyawan_id, captured_at desc);
alter table lokasi_pekerja enable row level security;
create policy "lihat lokasi pekerja - owner & admin" on lokasi_pekerja for select
  using (has_company_access(company_id, array['admin']));
-- Sengaja TIDAK ADA kebijakan insert/update/delete untuk klien manapun --
-- cuma server (service role, lewat endpoint /api/pekerja/ping yang sudah
-- memvalidasi device_token) yang boleh menambah baris ke tabel ini.

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
