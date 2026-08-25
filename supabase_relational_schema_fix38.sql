-- Perbaikan skema #38: Tutup Buku Bulanan.
-- Kolom periode_terkunci di company_profile menyimpan bulan terakhir yang
-- sudah ditutup bukunya (format "YYYY-MM"). Semua transaksi Kas Perusahaan
-- bertanggal di dalam/atau sebelum bulan itu tidak bisa ditambah/diubah/
-- dihapus lagi dari aplikasi -- laporan bulan yang sudah ditutup jadi
-- stabil (tidak berubah diam-diam), rapi untuk arsip & pajak. Owner bisa
-- membuka kunci kembali kapan saja dari halaman Laporan Keuangan.
-- Cara pakai: SQL Editor > New query > tempel semua > Run.

alter table company_profile add column if not exists periode_terkunci text not null default '';
