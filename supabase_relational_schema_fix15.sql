-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE 0.5.1 — Tutup 2 celah tambahan ditemukan saat audit menyeluruh
-- setelah Log Aktivitas Tim (jalankan sekali di Supabase SQL Editor,
-- SETELAH supabase_relational_schema_fix14.sql)
--
-- Owner bertanya kenapa menu Pengaturan Admin/Marketing punya tombol
-- Export/Import Backup & Reset Semua Data. Jawabannya: tombol itu SUDAH
-- disembunyikan lewat CSS untuk non-Owner (applyRoleAccess di app.js),
-- tapi penyembunyian itu cuma tampilan -- handler kliknya sendiri tidak
-- pernah dicek perannya. Perbaikan itu (guard di kode) sudah ditambahkan
-- ke www/app.js di commit yang sama dengan file SQL ini. Audit lanjutan
-- terhadap SEMUA kebijakan RLS menemukan 2 celah lain dengan pola yang
-- sama -- "kelihatan aman di UI, tapi tidak benar-benar ditegakkan di
-- database" -- persis pola yang berulang kali ditutup di Fase D & 0.4:
--
-- 1) company_profile.approval_threshold bisa diubah Admin di level
--    database. Kolom ini adalah "Batas Nominal Perlu Persetujuan" (Pattern
--    2 -- Approval Bertingkat): pengeluaran Kas Perusahaan di atas angka
--    ini otomatis butuh persetujuan Owner. Panel pengaturannya sudah
--    disembunyikan untuk non-Owner di UI, TAPI kebijakan RLS
--    "ubah profil perusahaan" (fix12.sql) mengizinkan siapa pun dengan
--    peran admin menulis ke SELURUH baris company_profile, termasuk kolom
--    ini. Artinya Admin yang paham teknis bisa memanggil Supabase API
--    langsung dan mengubah approval_threshold jadi 0 -- MELUMPUHKAN fitur
--    approval yang justru dirancang sebagai pengawasan atas pengeluaran
--    Admin sendiri. Diperbaiki dengan trigger: kolom ini dipin ke nilai
--    yang sudah ada di database kalau pemanggilnya bukan Owner, apa pun
--    yang dikirim di request-nya -- Admin tetap bisa mengubah field lain
--    di profil perusahaan (nama, alamat, dst.) seperti biasa.
--
-- 2) Kebijakan "Anggota bisa klaim undangan pending miliknya sendiri"
--    (supabase_team_setup.sql) untuk table team_members punya WITH CHECK
--    yang cuma memverifikasi member_id = auth.uid() -- tidak memverifikasi
--    role atau owner_id tetap sama. Artinya orang yang diundang sebagai
--    Marketing (role='marketing') bisa, saat baris undangannya masih
--    'pending', memanggil update lewat API langsung dan MENYERTAKAN
--    role:'admin' dalam permintaan yang sama -- lolos RLS karena
--    "using"-nya cuma mengecek baris LAMA (status pending + email cocok),
--    bukan baris BARU. Ini jalur eskalasi hak akses: Marketing bisa naik
--    jadi Admin sendiri sebelum login pertama selesai. Diperbaiki dengan
--    trigger serupa: kalau pemanggil BUKAN Owner baris itu (auth.uid() !=
--    owner_id), kolom role/owner_id/member_email dipin ke nilai lama --
--    cuma member_id & status yang benar-benar boleh berubah lewat jalur
--    klaim-undangan ini, persis yang dilakukan kode aplikasi
--    (resolveTeamMembership() di www/app.js) selama ini. Owner tetap bisa
--    mengubah kolom apa pun di baris anggota timnya sendiri seperti biasa
--    (trigger cuma aktif kalau pemanggil BUKAN owner_id baris itu).
--
-- Aman dijalankan berkali-kali (idempotent) -- fungsi & trigger dibuat
-- ulang (create or replace / drop trigger if exists) sebelum dipasang.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

create or replace function protect_approval_threshold()
returns trigger as $$
begin
  if auth.uid() <> new.company_id then
    if tg_op = 'UPDATE' then
      new.approval_threshold := old.approval_threshold;
    else
      new.approval_threshold := 0;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_protect_approval_threshold on company_profile;
create trigger trg_protect_approval_threshold
  before insert or update on company_profile
  for each row execute function protect_approval_threshold();

create or replace function protect_team_invite_claim()
returns trigger as $$
begin
  if auth.uid() <> new.owner_id then
    new.role := old.role;
    new.owner_id := old.owner_id;
    new.member_email := old.member_email;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_protect_team_invite_claim on team_members;
create trigger trg_protect_team_invite_claim
  before update on team_members
  for each row execute function protect_team_invite_claim();
