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
