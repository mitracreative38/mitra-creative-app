-- Fix 54: golongan AHSP per klien + kunci harga AHSP + biodata karyawan.
-- 1) ahsp.golongan_klien : nama golongan/klien pemilik daftar harga itu
--    (mis. "NSS", "Gadai Sakti", "NSC") supaya AHSP tiap klien tidak
--    tercampur; kosong = AHSP umum perusahaan.
-- 2) ahsp.harga_terkunci : penjaga harga -- item terkunci tidak bisa
--    diubah harganya (manual maupun sinkron massal) sampai dibuka Owner.
-- 3) karyawan.biodata    : data diri lengkap karyawan (NIK, alamat, HP,
--    kontak darurat, pendidikan, tanggal masuk) -- bukan data gaji, jadi
--    aman di tabel karyawan yang terbaca Admin.
-- Jalankan sekali di Supabase SQL Editor setelah deploy kode.

alter table ahsp
  add column if not exists golongan_klien text,
  add column if not exists harga_terkunci boolean not null default false;

alter table karyawan
  add column if not exists biodata jsonb;
