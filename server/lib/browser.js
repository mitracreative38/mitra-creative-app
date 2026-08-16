const puppeteer = require("puppeteer");

// Dipisah dari index.js supaya bisa diuji langsung (require() + panggil
// fungsinya) tanpa perlu menjalankan seluruh server Express atau
// menyentuh Supabase.
//
// Percobaan pertama (nixpacks.toml + puppeteer-core mencari Chromium
// sistem lewat PATH) TERBUKTI TIDAK JALAN di Railway -- ternyata Railway
// memakai build system "Railpack", bukan Nixpacks, jadi nixpacks.toml
// custom sama sekali tidak terbaca. Sekarang pakai paket "puppeteer"
// penuh: Chromium yang kompatibel otomatis terdownload sendiri saat
// "npm install" di proses build -- langkah standar yang selalu jalan apa
// pun build system-nya, tidak bergantung pada file konfigurasi custom
// yang ternyata sulit dipastikan terbaca atau tidak.
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      // Kalau PUPPETEER_EXECUTABLE_PATH diisi manual (mis. untuk
      // pengembangan lokal, atau kalau ternyata Chromium bawaan puppeteer
      // tidak bisa jalan di Railway karena kurang library sistem), pakai
      // itu; kalau tidak, biarkan puppeteer pakai Chromium bawaannya
      // sendiri yang sudah otomatis terdownload saat npm install.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      // Wajib di kontainer Linux tanpa user namespace (Railway dst.) --
      // tanpa ini Chromium gagal start dengan error sandbox.
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }).catch(err => { browserPromise = null; throw err; });
  }
  return browserPromise;
}

module.exports = { getBrowser };
