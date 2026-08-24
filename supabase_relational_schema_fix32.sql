-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Fix 32: Lampiran foto/nota (bucket Storage "lampiran")
--
-- Tempat menyimpan bukti fisik yang menempel langsung ke datanya:
-- foto nota Belanja Material, file SPK/BAST di Dokumen Proyek, dan foto
-- Alat. File disimpan di jalur "<company_id>/<jenis>/<item_id>/<nama>",
-- dan kebijakan Storage memakai has_company_access() yang sama dengan
-- tabel-tabel relasional: Owner & Admin aktif boleh unggah/lihat/hapus,
-- Marketing tidak. Bucket privat -- akses selalu lewat signed URL.
--
-- Aman dijalankan berkali-kali (idempotent).
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('lampiran', 'lampiran', false)
on conflict (id) do nothing;

drop policy if exists "unggah lampiran - owner & admin" on storage.objects;
create policy "unggah lampiran - owner & admin" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lampiran'
    and has_company_access(((storage.foldername(name))[1])::uuid, array['admin'])
  );

drop policy if exists "lihat lampiran - owner & admin" on storage.objects;
create policy "lihat lampiran - owner & admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'lampiran'
    and has_company_access(((storage.foldername(name))[1])::uuid, array['admin'])
  );

drop policy if exists "hapus lampiran - owner & admin" on storage.objects;
create policy "hapus lampiran - owner & admin" on storage.objects for delete to authenticated
  using (
    bucket_id = 'lampiran'
    and has_company_access(((storage.foldername(name))[1])::uuid, array['admin'])
  );

-- Kolom jalur foto untuk Alat (Belanja Material & Dokumen Proyek menumpang
-- di jsonb proyek, tidak butuh kolom baru).
alter table alat add column if not exists lampiran_path text;

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
