-- Fix 44: Modul Marketing "Babat Alas" + pengetatan akses role Marketing.
-- 1. Kolom baru di tabel klien: wilayah, segmen, potensi_nilai (database
--    prospek babat alas) + dibuat_oleh & dibuat_tanggal (jejak siapa
--    menginput prospek -- dasar penilaian kerja marketing).
-- 2. Kebijakan RLS klien dipecah: Marketing tetap bisa baca/tambah/ubah,
--    tapi MENGHAPUS data klien hanya boleh Owner/Admin -- data klien
--    milik perusahaan, tidak bisa dihapus/dibawa lari marketing.
-- 3. Kolom target_omzet_tahunan di company_profile untuk kalkulator
--    target 10 miliar di halaman KPI.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table klien add column if not exists wilayah text;
alter table klien add column if not exists segmen text;
alter table klien add column if not exists potensi_nilai numeric not null default 0;
alter table klien add column if not exists dibuat_oleh text;
alter table klien add column if not exists dibuat_tanggal date;

drop policy if exists "akses klien" on klien;
drop policy if exists "baca klien" on klien;
create policy "baca klien" on klien for select
  using (has_company_access(company_id, array['admin','marketing']));
drop policy if exists "tambah klien" on klien;
create policy "tambah klien" on klien for insert
  with check (has_company_access(company_id, array['admin','marketing']));
drop policy if exists "ubah klien" on klien;
create policy "ubah klien" on klien for update
  using (has_company_access(company_id, array['admin','marketing']))
  with check (has_company_access(company_id, array['admin','marketing']));
drop policy if exists "hapus klien - owner dan admin" on klien;
create policy "hapus klien - owner dan admin" on klien for delete
  using (has_company_access(company_id, array['admin']));

alter table company_profile add column if not exists target_omzet_tahunan numeric not null default 0;
