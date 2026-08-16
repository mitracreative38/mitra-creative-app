-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Tambah kolom No. WhatsApp opsional ke team_members, supaya Owner bisa
-- langsung mengirim instruksi login (lewat WhatsApp klik-chat, atau salin
-- ke clipboard kalau nomor tidak diisi) begitu selesai mengundang anggota
-- tim -- menutup celah "sudah undang tapi anggota tidak dapat notifikasi
-- apa pun" yang sebelumnya cuma menampilkan pesan statis di layar Owner.
--
-- Aman dijalankan kapan saja -- cuma menambah 1 kolom nullable, tidak
-- mengubah kebijakan RLS yang sudah ada di team_members.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table team_members add column if not exists member_whatsapp text;
