-- Fix 56: MOU / Surat Perjanjian Kerjasama dari penawaran ACC.
--
-- Menambah 1 kolom pada tabel penawaran:
--   mou : data isian MOU (jsonb) — {nomor, tanggal, pihak1Nama,
--         pihak1Telepon, pihak1Alamat, pihak2Nama, pihak2Telepon,
--         deadline, dendaPersen, garansiBulan, rekening, fasilitas}.
--         Rincian item/harga/termin TIDAK disalin ke sini — selalu
--         diambil segar dari kolom penawaran yang sudah ada saat cetak.
--
-- Aplikasi baru mengirim kolom ini kalau sebuah penawaran benar-benar
-- punya data MOU, jadi aman: sebelum SQL ini dijalankan, penawaran tanpa
-- MOU tetap termirror normal; penawaran yang MOU-nya sudah dibuat akan
-- tertahan di antrean pending mirror dan terkirim otomatis setelah SQL
-- ini dijalankan.
--
-- Aman dijalankan berkali-kali (idempotent).
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table penawaran add column if not exists mou jsonb;
