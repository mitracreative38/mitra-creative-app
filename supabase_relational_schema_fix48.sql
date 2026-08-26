-- Fix 48: dua fitur baru.
-- (a) Link Referensi Harga + tanggal update harga di stok_material --
--     dipakai fitur pengingat "cek ulang harga" per barang Stok (link
--     manual ke Tokopedia/Shopee/dll, BUKAN pengambilan harga otomatis).
-- (b) Jenis 'kas_umum' + kolom kategori di payment_transactions -- link
--     pembayaran online (transfer/VA/e-wallet via Xendit) sekarang bisa
--     dibuat untuk transaksi Kas Perusahaan umum, tidak cuma Termin
--     Proyek/DP Penawaran seperti sebelumnya.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table stok_material
  add column if not exists link_referensi_harga text,
  add column if not exists harga_updated_at timestamptz;

alter table payment_transactions drop constraint if exists payment_transactions_jenis_check;
alter table payment_transactions add constraint payment_transactions_jenis_check
  check (jenis in ('termin_proyek', 'dp_penawaran', 'kas_umum'));
alter table payment_transactions add column if not exists kategori text;
