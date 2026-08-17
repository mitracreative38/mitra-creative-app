-- Fase 1.1: Payment Gateway (Xendit) -- link pembayaran online untuk Termin
-- Pembayaran Proyek & DP Penawaran yang disetujui.
--
-- Tabel ini murni dibuat & dibaca oleh server (server/lib/payment.js) dan
-- pemanggil ber-sesi (Owner/Admin) lewat endpoint /api/payment/create --
-- TIDAK PERNAH ditulis langsung oleh klien seperti mirror modul lain.
-- Status ("pending" -> "paid"/"expired") HANYA diubah oleh server lewat
-- service role (webhook Xendit yang sudah diverifikasi tokennya, atau
-- pengecekan ulang berkala/reconciliation di server/lib/payment.js) --
-- makanya sengaja TIDAK ADA kebijakan update/delete untuk klien sama
-- sekali, pola yang sama seperti activity_log (fix14) & app_backups
-- (fix11): dengan RLS aktif, operasi tanpa kebijakan yang cocok otomatis
-- ditolak untuk semua orang termasuk Owner. Ini mencegah Admin/Marketing
-- (atau siapa pun yang memanggil API langsung) memalsukan status "sudah
-- dibayar" untuk membuat transaksi Kas palsu.
create table if not exists payment_transactions (
  id text primary key,
  company_id uuid not null references auth.users(id) on delete cascade,
  proyek_id text references proyek(id) on delete set null,
  penawaran_id text references penawaran(id) on delete set null,
  jenis text not null check (jenis in ('termin_proyek', 'dp_penawaran')),
  deskripsi text not null,
  jumlah numeric not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed')),
  xendit_invoice_id text,
  payment_url text,
  paid_at timestamptz,
  kas_transaksi_id text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_transactions_company_idx
  on payment_transactions (company_id, created_at desc);

alter table payment_transactions enable row level security;

create policy "lihat link pembayaran" on payment_transactions for select
  using (has_company_access(company_id, array['admin']));

create policy "buat link pembayaran" on payment_transactions for insert
  with check (
    has_company_access(company_id, array['admin'])
    and created_by = auth.uid()
  );

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
