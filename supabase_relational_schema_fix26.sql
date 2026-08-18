-- Fase 1.6: Peringatan lokasi-vs-jam-kerja untuk Lokasi Pekerja.
-- Owner bisa mencatat koordinat site tiap Proyek yang sedang berjalan
-- (tombol "Catat Lokasi Site" di detail Proyek, sama seperti "Catat
-- Lokasi" di Absensi -- pakai GPS browser/HP saat berada di lokasi
-- proyek), lalu aplikasi membandingkan posisi terakhir tiap pekerja
-- (dari lokasi_pekerja, lihat fix25.sql) selama jam kerja terhadap
-- SEMUA proyek aktif yang sudah punya koordinat. Kalau posisi pekerja
-- jauh dari semua proyek aktif, ditandai "Perlu Ditinjau" di halaman
-- Lokasi Pekerja -- murni dari data lokasi & jam kerja, TIDAK pernah
-- membaca isi pesan/komunikasi apa pun.
alter table proyek add column if not exists lokasi_lat numeric;
alter table proyek add column if not exists lokasi_lng numeric;

alter table company_profile add column if not exists jam_kerja_mulai text not null default '08:00';
alter table company_profile add column if not exists jam_kerja_selesai text not null default '17:00';
alter table company_profile add column if not exists radius_proyek_meter numeric not null default 500;

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
