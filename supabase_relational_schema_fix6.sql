-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Perbaikan tambahan (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix5.sql)
--
-- Ditemukan saat memindah modul Karyawan (Fase C): rancangan awal (Fase A)
-- membayangkan absensi sebagai tabel terpisah dan gaji sebagai kolom
-- angka tunggal -- ternyata di aplikasi, absensi tersimpan MENYATU di
-- dalam data setiap karyawan (bukan tabel sendiri), dan slip gaji juga
-- berupa daftar riwayat per karyawan, bukan satu angka.
--
-- Jadi: tabel "karyawan" ditambah kolom untuk data dasar + absensi
-- (semuanya boleh dilihat Admin). Tabel "karyawan_gaji" ditambah kolom
-- slip_gaji (riwayat gajian lengkap, Owner saja) -- ini yang sesuai
-- dengan subtab "Penggajian & Slip Gaji" yang memang sudah disembunyikan
-- dari Admin sejak PR peran tim. Tabel "absensi" yang dibuat di Fase A
-- dibiarkan ada tapi tidak dipakai (aplikasi tidak punya tabel absensi
-- terpisah) -- tidak ada salahnya, aman daripada dihapus.
--
-- Aman dijalankan kapan saja -- cuma menambah kolom baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table karyawan add column if not exists tipe_gaji text;
alter table karyawan add column if not exists aktif boolean not null default true;
alter table karyawan add column if not exists upah_harian numeric not null default 0;
alter table karyawan add column if not exists tarif_lembur numeric not null default 0;
alter table karyawan add column if not exists uang_makan_harian numeric not null default 0;
alter table karyawan add column if not exists gaji_bulanan numeric not null default 0;
alter table karyawan add column if not exists target_bulanan numeric not null default 0;
alter table karyawan add column if not exists persen_bonus numeric not null default 0;
alter table karyawan add column if not exists pinjaman_awal numeric not null default 0;
alter table karyawan add column if not exists absensi jsonb not null default '[]';

alter table karyawan_gaji add column if not exists slip_gaji jsonb not null default '[]';
