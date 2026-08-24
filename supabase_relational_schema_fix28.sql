-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Fix 28: Admin/Marketing gagal sinkron blob app_state (RLS INSERT Owner-only)
--
-- Ditemukan: kebijakan RLS app_state dari supabase_team_setup.sql sengaja
-- memperlebar SELECT & UPDATE untuk anggota tim aktif ("Owner & anggota tim
-- aktif bisa lihat/mengubah data perusahaan"), TAPI kebijakan INSERT (dari
-- supabase_setup.sql) sengaja dibiarkan Owner-only ("Kebijakan insert tetap
-- khusus Owner"). pushStateToCloud() di www/app.js memakai .upsert() --
-- di PostgreSQL, INSERT ... ON CONFLICT DO UPDATE SELALU dicek dulu lewat
-- kebijakan INSERT, walau baris yang dituju sudah ada dan yang sebenarnya
-- terjadi cuma UPDATE. Akibatnya SETIAP kali Admin/Marketing menyimpan
-- apa pun, panggilan sinkronisasi blob ini selalu ditolak RLS -- terlihat
-- sebagai "Gagal sinkron ke cloud" terus-menerus di aplikasi mereka.
--
-- Data sungguhan (Klien, Kas, Proyek, Karyawan, Alat, dst.) TIDAK terdampak
-- -- sejak Fase 0.4 jalur baca aplikasi sudah pindah ke tabel relasional
-- terpisah, bukan lagi blob ini, dan tiap modul punya jalur simpan sendiri
-- yang RLS-nya sudah benar untuk Admin. Blob app_state sekarang cuma
-- dipakai untuk memberi makan Backup Otomatis di server -- tapi kalau
-- Admin/Marketing yang aktif menyimpan, baris backup Owner tidak pernah
-- ikut ter-update, jadi tetap perlu diperbaiki.
--
-- Perbaikan: perlebar kebijakan INSERT supaya konsisten dengan SELECT/
-- UPDATE yang sudah ada -- anggota tim aktif juga boleh membuat baris
-- app_state pertama kali untuk perusahaan Owner-nya (jarang terjadi di
-- praktiknya, karena Owner biasanya sudah login duluan, tapi upsert()
-- tetap butuh izin ini untuk lolos pengecekan ON CONFLICT).
--
-- Aman dijalankan kapan saja -- cuma mengganti 1 kebijakan.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

drop policy if exists "Pengguna hanya bisa menambah datanya sendiri" on app_state;
create policy "Owner & anggota tim aktif bisa menambah data perusahaan"
  on app_state for insert
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from team_members
      where team_members.owner_id = app_state.user_id
        and team_members.member_id = auth.uid()
        and team_members.status = 'active'
    )
  );

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
