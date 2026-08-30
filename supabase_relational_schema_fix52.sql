-- Fix 52: jenis proyek "maintenance" (pekerjaan berjalan/langganan tanpa
-- kontrak & tanpa penawaran -- mis. maintenance box, tambah lampu, servis
-- rutin klien langganan). Kolom teks baru saja di tabel proyek; kebijakan
-- RLS lama otomatis berlaku (RLS per baris, bukan per kolom). Nilai:
-- 'kontrak' (perilaku lama, default) atau 'maintenance'.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table proyek add column if not exists tipe text not null default 'kontrak';
