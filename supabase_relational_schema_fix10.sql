-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE D — Tutup celah privasi Kas Perusahaan & Gaji sampai ke level
-- database (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix9.sql)
--
-- Ditemukan sebelum Fase D dikerjakan: kebijakan RLS tabel app_state (dari
-- supabase_team_setup.sql) mengizinkan SEMUA anggota tim aktif (Admin &
-- Marketing) membaca SELURUH blob JSON perusahaan -- termasuk seluruh
-- riwayat Kas Perusahaan dan seluruh slip gaji/pinjaman karyawan --
-- padahal sejak awal Owner memilih Admin hanya boleh lihat transaksi Kas
-- yang mereka input sendiri, dan data gaji sepenuhnya rahasia untuk siapa
-- pun selain Owner. Selama ini pembatasan itu cuma disembunyikan di sisi
-- tampilan (applyRoleAccess() di app.js), bukan benar-benar dibatasi di
-- datanya -- seorang Admin yang paham teknis bisa mengambil blob mentah
-- langsung lewat Supabase API, di luar aplikasi ini sama sekali.
--
-- PENDEKATAN: alih-alih mengunci ulang akses ke tabel app_state (yang
-- berarti mengubah cara SEMUA peran, termasuk Owner, membaca/menulis
-- data), perbaikan ini membuat blob app_state TIDAK PERNAH menyimpan
-- salinan hidup dari 2 potongan data sensitif (kasUsaha.transactions &
-- karyawan[].slipGaji, plus saldoAwal & Kas Pribadi) SAMA SEKALI, untuk
-- SIAPA PUN -- kode aplikasi (www/app.js) sekarang selalu mengosongkan
-- field-field itu sebelum menyimpan blob (stripSensitiveForBlob), dan
-- selalu membangunnya ulang segar dari tabel relasional setiap kali
-- memuat data (hydrateSensitiveFields) -- tabel relasional itu sendiri
-- (kas_usaha_transaksi, kas_pribadi_transaksi, karyawan_gaji) sudah punya
-- RLS yang benar sejak Fase A/C. Karena blob tidak pernah menyimpan data
-- hidup untuk field-field ini, TIDAK PERLU mengubah kebijakan akses
-- app_state sama sekali -- bahkan kalau seseorang mengambil blob mentah
-- langsung lewat API, field-field itu akan selalu kosong.
--
-- Satu-satunya penambahan skema di sini: saldoAwal (saldo awal) Kas
-- Perusahaan & Kas Pribadi selama ini cuma angka biasa di dalam blob,
-- tidak punya "rumah" di tabel relasional manapun -- jadi dibuatkan tabel
-- kecil baru khusus untuk itu, Owner-only (pola RLS yang sama seperti
-- karyawan_gaji).
--
-- Aman dijalankan kapan saja -- cuma menambah tabel baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

create table if not exists kas_saldo_awal (
  company_id uuid not null references auth.users(id) on delete cascade,
  buku text not null check (buku in ('kasUsaha', 'kasPribadi')),
  nilai numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, buku)
);
alter table kas_saldo_awal enable row level security;
create policy "akses saldo awal - owner saja" on kas_saldo_awal for all
  using (auth.uid() = company_id)
  with check (auth.uid() = company_id);
