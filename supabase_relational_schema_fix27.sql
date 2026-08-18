-- Fase 1.8: Absen Masuk/Pulang via HP pekerja (konfirmasi sidik jari/Face
-- ID bawaan HP + foto selfie sebagai bukti). Foto selfie disimpan di
-- Supabase Storage, bukan langsung di kolom data (supaya baris Karyawan
-- tidak membengkak) -- path filenya: <company_id>/<karyawan_id>/<waktu>.jpg,
-- dan HANYA server (service role, lewat endpoint /api/pekerja/absen yang
-- memvalidasi device_token seperti /api/pekerja/ping) yang boleh
-- mengunggah -- konsisten dengan pola lokasi_pekerja di fix25.sql. Data
-- jam masuk/pulang & jenis verifikasi sendiri disimpan di dalam kolom
-- absensi (jsonb) yang sudah ada di tabel karyawan, jadi TIDAK perlu
-- kolom/tabel baru untuk itu -- cukup field baru di objek JS
-- (jamMasuk/jamPulang/selfieMasukPath/selfiePulangPath/viaBiometrik).
insert into storage.buckets (id, name, public)
values ('absensi-selfie', 'absensi-selfie', false)
on conflict (id) do nothing;

create policy "lihat foto absensi - owner & admin" on storage.objects for select
  using (
    bucket_id = 'absensi-selfie'
    and has_company_access(((storage.foldername(name))[1])::uuid, array['admin'])
  );
-- Sengaja TIDAK ADA kebijakan insert/update/delete untuk klien manapun --
-- cuma server (service role) yang boleh mengunggah/menghapus foto.

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
