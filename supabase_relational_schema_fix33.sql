-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Fix 33: Sistematisasi proyek — Checklist Tahapan, Invoice & Kwitansi,
--         Berita Acara Progres (BAP), dan Arsip Proyek
--
-- Kolom baru di tabel proyek untuk menyimpan:
--   - tahapan  : checklist tahapan administrasi proyek (survey s/d garansi)
--   - invoices : daftar invoice/kwitansi penagihan proyek
--   - bap      : arsip Berita Acara Progres untuk dasar pencairan termin
--   - arsip    : penanda proyek sudah ditutup & diarsipkan (terkunci)
-- Dan di company_profile:
--   - rekening        : rekening pembayaran yang dicetak di invoice
--   - invoice_counter : nomor urut invoice otomatis
--
-- Aman dijalankan berkali-kali (idempotent).
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

alter table proyek add column if not exists tahapan jsonb not null default '[]'::jsonb;
alter table proyek add column if not exists invoices jsonb not null default '[]'::jsonb;
alter table proyek add column if not exists bap jsonb not null default '[]'::jsonb;
alter table proyek add column if not exists arsip boolean not null default false;

alter table company_profile add column if not exists rekening text;
alter table company_profile add column if not exists invoice_counter integer not null default 0;

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
