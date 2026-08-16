-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE 0.4 (Tahap 1) — Tabel profil perusahaan, bagian dari memindahkan
-- jalur BACA aplikasi dari blob app_state ke tabel relasional (jalankan
-- sekali di Supabase SQL Editor, SETELAH supabase_relational_schema_fix11.sql)
--
-- Konteks: sejak Fase A/C, 9 modul (klien, ahsp, rab, penawaran, proyek,
-- karyawan, stok_material, gudang, pemasok) sudah punya tabel relasional
-- dengan RLS per-peran yang BENAR (mis. Marketing tidak boleh akses
-- proyek/karyawan/stok/gudang/pemasok sama sekali) -- tapi aplikasi
-- (www/app.js) selama ini masih membaca SEMUA modul itu dari satu blob
-- JSON di app_state, yang RLS-nya (dari supabase_team_setup.sql) justru
-- memberi SEMUA anggota tim aktif (Owner/Admin/Marketing) akses baca-tulis
-- penuh ke seluruh blob tanpa pembatasan. Artinya RLS yang sudah benar di
-- 9 tabel itu tidak pernah benar-benar ditegakkan -- pembatasan yang
-- terlihat di UI cuma menyembunyikan tampilan, sama seperti pola celah
-- yang ditemukan & ditutup di Fase D dulu (untuk Kas/Gaji), tapi kali ini
-- untuk modul-modul lain.
--
-- Fase 0.4 memindahkan jalur BACA aplikasi ke 9 tabel relasional itu
-- (plus tabel baru di bawah untuk profil perusahaan, satu-satunya bagian
-- data yang sampai sekarang cuma ada di blob dan belum punya tabel
-- sendiri). Jalur TULIS ke app_state TETAP dibiarkan jalan apa adanya
-- untuk sementara (cadangan bayangan / jalan mundur) -- lihat catatan di
-- www/app.js pada fungsi buildStateFromRelational().
--
-- Aman dijalankan kapan saja -- cuma menambah 1 tabel baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

create table if not exists company_profile (
  company_id uuid primary key references auth.users(id) on delete cascade,
  company text,
  alamat text,
  telepon text,
  owner_nama text,
  owner_jabatan text,
  approval_threshold numeric not null default 0,
  penawaran_counter integer not null default 0,
  rab_counter integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table company_profile enable row level security;

-- Sama seperti pola AHSP: Marketing perlu bisa BACA (nama/alamat/telepon
-- perusahaan dipakai di kop surat cetak & PDF Penawaran/RAB yang mereka
-- buat), tapi cuma Owner & Admin yang boleh MENGUBAH profil perusahaan.
create policy "baca profil perusahaan" on company_profile for select
  using (has_company_access(company_id, array['admin','marketing']));
create policy "tulis profil perusahaan" on company_profile for insert
  with check (has_company_access(company_id, array['admin']));
create policy "ubah profil perusahaan" on company_profile for update
  using (has_company_access(company_id, array['admin']));
create policy "hapus profil perusahaan" on company_profile for delete
  using (has_company_access(company_id, array['admin']));
