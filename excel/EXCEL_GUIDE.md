# Versi Excel — CV Mitra Creative Keuangan

`MitraCreative_Keuangan.xlsx` adalah versi Excel dari aplikasi web, dengan tampilan dan
kalkulasi yang sama: Dashboard, Kas Perusahaan, Kas Pribadi, Margin Proyek, Karyawan & Gaji
(Daftar, Absensi Harian, Penggajian & Slip Gaji), Stok Material & Alat, AHSP, RAB, Penawaran
Harga, dan Pengaturan — masing-masing jadi satu sheet (atau lebih, untuk modul yang punya
tabel detail seperti AHSP/RAB/Penawaran/Stok).

Data awal di dalamnya sama dengan seed data website (transaksi SPK/BAST Gadai Sakti dkk,
2 proyek contoh, 19 item AHSP). Karyawan, Absensi, Stok, RAB, dan Penawaran mulai kosong,
sama seperti kondisi awal website.

## Cara pakai (tanpa macro)

Buka langsung di Excel (Windows/Mac), Excel Online, LibreOffice Calc, atau Google Sheets
(import). **Semua kalkulasi jalan otomatis lewat rumus** — saldo kas, margin proyek, gaji,
stok, harga AHSP/RAB/Penawaran semuanya rumus, bukan angka tetap.

- **Menambah data**: ketik langsung di baris kosong berikutnya di bawah tabel yang sudah ada
  (semua tabel adalah Excel Table/`ListObject` — Excel otomatis memperluas format & rumus di
  kolom sebelahnya begitu Anda mulai mengetik di baris baru).
- **Kolom biru** = data yang boleh/harus Anda isi manual. **Kolom hitam** = hasil rumus,
  jangan diedit manual (nanti tertimpa saat Anda mengetik di sana, tapi tidak merusak sheet
  lain).
- **Dashboard**: kartu ringkasan, grafik, dan "Transaksi Terbaru" semuanya menarik otomatis
  dari sheet Kas Perusahaan/Kas Pribadi/Margin Proyek.
- **Cetak Slip Gaji**: isi No Slip di sel C2 sheet "Cetak Slip Gaji" (pilih dari dropdown),
  tampilan surat otomatis terisi.
- **Cetak Penawaran**: sama, isi No Surat di sel C2 sheet "Cetak Penawaran".
- Setiap tabel diberi ruang kosong secukupnya untuk bertambah (mis. Kas Perusahaan sampai
  120 baris, Penawaran - Item sampai 150 baris, dst). Kalau sampai penuh, minta perluasan
  rentang tabel & rumus — beri tahu saja sheet mana yang penuh.

## Macro VBA (tombol "Tambah X", "Cetak", dst.)

LibreOffice (yang dipakai untuk membangun file ini) tidak bisa menyisipkan project VBA yang
bisa langsung dibaca Excel — jadi macro-nya disediakan terpisah di **`MitraCreative_Macros.bas`**,
tinggal di-import sekali ke Excel:

1. Buka `MitraCreative_Keuangan.xlsx` di **Microsoft Excel** (Windows/Mac, bukan Excel Online).
2. Tekan **Alt+F11** untuk membuka VBA Editor (Mac: **Fn+Option+F11**, atau aktifkan tab
   Developer dulu lewat Excel > Preferences > Ribbon & Toolbar).
3. Klik kanan **VBAProject (MitraCreative_Keuangan.xlsx)** di panel kiri > **Import File...**
   > pilih `MitraCreative_Macros.bas` > Open.
4. Tutup VBA Editor. Simpan file lewat **File > Save As** > pilih tipe **Excel Macro-Enabled
   Workbook (.xlsm)**.
5. Selesai — semua macro siap dipakai dari **Alt+F8** (View Macros), pilih nama macro, klik Run.

Daftar lengkap nama macro & fungsinya ada di sheet **Pengaturan** (tabel "Daftar Macro").

### (Opsional) Bikin tombol seperti di website

Setelah macro ter-import (langkah di atas), tambahkan tombol asli di sheet mana pun:
**Developer > Insert > Button (Form Control)** → gambar kotaknya di sheet → saat muncul
dialog "Assign Macro", pilih nama macro yang sesuai (mis. `TambahTransUsaha` di sheet Kas
Perusahaan) → OK. Tombol itu tersimpan permanen begitu file di-save sebagai `.xlsm`.

## Fitur yang tidak ada di versi Excel

Import BOQ (.xlsx) dan OCR dari gambar (fitur di RAB/Penawaran di website) tidak ada
padanannya di Excel — isi item pekerjaan manual di sheet "RAB - Item" / "Penawaran - Item",
atau pakai kolom "Kode AHSP (opsional)" untuk ambil harga referensi otomatis dari sheet AHSP.
