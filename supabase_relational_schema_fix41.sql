-- Perbaikan skema #41: Manajemen keuangan Owner.
-- Dua kolom jsonb baru di company_profile:
-- 1. gaji_owner: pengaturan gaji tetap Owner otomatis tiap bulan
--    ({aktif, jumlah, tanggal}) -- aplikasi membuat transaksi Kas Keluar
--    "Gaji Owner" sekali sebulan pada tanggal yang dipilih, supaya uang
--    perusahaan & keluarga benar-benar terpisah.
-- 2. alokasi_laba: persentase pembagian laba bersih per pos
--    ({darurat, pengembangan, pajak, tim, keluarga}) -- dipakai panel
--    "Alokasi Laba" di subtab Tutup Buku untuk menghitung pembagian
--    otomatis setiap bulan.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table company_profile add column if not exists gaji_owner jsonb not null default '{}';
alter table company_profile add column if not exists alokasi_laba jsonb not null default '{}';
