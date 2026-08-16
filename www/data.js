// Data awal (seed) — diambil dari D:\Keuangan_Usaha.xlsx milik pengguna,
// supaya catatan yang sudah ada tidak hilang saat pindah ke website ini.
// status "lunas" = kas sudah diterima/dibayar (dihitung ke saldo).
// status "pending" = piutang / belum cair (SPK/BAST yang pembayarannya belum masuk),
// sesuai kondisi asli di spreadsheet (baris dengan kolom Tipe kosong).

const SEED_DATA = {
  company: "CV Mitra Creative",
  kasUsaha: {
    saldoAwal: 0,
    transactions: [
      { tanggal: "2026-05-29", tipe: "Masuk", status: "lunas", keterangan: "SPK Tiang T Gadai Sakti Bancar Kembar", jumlah: 4500000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-05-29", tipe: "Masuk", status: "lunas", keterangan: "SPK Tiang T Gadai Sakti Karang Lewas", jumlah: 4500000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-02", tipe: "Masuk", status: "lunas", keterangan: "SPK Tmpk Dpn dan Tiang T Gadai Sakti Jembatan 5", jumlah: 8370000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-04", tipe: "Masuk", status: "lunas", keterangan: "SPK CCTV Gadai Sakti Bantul", jumlah: 4000000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-09", tipe: "Masuk", status: "lunas", keterangan: "SPK Tiang T Gadai Sakti Ngaglik", jumlah: 2232000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-09", tipe: "Masuk", status: "lunas", keterangan: "SPK Tiang T NSC Ngaglik", jumlah: 3019000, kategori: "Pendapatan Jasa", extra: "NSC Finance", catatan: "DP 50%" },
      { tanggal: "2026-06-09", tipe: "Masuk", status: "lunas", keterangan: "SPK Tiang T NS Ngaglik", jumlah: 3019000, kategori: "Pendapatan Jasa", extra: "Nusantara Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-10", tipe: "Masuk", status: "lunas", keterangan: "BAST Tiang T Gadai Sakti Bancar Kembar", jumlah: 4500000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "" },
      { tanggal: "2026-06-11", tipe: "Masuk", status: "lunas", keterangan: "BAST Tiang T Gadai Sakti Karang Lewas", jumlah: 4500000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "" },
      { tanggal: "2026-06-13", tipe: "Masuk", status: "lunas", keterangan: "SPK Tmpk Dpn dan Tiang T Gadai Sakti Sumberharjo", jumlah: 7769000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-13", tipe: "Masuk", status: "lunas", keterangan: "SPK CCTV Gadai Sakti Sumberharjo", jumlah: 5250000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-17", tipe: "Masuk", status: "lunas", keterangan: "SPK Tmpk Dpn dan Tiang T Gadai Sakti Tlogosari", jumlah: 5388000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-22", tipe: "Masuk", status: "lunas", keterangan: "BAST Tmpk Dpn dan Tiang T Gadai Sakti Jembatan 5", jumlah: 8370000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "" },
      { tanggal: "2026-06-27", tipe: "Masuk", status: "lunas", keterangan: "SPK Tampak Depan Gadai Sakti Karangmulya", jumlah: 5000000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-27", tipe: "Masuk", status: "lunas", keterangan: "SPK Tiang T Gadai Sakti Karangmulya", jumlah: 7500000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-06-27", tipe: "Masuk", status: "lunas", keterangan: "SPK Gudang Gadai Sakti Karangmulya", jumlah: 16500000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-07-01", tipe: "Masuk", status: "lunas", keterangan: "BAST Tmpk Dpn dan Tiang T Gadai Sakti Tlogosari", jumlah: 5388000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "" },
      { tanggal: "2026-07-02", tipe: "Masuk", status: "lunas", keterangan: "SPK Tmpk Dpn dan Tiang T NSC Cipayung", jumlah: 9685000, kategori: "Pendapatan Jasa", extra: "NSC Finance", catatan: "DP 50%" },
      { tanggal: "2026-07-02", tipe: "Masuk", status: "lunas", keterangan: "SPK Tmpk Dpn dan Tiang T Gadai Sakti Cipayung", jumlah: 4370000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-07-03", tipe: "Masuk", status: "pending", keterangan: "BAST Tmpk Dpn dan Tiang T Gadai Sakti Sumberharjo", jumlah: 7769000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "" },
      { tanggal: "2026-07-06", tipe: "Masuk", status: "pending", keterangan: "BAST Tiang T Gadai Sakti Ngaglik", jumlah: 2232000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "" },
      { tanggal: "2026-07-06", tipe: "Masuk", status: "pending", keterangan: "BAST Tiang T NSC Ngaglik", jumlah: 3019000, kategori: "Pendapatan Jasa", extra: "NSC Finance", catatan: "" },
      { tanggal: "2026-07-06", tipe: "Masuk", status: "pending", keterangan: "BAST Tiang T NS Ngaglik", jumlah: 3019000, kategori: "Pendapatan Jasa", extra: "Nusantara Sakti", catatan: "" },
      { tanggal: "2026-07-15", tipe: "Masuk", status: "lunas", keterangan: "SPK Tmpk Dpan dan Tiang T Gadai Sakti Bantul", jumlah: 6080000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-07-15", tipe: "Masuk", status: "lunas", keterangan: "SPK Tmpk Dpan dan Tiang T NSC Bantul", jumlah: 9450000, kategori: "Pendapatan Jasa", extra: "NSC Finance", catatan: "DP 50%" },
      { tanggal: "2026-07-18", tipe: "Masuk", status: "lunas", keterangan: "SPK Tmpk Dpan dan Tiang T Gadai Sakti Sumur Pecung", jumlah: 6165000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-07-18", tipe: "Masuk", status: "pending", keterangan: "SPK Tmpk Dpan dan Tiang T NSC Sumur Pecung", jumlah: 7869000, kategori: "Pendapatan Jasa", extra: "NSC Finance", catatan: "DP 50%" },
      { tanggal: "2026-07-27", tipe: "Masuk", status: "pending", keterangan: "BAST Tampak Depan Gadai Sakti Karangmulya", jumlah: 7518000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "" },
      { tanggal: "2026-07-28", tipe: "Masuk", status: "pending", keterangan: "BAST Tiang T Gadai Sakti Karangmulya", jumlah: 5000000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "" },
      { tanggal: "2026-07-29", tipe: "Masuk", status: "pending", keterangan: "BAST Tmpk Dpn dan Tiang T Gadai Sakti Cipayung", jumlah: 4370000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "" },
      { tanggal: "2026-07-30", tipe: "Masuk", status: "pending", keterangan: "BAST Tmpk Dpn dan Tiang T NSC Cipayung", jumlah: 9685000, kategori: "Pendapatan Jasa", extra: "NSC Finance", catatan: "" },
      { tanggal: "2026-08-06", tipe: "Masuk", status: "pending", keterangan: "SPK Tampak Depan Gadai Sakti Kalideres", jumlah: 2626000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-08-06", tipe: "Masuk", status: "pending", keterangan: "SPK Tampak Depan NSC Kalideres", jumlah: 4790000, kategori: "Pendapatan Jasa", extra: "NSC Finance", catatan: "DP 50%" },
      { tanggal: "2026-08-06", tipe: "Masuk", status: "pending", keterangan: "SPK Gudang Gadai Sakti Sukadami", jumlah: 9423000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-08-07", tipe: "Masuk", status: "pending", keterangan: "SPK Tmpk Dpan dan Tiang T Gadai Sakti Kutoarjo", jumlah: 5940000, kategori: "Pendapatan Jasa", extra: "Gadai Sakti", catatan: "DP 50%" },
      { tanggal: "2026-08-07", tipe: "Masuk", status: "pending", keterangan: "SPK Tmpk Dpan dan Tiang T NSC Kutoarjo", jumlah: 4766000, kategori: "Pendapatan Jasa", extra: "NSC Finance", catatan: "DP 50%" }
    ]
  },
  kasPribadi: {
    saldoAwal: 0,
    transactions: [
      { tanggal: "2026-01-10", tipe: "Masuk", keterangan: "Ambil gaji/prive bulan Januari", jumlah: 6000000, kategori: "Prive/Gaji Owner", extra: "Kas Usaha", catatan: "Sesuai kesepakatan gaji owner" },
      { tanggal: "2026-01-12", tipe: "Keluar", keterangan: "Kebutuhan rumah tangga", jumlah: 2500000, kategori: "Kebutuhan Harian", extra: "-", catatan: "-" }
    ]
  },
  proyek: [
    { nama: "Klien A - Signage Toko (Repeat Order Jan)", nilaiKontrak: 45000000, biayaBahan: 14000000, biayaUpah: 9000000, biayaLain: 2500000 },
    { nama: "Klien B - Branding Interior Kantor", nilaiKontrak: 60000000, biayaBahan: 22000000, biayaUpah: 13000000, biayaLain: 4000000 }
  ]
};

const KATEGORI_USAHA = ["Pendapatan Jasa", "Pendapatan Lain-lain", "Biaya Bahan", "Biaya Upah/Tenaga", "Biaya Subkontraktor", "Biaya Operasional", "Biaya Transport", "Biaya Alat", "Biaya Lain-lain"];
const KLIEN_TAHAP = ["Leads", "Penawaran Terkirim", "Nego", "Deal/SPK", "Selesai", "Hilang"];
const KLIEN_SUMBER = ["Referral", "Online/Sosmed", "Pameran", "Follow-up Lama", "Lainnya"];
const KLIEN_KONTAK_TIPE = ["Pusat", "Area"];
const KATEGORI_PRIBADI = ["Prive/Gaji Owner", "Kebutuhan Harian", "Tagihan/Utilitas", "Cicilan/Utang", "Kesehatan", "Pendidikan", "Hiburan", "Lainnya"];
const SUMBER_DANA_PRIBADI = ["Kas Usaha", "Tabungan Pribadi", "Lainnya"];

// ===== RAB / AHSP / Penawaran Harga =====
const KATEGORI_PEKERJAAN = ["Sipil/Konstruksi", "Advertising", "Renovasi Interior", "Renovasi Eksterior", "Event Organizer", "Konstruksi Baja", "CCTV", "AC", "Gudang Gadai Sakti", "Instalasi Listrik"];
const SATUAN_LIST = ["m2", "m3", "m1", "kg", "titik", "unit", "paket", "org/hari", "hari", "ls", "bh"];
const JENIS_KOMPONEN = ["Bahan", "Upah", "Alat"];

const OWNER_INFO = { nama: "Aditya Khresna", jabatan: "Owner / Direktur" };
const COMPANY_ADDRESS = "Jl. Taman Asri No. 15, Pedurungan Tengah, Semarang";
const COMPANY_PHONE = "0895811220203";

const SEED_AHSP = [
  { kategori: "Sipil/Konstruksi", kode: "SIP-01", uraian: "Pasangan Bata Merah 1:4", satuan: "m2", mode: "detail", overhead: 10, komponen: [
    { jenis: "Bahan", uraian: "Bata Merah", satuan: "bh", koefisien: 70, harga: 700 },
    { jenis: "Bahan", uraian: "Semen PC", satuan: "kg", koefisien: 9.68, harga: 1700 },
    { jenis: "Bahan", uraian: "Pasir Pasang", satuan: "m3", koefisien: 0.045, harga: 250000 },
    { jenis: "Upah", uraian: "Tukang Batu", satuan: "OH", koefisien: 0.3, harga: 120000 },
    { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.6, harga: 100000 }
  ] },
  { kategori: "Sipil/Konstruksi", kode: "SIP-02", uraian: "Plesteran 1:4 Tebal 15mm", satuan: "m2", mode: "detail", overhead: 10, komponen: [
    { jenis: "Bahan", uraian: "Semen PC", satuan: "kg", koefisien: 5.18, harga: 1700 },
    { jenis: "Bahan", uraian: "Pasir Pasang", satuan: "m3", koefisien: 0.023, harga: 250000 },
    { jenis: "Upah", uraian: "Tukang Batu", satuan: "OH", koefisien: 0.2, harga: 120000 },
    { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.25, harga: 100000 }
  ] },
  { kategori: "Sipil/Konstruksi", kode: "SIP-03", uraian: "Pengecatan Dinding (2x lapis)", satuan: "m2", mode: "manual", hargaManual: 35000 },
  { kategori: "Advertising", kode: "ADV-01", uraian: "Pembuatan & Pemasangan Neon Box Acrylic", satuan: "m2", mode: "manual", hargaManual: 850000 },
  { kategori: "Advertising", kode: "ADV-02", uraian: "Cetak Baliho Flexy Frontlite + Rangka Kayu", satuan: "m2", mode: "manual", hargaManual: 65000 },
  { kategori: "Advertising", kode: "ADV-03", uraian: "Pemasangan Huruf Timbul Galvanis + Cat Duco", satuan: "m2", mode: "manual", hargaManual: 950000 },
  { kategori: "Renovasi Interior", kode: "INT-01", uraian: "Pemasangan Plafon Gypsum + Rangka Hollow", satuan: "m2", mode: "detail", overhead: 10, komponen: [
    { jenis: "Bahan", uraian: "Gypsum Board 9mm", satuan: "lembar", koefisien: 0.35, harga: 75000 },
    { jenis: "Bahan", uraian: "Hollow 4x4", satuan: "m1", koefisien: 1.2, harga: 18000 },
    { jenis: "Upah", uraian: "Tukang", satuan: "OH", koefisien: 0.25, harga: 120000 },
    { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.25, harga: 100000 }
  ] },
  { kategori: "Renovasi Interior", kode: "INT-02", uraian: "Pemasangan Keramik Lantai 60x60", satuan: "m2", mode: "manual", hargaManual: 140000 },
  { kategori: "Renovasi Eksterior", kode: "EKS-01", uraian: "Pengecatan Fasad Eksterior Weathershield", satuan: "m2", mode: "manual", hargaManual: 45000 },
  { kategori: "Renovasi Eksterior", kode: "EKS-02", uraian: "Pemasangan Kanopi Baja Ringan + Atap Spandek", satuan: "m2", mode: "manual", hargaManual: 350000 },
  { kategori: "Event Organizer", kode: "EO-01", uraian: "Sewa & Pemasangan Tenda Sarnavil + Kursi", satuan: "paket", mode: "manual", hargaManual: 5000000 },
  { kategori: "Event Organizer", kode: "EO-02", uraian: "Dekorasi Panggung + Backdrop Event", satuan: "paket", mode: "manual", hargaManual: 8000000 },
  { kategori: "Event Organizer", kode: "EO-03", uraian: "Jasa MC & Sound System Event", satuan: "hari", mode: "manual", hargaManual: 3500000 },
  { kategori: "Konstruksi Baja", kode: "BJ-01", uraian: "Fabrikasi & Pasang Rangka Baja WF", satuan: "kg", mode: "detail", overhead: 12, komponen: [
    { jenis: "Bahan", uraian: "Besi WF", satuan: "kg", koefisien: 1.05, harga: 18000 },
    { jenis: "Bahan", uraian: "Cat Besi", satuan: "kg", koefisien: 0.05, harga: 35000 },
    { jenis: "Upah", uraian: "Tukang Las", satuan: "OH", koefisien: 0.02, harga: 150000 },
    { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.03, harga: 100000 }
  ] },
  { kategori: "Konstruksi Baja", kode: "BJ-02", uraian: "Pemasangan Atap Baja Spandek + Rangka", satuan: "m2", mode: "manual", hargaManual: 210000 },
  { kategori: "Gudang Gadai Sakti", kode: "GS-01", uraian: "Partisi Pengaman Wiremesh + Hollow Blacksteel", satuan: "m2", mode: "manual", hargaManual: 0 },
  { kategori: "Gudang Gadai Sakti", kode: "GS-02", uraian: "Pintu Plat Besi + Frame Hollow Blacksteel + Handle/Lock/Kunci/Engsel/Gembok Ex. Dekkson", satuan: "unit", mode: "manual", hargaManual: 0 },
  { kategori: "Gudang Gadai Sakti", kode: "GS-03", uraian: "Pintu Kamuflase Gypsum + Frame Hollow Blacksteel + Handle/Lock/Kunci/Engsel Ex. Dekkson", satuan: "unit", mode: "manual", hargaManual: 0 },
  { kategori: "Gudang Gadai Sakti", kode: "GS-04", uraian: "Plafond Wiremesh + Hollow Blacksteel", satuan: "m2", mode: "manual", hargaManual: 0 }
];

// Template AHSP standar per kategori — estimasi awal dari riset harga pasar (bukan angka resmi
// Perwali/PUPR yang belum bisa diakses otomatis), untuk diimpor & dikoreksi pengguna lewat menu
// AHSP > Template Standar. Komponen "Upah" sengaja tanpa field harga: diisi otomatis saat impor
// dari upah harian tertinggi karyawan aktif + 20% (lihat sumberHargaLookup("maxupah") di app.js).
const AHSP_TEMPLATES = [
  { kode: "TPL-CCTV-01", kategori: "CCTV", uraian: "Pemasangan Instalasi CCTV per Titik Kamera (Outdoor)", satuan: "titik", overhead: 10,
    referensi: "Estimasi riset harga pasar (gsi-indo.com, baguscctv.com, sistempemantau.com) — sesuaikan dgn merk kamera & kondisi lokasi",
    komponen: [
      { jenis: "Bahan", uraian: "Kamera CCTV Outdoor", satuan: "unit", koefisien: 1, harga: 800000 },
      { jenis: "Bahan", uraian: "Kabel Coaxial RG59", satuan: "m1", koefisien: 15, harga: 6000 },
      { jenis: "Bahan", uraian: "Adaptor/Power Supply 12V", satuan: "unit", koefisien: 1, harga: 60000 },
      { jenis: "Bahan", uraian: "Konektor BNC & Aksesoris", satuan: "set", koefisien: 1, harga: 30000 },
      { jenis: "Upah", uraian: "Teknisi Pasang CCTV", satuan: "OH", koefisien: 1 }
    ] },
  { kode: "TPL-CCTV-02", kategori: "CCTV", uraian: "Pemasangan Instalasi CCTV per Titik Kamera (Indoor/Dome)", satuan: "titik", overhead: 10,
    referensi: "Estimasi riset harga pasar (gsi-indo.com, baguscctv.com, hikvision-indonesia.com) — jarak kabel ke DVR/NVR standar s/d 10m, kelebihan pakai TPL-CCTV-04",
    komponen: [
      { jenis: "Bahan", uraian: "Kamera CCTV Indoor Dome", satuan: "unit", koefisien: 1, harga: 650000 },
      { jenis: "Bahan", uraian: "Kabel Coaxial RG59", satuan: "m1", koefisien: 10, harga: 6000 },
      { jenis: "Bahan", uraian: "Adaptor/Power Supply 12V", satuan: "unit", koefisien: 1, harga: 60000 },
      { jenis: "Bahan", uraian: "Konektor BNC & Aksesoris", satuan: "set", koefisien: 1, harga: 25000 },
      { jenis: "Upah", uraian: "Teknisi Pasang CCTV", satuan: "OH", koefisien: 0.75 }
    ] },
  { kode: "TPL-CCTV-03", kategori: "CCTV", uraian: "Instalasi & Setting DVR/NVR 8 Channel + Harddisk 2TB", satuan: "unit", overhead: 10,
    referensi: "Estimasi riset harga pasar paket CCTV 8 titik (gsi-indo.com, baguscctv.com, promocctv.com)",
    komponen: [
      { jenis: "Bahan", uraian: "DVR/NVR 8 Channel", satuan: "unit", koefisien: 1, harga: 850000 },
      { jenis: "Bahan", uraian: "Harddisk CCTV 2TB", satuan: "unit", koefisien: 1, harga: 750000 },
      { jenis: "Bahan", uraian: "Kabel Power & Konektor DVR", satuan: "set", koefisien: 1, harga: 50000 },
      { jenis: "Upah", uraian: "Teknisi Setting DVR/NVR", satuan: "OH", koefisien: 1 }
    ] },
  { kode: "TPL-CCTV-04", kategori: "CCTV", uraian: "Tambahan Instalasi Kabel CCTV per Meter (di luar paket standar)", satuan: "m1", overhead: 10,
    referensi: "Estimasi riset harga pasar (gsi-indo.com, baguscctv.com) — dipakai kalau jarak kamera ke DVR/NVR melebihi jatah standar per titik",
    komponen: [
      { jenis: "Bahan", uraian: "Kabel Coaxial RG59 + Power", satuan: "m1", koefisien: 1, harga: 7000 },
      { jenis: "Bahan", uraian: "Pipa Conduit/Klem Kabel", satuan: "m1", koefisien: 1, harga: 3000 },
      { jenis: "Upah", uraian: "Tukang Tarik Kabel", satuan: "OH", koefisien: 0.02 }
    ] },
  { kode: "TPL-CCTV-05", kategori: "CCTV", uraian: "Pemasangan Instalasi CCTV IP Camera + Kabel UTP per Titik", satuan: "titik", overhead: 10,
    referensi: "Estimasi riset harga pasar CCTV IP/PoE (hikvision-indonesia.com, baguscctv.com) — untuk sistem berbasis NVR IP, bukan DVR analog",
    komponen: [
      { jenis: "Bahan", uraian: "Kamera IP CCTV", satuan: "unit", koefisien: 1, harga: 1200000 },
      { jenis: "Bahan", uraian: "Kabel UTP Cat6", satuan: "m1", koefisien: 15, harga: 6000 },
      { jenis: "Bahan", uraian: "Konektor RJ45 & Boot", satuan: "set", koefisien: 1, harga: 15000 },
      { jenis: "Bahan", uraian: "PoE Injector/Switch PoE", satuan: "unit", koefisien: 0.25, harga: 250000 },
      { jenis: "Upah", uraian: "Teknisi Pasang CCTV IP", satuan: "OH", koefisien: 1 }
    ] },
  { kode: "TPL-AC-01", kategori: "AC", uraian: "Jasa Pasang AC Split Baru (1/2 PK - 1.5 PK)", satuan: "unit", overhead: 10,
    referensi: "Estimasi riset harga pasar jasa AC (hargaac.co.id, selka.id, trasfello.com, ahliac.com) — pipa tambahan di luar 3m dihitung terpisah",
    komponen: [
      { jenis: "Bahan", uraian: "Pipa AC (paket standar 3m)", satuan: "set", koefisien: 1, harga: 150000 },
      { jenis: "Bahan", uraian: "Bracket Outdoor", satuan: "unit", koefisien: 1, harga: 75000 },
      { jenis: "Bahan", uraian: "Kabel Power + Selang Pembuangan", satuan: "set", koefisien: 1, harga: 50000 },
      { jenis: "Upah", uraian: "Teknisi AC", satuan: "OH", koefisien: 1 }
    ] },
  { kode: "TPL-AC-02", kategori: "AC", uraian: "Jasa Pasang AC Split Baru (2 PK - 2.5 PK)", satuan: "unit", overhead: 10,
    referensi: "Estimasi riset harga pasar jasa AC (selka.id, ose.co.id, abangbenerin.com) — unit lebih besar butuh bracket & kabel power lebih kuat",
    komponen: [
      { jenis: "Bahan", uraian: "Pipa AC (paket standar 3m, ukuran besar)", satuan: "set", koefisien: 1, harga: 220000 },
      { jenis: "Bahan", uraian: "Bracket Outdoor Heavy Duty", satuan: "unit", koefisien: 1, harga: 110000 },
      { jenis: "Bahan", uraian: "Kabel Power + Selang Pembuangan", satuan: "set", koefisien: 1, harga: 70000 },
      { jenis: "Upah", uraian: "Teknisi AC", satuan: "OH", koefisien: 1.3 }
    ] },
  { kode: "TPL-AC-03", kategori: "AC", uraian: "Bongkar Pasang AC Split (Relokasi Unit)", satuan: "unit", overhead: 10,
    referensi: "Estimasi riset harga pasar (rafifteknik.com, haiservice.id, cariproperti.com) — termasuk isi ulang freon, belum termasuk pipa/bracket baru kalau jarak berubah jauh",
    komponen: [
      { jenis: "Bahan", uraian: "Freon R32/R410A Isi Ulang", satuan: "kali", koefisien: 1, harga: 180000 },
      { jenis: "Bahan", uraian: "Pipa AC Tambahan/Sambungan", satuan: "set", koefisien: 0.5, harga: 150000 },
      { jenis: "Bahan", uraian: "Bracket Outdoor", satuan: "unit", koefisien: 1, harga: 75000 },
      { jenis: "Upah", uraian: "Teknisi AC", satuan: "OH", koefisien: 1.5 }
    ] },
  { kode: "TPL-AC-04", kategori: "AC", uraian: "Cuci/Service AC Split (Rutin)", satuan: "unit", overhead: 10,
    referensi: "Estimasi riset harga pasar (sejasa.com, elobanaserviceac.com, griffinteknikac.com)",
    komponen: [
      { jenis: "Bahan", uraian: "Cairan Pembersih Evaporator/Kondensor", satuan: "paket", koefisien: 1, harga: 15000 },
      { jenis: "Upah", uraian: "Teknisi AC", satuan: "OH", koefisien: 0.4 }
    ] },
  { kode: "TPL-AC-05", kategori: "AC", uraian: "Tambahan Pipa AC per Meter (di luar paket standar 3m)", satuan: "m1", overhead: 10,
    referensi: "Estimasi riset harga pasar (selka.id, rafifteknik.com) — dipakai kalau jarak indoor-outdoor melebihi paket standar",
    komponen: [
      { jenis: "Bahan", uraian: "Pipa Tembaga AC + Isolasi Armaflex", satuan: "set", koefisien: 1, harga: 70000 },
      { jenis: "Bahan", uraian: "Kabel Power Tambahan", satuan: "m1", koefisien: 1, harga: 8000 },
      { jenis: "Upah", uraian: "Teknisi AC", satuan: "OH", koefisien: 0.1 }
    ] },
  { kode: "TPL-LIS-01", kategori: "Instalasi Listrik", uraian: "Instalasi Titik Lampu (Kabel NYM + Conduit + Fitting)", satuan: "titik", overhead: 10,
    referensi: "Estimasi riset harga pasar (mbizmarket.co.id, brighton.co.id, medcom.id)",
    komponen: [
      { jenis: "Bahan", uraian: "Kabel NYM 3x2.5mm", satuan: "m1", koefisien: 5, harga: 12000 },
      { jenis: "Bahan", uraian: "Pipa Conduit PVC 20mm", satuan: "m1", koefisien: 3, harga: 5000 },
      { jenis: "Bahan", uraian: "Fitting Lampu + Isolasi", satuan: "set", koefisien: 1, harga: 20000 },
      { jenis: "Upah", uraian: "Tukang Listrik", satuan: "OH", koefisien: 0.5 }
    ] },
  { kode: "TPL-ADV-04", kategori: "Advertising", uraian: "Pembuatan & Pasang Neon Box Acrylic Frontlight (rincian)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar advertising (neonboxhuruftimbulmurah.com, customkreatif.com, signagejakartaselatan.wordpress.com)",
    komponen: [
      { jenis: "Bahan", uraian: "Rangka Besi Hollow 4x4", satuan: "batang", koefisien: 0.8, harga: 120000 },
      { jenis: "Bahan", uraian: "Acrylic Frontlight 3mm", satuan: "m2", koefisien: 1, harga: 300000 },
      { jenis: "Bahan", uraian: "Lampu LED Strip", satuan: "m1", koefisien: 3, harga: 25000 },
      { jenis: "Bahan", uraian: "Trafo/Adaptor LED", satuan: "unit", koefisien: 0.15, harga: 150000 },
      { jenis: "Bahan", uraian: "Sealant/Lem", satuan: "tube", koefisien: 0.2, harga: 28000 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.6 },
      { jenis: "Upah", uraian: "Tukang", satuan: "OH", koefisien: 0.8 }
    ] },
  { kode: "TPL-ADV-05", kategori: "Advertising", uraian: "Pemasangan Huruf Timbul Acrylic LED (per cm tinggi huruf)", satuan: "cm", overhead: 10,
    referensi: "Estimasi riset harga pasar (neonboxhuruftimbulmurah.com, specialishuruftimbul.com) — harga dasar potong+bentuk per cm tinggi huruf, LED & pemasangan final disesuaikan di lapangan",
    komponen: [
      { jenis: "Bahan", uraian: "Acrylic Huruf Timbul 3mm", satuan: "cm", koefisien: 1, harga: 14500 },
      { jenis: "Bahan", uraian: "LED Module per Huruf (estimasi)", satuan: "titik", koefisien: 0.3, harga: 8000 },
      { jenis: "Upah", uraian: "Tukang Finishing", satuan: "OH", koefisien: 0.05 }
    ] },
  { kode: "TPL-ADV-06", kategori: "Advertising", uraian: "Cetak Spanduk Flexi China 280gsm", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar cetak digital 2026 (blog.harvestprinting.co.id, pandawa24jam.com, mitragraphia.com) — grade ekonomis untuk promosi jangka pendek",
    komponen: [
      { jenis: "Bahan", uraian: "Bahan Flexi China 280gsm (Cetak Digital)", satuan: "m2", koefisien: 1, harga: 16000 },
      { jenis: "Bahan", uraian: "Mata Itik/Eyelet & Tali", satuan: "m2", koefisien: 1, harga: 2000 },
      { jenis: "Upah", uraian: "Finishing & Pasang Mata Itik", satuan: "OH", koefisien: 0.02 }
    ] },
  { kode: "TPL-ADV-07", kategori: "Advertising", uraian: "Cetak Spanduk Flexi Korea 440gsm", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar cetak digital 2026 (blog.harvestprinting.co.id, pandawa24jam.com) — grade lebih tebal & tahan lama dari Flexi China",
    komponen: [
      { jenis: "Bahan", uraian: "Bahan Flexi Korea 440gsm (Cetak Digital)", satuan: "m2", koefisien: 1, harga: 50000 },
      { jenis: "Bahan", uraian: "Mata Itik/Eyelet & Tali", satuan: "m2", koefisien: 1, harga: 2000 },
      { jenis: "Upah", uraian: "Finishing & Pasang Mata Itik", satuan: "OH", koefisien: 0.02 }
    ] },
  { kode: "TPL-ADV-08", kategori: "Advertising", uraian: "Cetak Spanduk Flexi Backlite (untuk Neon Box)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar (blog.harvestprinting.co.id, pranataprinting.com) — bahan tembus cahaya untuk neon box/lightbox, jauh lebih mahal dari frontlite biasa",
    komponen: [
      { jenis: "Bahan", uraian: "Bahan Flexi Backlite", satuan: "m2", koefisien: 1, harga: 90000 },
      { jenis: "Upah", uraian: "Finishing & Pasang", satuan: "OH", koefisien: 0.03 }
    ] },
  { kode: "TPL-ADV-09", kategori: "Advertising", uraian: "Cutting Sticker Vinyl Lokal", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (quickprint.co.id, hsemeipack.co.id, cuttingstickerupdate.com)",
    komponen: [
      { jenis: "Bahan", uraian: "Vinyl Cutting Sticker Lokal", satuan: "m2", koefisien: 1, harga: 75000 },
      { jenis: "Upah", uraian: "Tukang Cutting & Pasang", satuan: "OH", koefisien: 0.05 }
    ] },
  { kode: "TPL-ADV-10", kategori: "Advertising", uraian: "Cutting Sticker Vinyl Import (Ritrama/Oracal)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (quickprint.co.id, suburindografika.com) — bahan import lebih tahan cuaca & warna lebih awet dari vinyl lokal",
    komponen: [
      { jenis: "Bahan", uraian: "Vinyl Cutting Sticker Import", satuan: "m2", koefisien: 1, harga: 100000 },
      { jenis: "Upah", uraian: "Tukang Cutting & Pasang", satuan: "OH", koefisien: 0.05 }
    ] },
  { kode: "TPL-ADV-11", kategori: "Advertising", uraian: "Sticker One Way Vision (Kaca)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (suburindografika.com, jadeprint.id) — untuk branding kaca etalase/mobil, tembus pandang dari sisi dalam",
    komponen: [
      { jenis: "Bahan", uraian: "Bahan One Way Vision Perforated", satuan: "m2", koefisien: 1, harga: 85000 },
      { jenis: "Upah", uraian: "Tukang Cutting & Pasang", satuan: "OH", koefisien: 0.05 }
    ] },
  { kode: "TPL-ADV-12", kategori: "Advertising", uraian: "X-Banner Lengkap 60x160 (Cetak + Kaki Standing)", satuan: "unit", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (suburindografika.com, primagraphia.co.id, revoprintonline.com) — ukuran standar 60x160cm, ukuran lain menyesuaikan",
    komponen: [
      { jenis: "Bahan", uraian: "Cetak Flexi Korea 60x160", satuan: "unit", koefisien: 1, harga: 55000 },
      { jenis: "Bahan", uraian: "Kaki Standing X-Banner", satuan: "unit", koefisien: 1, harga: 45000 },
      { jenis: "Upah", uraian: "Finishing & Pasang", satuan: "OH", koefisien: 0.02 }
    ] },
  { kode: "TPL-ADV-13", kategori: "Advertising", uraian: "Roll Up Banner Lengkap 60x160/85x200 (Cetak + Kaki Standing)", satuan: "unit", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (primagraphia.co.id, revoprintonline.com, bantengprint.com) — sudah termasuk kaki standing aluminium 1 set",
    komponen: [
      { jenis: "Bahan", uraian: "Cetak Photopaper/Flexi Roll Up", satuan: "unit", koefisien: 1, harga: 100000 },
      { jenis: "Bahan", uraian: "Kaki Standing Roll Up Aluminium", satuan: "unit", koefisien: 1, harga: 150000 },
      { jenis: "Upah", uraian: "Finishing & Pasang", satuan: "OH", koefisien: 0.02 }
    ] },
  { kode: "TPL-ADV-14", kategori: "Advertising", uraian: "Umbul-umbul Kain (Cetak Digital + Tiang)", satuan: "unit", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (muliaprint.com) — ukuran standar ±0.75x3m, bahan kain TC/Satin",
    komponen: [
      { jenis: "Bahan", uraian: "Kain TC/Satin (±0.75x3m)", satuan: "unit", koefisien: 1, harga: 60000 },
      { jenis: "Bahan", uraian: "Tiang Bambu/Fiber", satuan: "unit", koefisien: 1, harga: 40000 },
      { jenis: "Upah", uraian: "Jahit & Finishing", satuan: "OH", koefisien: 0.05 }
    ] },
  { kode: "TPL-ADV-15", kategori: "Advertising", uraian: "Konstruksi Tiang T Reklame (Tiang Pipa + Pondasi Beton)", satuan: "unit", overhead: 12,
    referensi: "Estimasi riset harga pasar konstruksi reklame 2026 (mbizmarket.co.id, billboard.mikkaintermedia.co.id, deta.co.id) — tiang tunggal + papan atas standar, belum termasuk izin/pajak reklame",
    komponen: [
      { jenis: "Bahan", uraian: "Pipa Besi Tiang dia. 4-6\"", satuan: "m1", koefisien: 6, harga: 220000 },
      { jenis: "Bahan", uraian: "Besi Siku/Hollow Rangka Papan", satuan: "kg", koefisien: 40, harga: 18000 },
      { jenis: "Bahan", uraian: "Semen, Pasir, Kerikil Pondasi", satuan: "paket", koefisien: 1, harga: 750000 },
      { jenis: "Bahan", uraian: "Cat & Menie Anti Karat", satuan: "paket", koefisien: 1, harga: 150000 },
      { jenis: "Upah", uraian: "Tukang Las/Konstruksi", satuan: "OH", koefisien: 4 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 6 }
    ] },
  { kode: "TPL-ADV-16", kategori: "Advertising", uraian: "Rangka Baja Papan Billboard (Panel + Rangka)", satuan: "m2", overhead: 12,
    referensi: "Estimasi riset harga pasar konstruksi billboard 2026 (mbizmarket.co.id, deta.co.id, sinergimedia.co.id) — untuk papan billboard skala besar di atas tiang/struktur yang sudah ada",
    komponen: [
      { jenis: "Bahan", uraian: "Besi Hollow/Siku Rangka", satuan: "kg", koefisien: 12, harga: 18000 },
      { jenis: "Bahan", uraian: "Plat Aluminium/Seng Panel", satuan: "m2", koefisien: 1, harga: 85000 },
      { jenis: "Bahan", uraian: "Cat & Menie", satuan: "m2", koefisien: 1, harga: 15000 },
      { jenis: "Upah", uraian: "Tukang Las", satuan: "OH", koefisien: 0.15 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.2 }
    ] },
  { kode: "TPL-ADV-17", kategori: "Advertising", uraian: "Huruf Timbul Stainless Steel (per cm tinggi huruf)", satuan: "cm", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (sinarlaserindonesia.com, specialishuruftimbul.com, demaadv.co.id) — harga dasar potong+bentuk per cm tinggi huruf, finishing mirror/hairline disesuaikan",
    komponen: [
      { jenis: "Bahan", uraian: "Plat Stainless Steel 0.8-1.2mm", satuan: "cm", koefisien: 1, harga: 9000 },
      { jenis: "Bahan", uraian: "Cat Duco/Finishing", satuan: "cm", koefisien: 1, harga: 1000 },
      { jenis: "Upah", uraian: "Tukang Finishing", satuan: "OH", koefisien: 0.03 }
    ] },
  { kode: "TPL-ADV-18", kategori: "Advertising", uraian: "Jasa Desain Grafis Reklame/Signage", satuan: "paket", overhead: 10,
    referensi: "Estimasi riset harga pasar jasa desain freelance 2026 (sribu.com, fastwork.id, jasadesain.co.id) — harga jasa memakai upah internal Mitra Creative, bukan tarif freelancer eksternal",
    komponen: [
      { jenis: "Upah", uraian: "Desainer Grafis", satuan: "OH", koefisien: 1 }
    ] },
  { kode: "TPL-ADV-19", kategori: "Advertising", uraian: "Jasa Visualisasi 3D / Mockup Reklame", satuan: "paket", overhead: 10,
    referensi: "Estimasi riset harga pasar jasa desain 3D freelance 2026 (sribu.com, fastwork.id) — dipakai untuk presentasi ke klien sebelum produksi fisik",
    komponen: [
      { jenis: "Upah", uraian: "Desainer 3D", satuan: "OH", koefisien: 1.5 }
    ] },
  { kode: "TPL-ADV-20", kategori: "Advertising", uraian: "Running Text LED Single Warna per Meter", satuan: "m1", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (tokopedia.com, primaled.id, 4c-light.com) — modul siap pasang termasuk casing, ukuran tinggi ±20cm",
    komponen: [
      { jenis: "Bahan", uraian: "Modul LED Running Text Single Color", satuan: "m1", koefisien: 1, harga: 650000 },
      { jenis: "Bahan", uraian: "Power Supply & Controller", satuan: "unit", koefisien: 0.15, harga: 350000 },
      { jenis: "Upah", uraian: "Teknisi Pasang Running Text", satuan: "OH", koefisien: 0.3 }
    ] },
  { kode: "TPL-ADV-21", kategori: "Advertising", uraian: "Running Text LED Full Color per Meter", satuan: "m1", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (tokopedia.com, primaled.id, sinarglodok.com) — modul P10 full color, bisa tampilkan animasi/gambar sederhana",
    komponen: [
      { jenis: "Bahan", uraian: "Modul LED Running Text Full Color P10", satuan: "m1", koefisien: 1, harga: 1500000 },
      { jenis: "Bahan", uraian: "Power Supply & Controller Full Color", satuan: "unit", koefisien: 0.15, harga: 500000 },
      { jenis: "Upah", uraian: "Teknisi Pasang Running Text", satuan: "OH", koefisien: 0.4 }
    ] },
  { kode: "TPL-ADV-22", kategori: "Advertising", uraian: "Videotron Indoor P2.5 per m2", satuan: "m2", overhead: 12,
    referensi: "Estimasi riset harga pasar videotron 2026 (uno.id, gsi-indo.com, olzavisual.com) — pixel pitch rapat untuk jarak pandang dekat (dalam ruangan)",
    komponen: [
      { jenis: "Bahan", uraian: "Modul LED Indoor P2.5", satuan: "m2", koefisien: 1, harga: 18000000 },
      { jenis: "Bahan", uraian: "Power Supply & Cabinet", satuan: "m2", koefisien: 1, harga: 1500000 },
      { jenis: "Bahan", uraian: "Sender Card/Sistem Kontrol", satuan: "paket", koefisien: 0.05, harga: 5000000 },
      { jenis: "Upah", uraian: "Teknisi Videotron", satuan: "OH", koefisien: 1.5 }
    ] },
  { kode: "TPL-ADV-23", kategori: "Advertising", uraian: "Videotron Outdoor P4 per m2", satuan: "m2", overhead: 12,
    referensi: "Estimasi riset harga pasar videotron 2026 (uno.id, gsi-indo.com, indonesiavideotron.com) — untuk billboard/papan iklan digital luar ruangan, jarak pandang menengah",
    komponen: [
      { jenis: "Bahan", uraian: "Modul LED Outdoor P4", satuan: "m2", koefisien: 1, harga: 25000000 },
      { jenis: "Bahan", uraian: "Power Supply & Cabinet Waterproof", satuan: "m2", koefisien: 1, harga: 2000000 },
      { jenis: "Bahan", uraian: "Sender Card/Sistem Kontrol", satuan: "paket", koefisien: 0.03, harga: 6000000 },
      { jenis: "Upah", uraian: "Teknisi Videotron", satuan: "OH", koefisien: 2 }
    ] },
  { kode: "TPL-ADV-24", kategori: "Advertising", uraian: "Videotron Outdoor P10 per m2", satuan: "m2", overhead: 12,
    referensi: "Estimasi riset harga pasar videotron 2026 (uno.id, gsi-indo.com) — pixel pitch renggang, lebih ekonomis untuk billboard skala besar & jarak pandang jauh",
    komponen: [
      { jenis: "Bahan", uraian: "Modul LED Outdoor P10", satuan: "m2", koefisien: 1, harga: 15000000 },
      { jenis: "Bahan", uraian: "Power Supply & Cabinet Waterproof", satuan: "m2", koefisien: 1, harga: 1800000 },
      { jenis: "Bahan", uraian: "Sender Card/Sistem Kontrol", satuan: "paket", koefisien: 0.02, harga: 6000000 },
      { jenis: "Upah", uraian: "Teknisi Videotron", satuan: "OH", koefisien: 1.5 }
    ] },
  { kode: "TPL-ADV-25", kategori: "Advertising", uraian: "Huruf Timbul Kuningan/Tembaga (per cm tinggi huruf)", satuan: "cm", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (tradisilogam.com, karyautama-steel.com, sinergimedia.co.id) — material premium untuk signage korporat/hotel/resto, finishing poles atau antique",
    komponen: [
      { jenis: "Bahan", uraian: "Plat Kuningan/Tembaga 1-1.5mm", satuan: "cm", koefisien: 1, harga: 18000 },
      { jenis: "Bahan", uraian: "Finishing Poles/Antique", satuan: "cm", koefisien: 1, harga: 2000 },
      { jenis: "Upah", uraian: "Tukang Finishing Premium", satuan: "OH", koefisien: 0.05 }
    ] },
  { kode: "TPL-ADV-26", kategori: "Advertising", uraian: "Huruf Timbul GRC (per cm tinggi huruf, untuk huruf besar outdoor)", satuan: "cm", overhead: 10,
    referensi: "Estimasi kasar dari harga material GRC (mitra10.com) + markup fabrikasi cetak cor huruf besar -- cek ulang ke vendor GRC lokal, variasi harga cukup besar tergantung ukuran & kerumitan cetakan",
    komponen: [
      { jenis: "Bahan", uraian: "GRC Precast Huruf", satuan: "cm", koefisien: 1, harga: 5000 },
      { jenis: "Bahan", uraian: "Cat Finishing Weathershield", satuan: "cm", koefisien: 1, harga: 800 },
      { jenis: "Upah", uraian: "Tukang Cetak & Finishing GRC", satuan: "OH", koefisien: 0.04 }
    ] },
  { kode: "TPL-ADV-27", kategori: "Advertising", uraian: "Pembuatan & Pasang Neon Box Flexi Backlight (rincian)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar neon box 2026 (neonboxjabodetabek.id, neonboxcustom.com, milleniaart.com) — pelengkap TPL-ADV-04 (varian acrylic frontlight); box housing sama, permukaan pakai flexi backlite yang dicetak gambar/tulisan, disinari LED dari dalam",
    komponen: [
      { jenis: "Bahan", uraian: "Rangka Besi Hollow 4x4", satuan: "batang", koefisien: 0.8, harga: 120000 },
      { jenis: "Bahan", uraian: "Flexi Backlite (Cetak)", satuan: "m2", koefisien: 1, harga: 90000 },
      { jenis: "Bahan", uraian: "Lampu LED Strip", satuan: "m1", koefisien: 3, harga: 25000 },
      { jenis: "Bahan", uraian: "Trafo/Adaptor LED", satuan: "unit", koefisien: 0.15, harga: 150000 },
      { jenis: "Bahan", uraian: "Sealant/Lem", satuan: "tube", koefisien: 0.2, harga: 28000 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.6 },
      { jenis: "Upah", uraian: "Tukang", satuan: "OH", koefisien: 0.8 }
    ] },
  { kode: "TPL-ADV-28", kategori: "Advertising", uraian: "Bongkar Neon Box/Signage Lama", satuan: "m2", overhead: 10,
    referensi: "Estimasi internal Mitra Creative (jasa bongkar murni, harga pasar spesifik jarang dipublikasikan) — sebelum pasang neon box/signage baru di lokasi yang sama",
    komponen: [
      { jenis: "Bahan", uraian: "Material Tambal/Finishing Bekas Bongkaran", satuan: "m2", koefisien: 1, harga: 10000 },
      { jenis: "Upah", uraian: "Tukang Bongkar", satuan: "OH", koefisien: 0.15 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.15 }
    ] },
  { kode: "TPL-ADV-29", kategori: "Advertising", uraian: "Cetak Baliho Flexi (Produksi Saja, per m2)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar cetak digital 2026 (blog.harvestprinting.co.id, jagoanspanduk.com) — cuma cetak, belum termasuk rangka/pendirian (lihat TPL-ADV-30/31) & pasang (TPL-ADV-32) yang biasanya jadi item terpisah",
    komponen: [
      { jenis: "Bahan", uraian: "Bahan Flexi China 340gsm", satuan: "m2", koefisien: 1, harga: 25000 },
      { jenis: "Bahan", uraian: "Mata Itik/Eyelet & Tali", satuan: "m2", koefisien: 1, harga: 2000 },
      { jenis: "Upah", uraian: "Finishing", satuan: "OH", koefisien: 0.02 }
    ] },
  { kode: "TPL-ADV-30", kategori: "Advertising", uraian: "Pendirian Rangka Baliho Bambu/Kayu (Struktur Sementara)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar 2026 (flooringdeckingbali.wordpress.com, mbizmarket.co.id, semestaadvertising.id) — struktur sementara untuk baliho jangka pendek, bambu lokal + usuk kayu bengkirai",
    komponen: [
      { jenis: "Bahan", uraian: "Bambu/Usuk Kayu Bengkirai", satuan: "m2", koefisien: 1, harga: 280000 },
      { jenis: "Bahan", uraian: "Paku/Tali Pengikat", satuan: "paket", koefisien: 1, harga: 20000 },
      { jenis: "Upah", uraian: "Tukang Pasang Rangka", satuan: "OH", koefisien: 0.3 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.3 }
    ] },
  { kode: "TPL-ADV-31", kategori: "Advertising", uraian: "Pendirian Rangka Baliho Besi (Struktur Permanen)", satuan: "m2", overhead: 12,
    referensi: "Estimasi riset harga pasar 2026 (mbizmarket.co.id — rangka papan baliho besi) — struktur lebih permanen & tahan lama dari rangka bambu/kayu, untuk baliho ukuran besar/jangka panjang",
    komponen: [
      { jenis: "Bahan", uraian: "Besi Hollow/Siku Rangka", satuan: "kg", koefisien: 10, harga: 18000 },
      { jenis: "Bahan", uraian: "Cat & Menie Anti Karat", satuan: "m2", koefisien: 1, harga: 15000 },
      { jenis: "Upah", uraian: "Tukang Las", satuan: "OH", koefisien: 0.2 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.15 }
    ] },
  { kode: "TPL-ADV-32", kategori: "Advertising", uraian: "Jasa Pasang Baliho ke Rangka (Finishing)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar jasa pemasangan baliho 2026 (mbizmarket.co.id, 99advertising.id) — murni jasa naikkan & ikat flexi baliho ke rangka yang sudah berdiri (TPL-ADV-30/31)",
    komponen: [
      { jenis: "Bahan", uraian: "Tali/Kawat Pengikat", satuan: "m2", koefisien: 1, harga: 3000 },
      { jenis: "Upah", uraian: "Tukang Pasang", satuan: "OH", koefisien: 0.1 }
    ] },
  { kode: "TPL-ADV-33", kategori: "Advertising", uraian: "Papan Nama Toko Galvanis + Cat Duco (Produksi + Pasang)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar signage 2026 (neonboxjabodetabek.id, reklamejogja.com, builder.id) — opsi signage dasar/ekonomis, pelengkap neon box & huruf timbul yang harganya lebih premium",
    komponen: [
      { jenis: "Bahan", uraian: "Plat Galvanis 0.8mm", satuan: "m2", koefisien: 1, harga: 180000 },
      { jenis: "Bahan", uraian: "Rangka Hollow", satuan: "batang", koefisien: 0.5, harga: 120000 },
      { jenis: "Bahan", uraian: "Cat Duco", satuan: "kg", koefisien: 0.3, harga: 45000 },
      { jenis: "Upah", uraian: "Tukang", satuan: "OH", koefisien: 0.4 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.3 }
    ] },
  { kode: "TPL-BJ-03", kategori: "Konstruksi Baja", uraian: "Pemasangan Dinding ACP + Rangka Hollow", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar (alcoseven.co.id, pasangaluminiumkaca.com, 99.co)",
    komponen: [
      { jenis: "Bahan", uraian: "Aluminium Composite Panel (ACP)", satuan: "m2", koefisien: 1.1, harga: 500000 },
      { jenis: "Bahan", uraian: "Besi Hollow 4x4 Galvanis", satuan: "batang", koefisien: 0.8, harga: 120000 },
      { jenis: "Bahan", uraian: "Bracket Siku/Spigot/Stiffener", satuan: "batang", koefisien: 0.267, harga: 65000 },
      { jenis: "Bahan", uraian: "Paku Sekrup Beton", satuan: "kg", koefisien: 0.19, harga: 24000 },
      { jenis: "Bahan", uraian: "Sealant", satuan: "tube", koefisien: 0.25, harga: 28000 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.39 },
      { jenis: "Upah", uraian: "Tukang Las/Besi", satuan: "OH", koefisien: 0.70 },
      { jenis: "Upah", uraian: "Kepala Tukang Besi", satuan: "OH", koefisien: 0.07 },
      { jenis: "Upah", uraian: "Mandor", satuan: "OH", koefisien: 0.007 }
    ] },
  { kode: "TPL-BJ-04", kategori: "Konstruksi Baja", uraian: "Pemasangan Dinding ACP Motif Kayu/Batu Premium + Rangka Hollow", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar ACP 2026 (trideko.com, naseni.id, jasapasangfasad.com) — ACP motif kayu/batu/metalik, lebih mahal dari ACP solid color biasa",
    komponen: [
      { jenis: "Bahan", uraian: "ACP Motif Kayu/Batu Premium", satuan: "m2", koefisien: 1.1, harga: 650000 },
      { jenis: "Bahan", uraian: "Besi Hollow 4x4 Galvanis", satuan: "batang", koefisien: 0.8, harga: 120000 },
      { jenis: "Bahan", uraian: "Bracket Siku/Spigot/Stiffener", satuan: "batang", koefisien: 0.267, harga: 65000 },
      { jenis: "Bahan", uraian: "Paku Sekrup Beton", satuan: "kg", koefisien: 0.19, harga: 24000 },
      { jenis: "Bahan", uraian: "Sealant", satuan: "tube", koefisien: 0.25, harga: 28000 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.39 },
      { jenis: "Upah", uraian: "Tukang Las/Besi", satuan: "OH", koefisien: 0.70 }
    ] },
  { kode: "TPL-BJ-05", kategori: "Konstruksi Baja", uraian: "ACP Cutting Huruf/Logo (Papan Nama Timbul ACP)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar ACP cutting/routing 2026 (trideko.com, naseni.id) — dihitung dari luas bidang huruf/logo yang di-cutting, bukan luas panel utuh",
    komponen: [
      { jenis: "Bahan", uraian: "ACP untuk Cutting", satuan: "m2", koefisien: 1, harga: 550000 },
      { jenis: "Bahan", uraian: "Jasa Cutting/Routing CNC", satuan: "m2", koefisien: 1, harga: 150000 },
      { jenis: "Bahan", uraian: "Rangka Dudukan Belakang", satuan: "m2", koefisien: 1, harga: 80000 },
      { jenis: "Upah", uraian: "Tukang Pasang", satuan: "OH", koefisien: 0.3 }
    ] },
  { kode: "TPL-EKS-03", kategori: "Renovasi Eksterior", uraian: "Pemasangan Kanopi Baja Ringan + Atap Spandek (rincian)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar borongan kanopi (jasabajaringan.com, hargakanopi.com, petra-truss.com)",
    komponen: [
      { jenis: "Bahan", uraian: "Rangka Baja Ringan Kanal CNP 0.75mm", satuan: "m2", koefisien: 1, harga: 150000 },
      { jenis: "Bahan", uraian: "Atap Spandek 0.35mm", satuan: "m2", koefisien: 1, harga: 90000 },
      { jenis: "Bahan", uraian: "Baut & Aksesoris", satuan: "set", koefisien: 1, harga: 15000 },
      { jenis: "Upah", uraian: "Tukang Pasang", satuan: "OH", koefisien: 0.5 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.3 }
    ] },
  { kode: "TPL-EKS-04", kategori: "Renovasi Eksterior", uraian: "Fasad GRC Precast Motif", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar GRC 2026 (mitra10.com) — GRC board precast bermotif untuk fasad dekoratif, beda dari plesteran/pengecatan biasa",
    komponen: [
      { jenis: "Bahan", uraian: "GRC Board Precast Motif", satuan: "m2", koefisien: 1, harga: 350000 },
      { jenis: "Bahan", uraian: "Rangka Hollow Galvanis", satuan: "m2", koefisien: 1, harga: 90000 },
      { jenis: "Bahan", uraian: "Sealant & Aksesoris", satuan: "m2", koefisien: 1, harga: 20000 },
      { jenis: "Upah", uraian: "Tukang Pasang GRC", satuan: "OH", koefisien: 0.35 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.2 }
    ] },
  { kode: "TPL-EKS-05", kategori: "Renovasi Eksterior", uraian: "Fasad Batu Alam/Andesit", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar fasad 2026 (trideko.com) — kisaran harga batu alam cukup lebar tergantung jenis batu (andesit/paras/templek)",
    komponen: [
      { jenis: "Bahan", uraian: "Batu Alam/Andesit", satuan: "m2", koefisien: 1, harga: 750000 },
      { jenis: "Bahan", uraian: "Semen Perekat Batu Alam", satuan: "kg", koefisien: 5, harga: 3000 },
      { jenis: "Bahan", uraian: "Coating Anti Jamur/Waterproofing", satuan: "m2", koefisien: 1, harga: 25000 },
      { jenis: "Upah", uraian: "Tukang Pasang Batu Alam", satuan: "OH", koefisien: 0.6 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.4 }
    ] },
  { kode: "TPL-EKS-06", kategori: "Renovasi Eksterior", uraian: "Fasad Kaca Curtain Wall", satuan: "m2", overhead: 12,
    referensi: "Estimasi riset harga pasar fasad 2026 (trideko.com, acpindo.com) — kaca tempered + rangka aluminium struktural, untuk fasad gedung skala menengah-besar",
    komponen: [
      { jenis: "Bahan", uraian: "Kaca Tempered 10-12mm", satuan: "m2", koefisien: 1, harga: 1100000 },
      { jenis: "Bahan", uraian: "Rangka Aluminium Curtain Wall", satuan: "m2", koefisien: 1, harga: 450000 },
      { jenis: "Bahan", uraian: "Sealant Structural & Aksesoris", satuan: "m2", koefisien: 1, harga: 50000 },
      { jenis: "Upah", uraian: "Tukang Kaca/Aluminium", satuan: "OH", koefisien: 0.5 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.3 }
    ] },
  { kode: "TPL-SIP-04", kategori: "Sipil/Konstruksi", uraian: "Pengecatan Dinding Interior (Plamir + Dasar + 2 Lapis Cat)", satuan: "m2", overhead: 10,
    referensi: "AHSP A.47111:2016 (koefisien tenaga metode Permen PUPR) — harga bahan riset pasar, cek ulang",
    komponen: [
      { jenis: "Bahan", uraian: "Cat Dasar", satuan: "kg", koefisien: 0.12, harga: 35000 },
      { jenis: "Bahan", uraian: "Cat Penutup", satuan: "kg", koefisien: 0.18, harga: 40000 },
      { jenis: "Bahan", uraian: "Plamir Tembok", satuan: "kg", koefisien: 0.1, harga: 15000 },
      { jenis: "Upah", uraian: "Pekerja", satuan: "OH", koefisien: 0.028 },
      { jenis: "Upah", uraian: "Tukang Cat", satuan: "OH", koefisien: 0.042 }
    ] },
  // ===== Event Organizer (rincian) =====
  // EO-01/02/03 (SEED_AHSP) cuma harga borongan gabungan per paket, tanpa
  // rincian Bahan/Upah -- beda dari kategori lain, jasa EO praktis tidak
  // ada di dataset resmi AHSP_TEMPLATES_RESMI sama sekali (0 hasil untuk
  // "tenda", "panggung", "sound system", "dekorasi"), jadi item rincian di
  // bawah murni riset harga pasar sewa event, bukan dari standar PUPR.
  { kode: "TPL-EO-04", kategori: "Event Organizer", uraian: "Sewa & Pasang Tenda Sarnavil per m2 (rincian)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar sewa tenda 2026 (tendaintanali.com, amidekorasi.com, nusatent.com)",
    komponen: [
      { jenis: "Bahan", uraian: "Sewa Tenda Sarnavil", satuan: "m2", koefisien: 1, harga: 35000 },
      { jenis: "Bahan", uraian: "Sewa Kursi Chitose", satuan: "unit", koefisien: 0.5, harga: 5000 },
      { jenis: "Upah", uraian: "Tukang Pasang Tenda", satuan: "OH", koefisien: 0.05 }
    ] },
  { kode: "TPL-EO-05", kategori: "Event Organizer", uraian: "Dekorasi Panggung + Backdrop Flexi per m2 (rincian)", satuan: "m2", overhead: 10,
    referensi: "Estimasi riset harga pasar dekorasi event 2026 (kingsign.id, backdropevent.id, firstbackdrop.com)",
    komponen: [
      { jenis: "Bahan", uraian: "Rangka Panggung/Backdrop", satuan: "m2", koefisien: 1, harga: 100000 },
      { jenis: "Bahan", uraian: "Bahan Flexi Cetak Backdrop", satuan: "m2", koefisien: 1, harga: 90000 },
      { jenis: "Upah", uraian: "Tukang Dekorasi", satuan: "OH", koefisien: 0.1 }
    ] },
  { kode: "TPL-EO-06", kategori: "Event Organizer", uraian: "Sewa Sound System Basic (2 Speaker + Operator) per Hari", satuan: "hari", overhead: 10,
    referensi: "Estimasi riset harga pasar sewa sound system 2026 (naremax.com, eventnesia.id, dbeventequipment.com) — paket basic, belum termasuk transportasi",
    komponen: [
      { jenis: "Bahan", uraian: "Sewa Sound System Basic", satuan: "paket", koefisien: 1, harga: 900000 },
      { jenis: "Upah", uraian: "Operator Sound", satuan: "OH", koefisien: 1 }
    ] },
  { kode: "TPL-EO-07", kategori: "Event Organizer", uraian: "Sewa Sound System Menengah (Line Array Kecil) per Hari", satuan: "hari", overhead: 10,
    referensi: "Estimasi riset harga pasar sewa sound system 2026 (naremax.com, eventnesia.id) — untuk kapasitas ratusan orang, belum termasuk transportasi",
    komponen: [
      { jenis: "Bahan", uraian: "Sewa Sound System Menengah (Line Array)", satuan: "paket", koefisien: 1, harga: 8000000 },
      { jenis: "Upah", uraian: "Operator Sound", satuan: "OH", koefisien: 1 }
    ] },
  { kode: "TPL-EO-08", kategori: "Event Organizer", uraian: "Sewa Lighting Panggung (Par LED + Moving Head) per Hari", satuan: "hari", overhead: 10,
    referensi: "Estimasi riset harga pasar sewa lighting event 2026 (dbeventequipment.com, eventnesia.id) — kebutuhan umum menyertai sewa sound system/panggung",
    komponen: [
      { jenis: "Bahan", uraian: "Sewa Lighting Set (Par LED + Moving Head)", satuan: "paket", koefisien: 1, harga: 3000000 },
      { jenis: "Upah", uraian: "Operator Lighting", satuan: "OH", koefisien: 1 }
    ] }
];

// Extend seed data with RAB/AHSP/Penawaran defaults
SEED_DATA.ahsp = SEED_AHSP;
SEED_DATA.proyekRab = [];
SEED_DATA.penawaran = [];
SEED_DATA.penawaranCounter = 0;
SEED_DATA.alamat = COMPANY_ADDRESS;
SEED_DATA.telepon = COMPANY_PHONE;
SEED_DATA.ownerNama = OWNER_INFO.nama;
SEED_DATA.ownerJabatan = OWNER_INFO.jabatan;

// ===== Stok Material & Alat =====
const KATEGORI_STOK = ["Material", "Alat"];
const SATUAN_STOK = ["pcs", "unit", "kg", "m1", "m2", "m3", "liter", "batang", "lembar", "dus", "roll", "set", "sak"];
SEED_DATA.stok = [];

// ===== Karyawan & Gaji =====
SEED_DATA.karyawan = [];

// ===== Klien (CRM/Pipeline) =====
SEED_DATA.klien = [];

// ===== Pemasok =====
SEED_DATA.pemasok = [];

// ===== Gudang / Lokasi Stok =====
SEED_DATA.gudang = [];

// ===== Approval pengeluaran besar =====
SEED_DATA.approvalThreshold = 0;
