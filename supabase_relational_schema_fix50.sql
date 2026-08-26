-- Fix 50: Marketing bisa membuat & memperbarui Laporan Kerja (survey
-- lapangan/babat alas) -- lihat, tambah, dan ubah SAJA. Sengaja TIDAK ADA
-- kebijakan delete untuk Marketing (anti-fraud, pola yang sama dengan data
-- Klien di fix44): dengan RLS aktif, operasi tanpa kebijakan yang cocok
-- otomatis ditolak. Owner & Admin tetap penuh lewat kebijakan lama.
-- Juga: Marketing boleh melihat & mengunggah lampiran foto/video KHUSUS
-- folder laporan (path <company>/laporan/...), tidak menyentuh lampiran
-- lain (nota Kas dll) dan tetap tanpa hak hapus.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

drop policy if exists "laporan kerja marketing - lihat" on laporan_kerja;
create policy "laporan kerja marketing - lihat" on laporan_kerja for select
  using (has_company_access(company_id, array['admin', 'marketing']));

drop policy if exists "laporan kerja marketing - tambah" on laporan_kerja;
create policy "laporan kerja marketing - tambah" on laporan_kerja for insert
  with check (has_company_access(company_id, array['admin', 'marketing']));

drop policy if exists "laporan kerja marketing - ubah" on laporan_kerja;
create policy "laporan kerja marketing - ubah" on laporan_kerja for update
  using (has_company_access(company_id, array['admin', 'marketing']))
  with check (has_company_access(company_id, array['admin', 'marketing']));

drop policy if exists "lampiran laporan - marketing lihat" on storage.objects;
create policy "lampiran laporan - marketing lihat" on storage.objects for select to authenticated
  using (
    bucket_id = 'lampiran'
    and (storage.foldername(name))[2] = 'laporan'
    and has_company_access(((storage.foldername(name))[1])::uuid, array['admin', 'marketing'])
  );

drop policy if exists "lampiran laporan - marketing unggah" on storage.objects;
create policy "lampiran laporan - marketing unggah" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lampiran'
    and (storage.foldername(name))[2] = 'laporan'
    and has_company_access(((storage.foldername(name))[1])::uuid, array['admin', 'marketing'])
  );
