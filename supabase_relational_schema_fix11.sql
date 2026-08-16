-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- FASE 0.2 — Backup otomatis terjadwal (jalankan sekali di Supabase SQL
-- Editor, SETELAH supabase_relational_schema_fix10.sql)
--
-- Sebelum ini, backup cuma bisa manual lewat tombol "Export Backup (JSON)"
-- di Pengaturan -- aman kalau selalu diingat, tapi berisiko kalau lupa.
-- Untuk operasional yang makin besar (banyak cabang/proyek), keamanan data
-- tidak boleh bergantung pada seseorang ingat untuk backup sendiri.
--
-- Tabel baru ini menyimpan cuplikan (snapshot) blob app_state secara
-- berkala, ditulis OTOMATIS oleh server (server/lib/backup.js di Railway,
-- pakai service role, lewat RLS) -- BUKAN oleh klien manapun. Karena itu
-- tabel ini sengaja TIDAK punya kebijakan insert/update/delete untuk role
-- authenticated sama sekali -- Owner cuma bisa membaca (lihat & unduh)
-- riwayat backupnya sendiri, tidak bisa menulis/menghapus dari browser,
-- supaya riwayat backup tidak bisa dipalsukan atau dihapus paksa.
--
-- Aman dijalankan kapan saja -- cuma menambah tabel baru.
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

create table if not exists app_backups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists app_backups_company_created_idx
  on app_backups (company_id, created_at desc);

alter table app_backups enable row level security;

-- Owner boleh lihat riwayat backup perusahaannya sendiri. Sengaja tidak ada
-- kebijakan untuk Admin/Marketing (sama seperti karyawan_gaji & kas_saldo_awal)
-- -- ini murni alat pemulihan darurat milik Owner, bukan data operasional.
create policy "akses backup - owner saja" on app_backups for select
  using (auth.uid() = company_id);
