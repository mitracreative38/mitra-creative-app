-- Perbaikan skema #35: metode pembayaran gaji karyawan.
-- Menambah kolom pembayaran (jsonb) di tabel karyawan_gaji (Owner-only,
-- RLS tabelnya sudah ada sejak fix pertama & dipersempit di fix30) untuk
-- menyimpan cara gaji dibayarkan per karyawan: Tunai, Transfer Bank, atau
-- E-Wallet (DANA/OVO/GoPay), beserta nama bank/e-wallet, nomor rekening/
-- nomor HP, dan atas nama. Contoh isi:
--   {"metode":"Transfer Bank","bank":"BCA","noRek":"1234567890","atasNama":"Budi"}
-- Nomor rekening adalah data pribadi karyawan -- sengaja ditaruh satu
-- rumah dengan nominal upah (karyawan_gaji) supaya hanya Owner yang bisa
-- membacanya, bukan di tabel karyawan yang terbaca Admin.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table karyawan_gaji add column if not exists pembayaran jsonb not null default '{}';
