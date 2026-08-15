-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Perbaikan tambahan (jalankan sekali di Supabase SQL Editor, SETELAH
-- supabase_relational_schema_fix8.sql)
--
-- Ditemukan saat memindah modul Kas Perusahaan & Kas Pribadi (Fase C,
-- modul terakhir dari pilot ini): kedua tabel kelupaan beberapa kolom yang
-- ternyata dipakai aplikasi -- sumber_slip_id/sumber_belanja_id/subkon_id
-- (dipakai untuk menautkan transaksi Kas yang tercatat OTOMATIS dari slip
-- gaji, belanja material, dan pembayaran subkontraktor, supaya bisa
-- dihapus/disinkron ulang saat sumbernya berubah), serta extra & catatan.
-- Kolom klien_id yang sudah ada dari Fase A dibiarkan ada tapi tidak
-- dipakai (transaksi Kas tidak pernah dikaitkan langsung ke Klien) --
-- aman daripada dihapus.
--
-- PENTING (bagian paling sensitif dari seluruh migrasi ini): tabel
-- kas_usaha_transaksi SUDAH punya RLS sejak Fase A yang membatasi Admin
-- hanya boleh melihat transaksi yang mereka input sendiri (created_by =
-- akun mereka) -- Owner tetap melihat semua. Kode aplikasi sekarang
-- mengisi created_by dari akun yang sedang login saat itu juga. Kas
-- Pribadi tetap sepenuhnya milik Owner (RLS tidak mengizinkan peran lain
-- sama sekali), jadi tidak perlu kolom created_by di tabel itu.
--
-- Aman dijalankan kapan saja -- cuma menambah kolom baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table kas_usaha_transaksi add column if not exists sumber_slip_id text;
alter table kas_usaha_transaksi add column if not exists sumber_belanja_id text;
alter table kas_usaha_transaksi add column if not exists subkon_id text;
alter table kas_usaha_transaksi add column if not exists extra text;
alter table kas_usaha_transaksi add column if not exists catatan text;

alter table kas_pribadi_transaksi add column if not exists extra text;
alter table kas_pribadi_transaksi add column if not exists catatan text;
