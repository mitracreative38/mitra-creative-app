const { execSync } = require("child_process");
const puppeteer = require("puppeteer-core");

// Dipisah dari index.js supaya bisa diuji langsung (require() + panggil
// fungsinya) tanpa perlu menjalankan seluruh server Express atau
// menyentuh Supabase -- ini persis bagian yang lolos dari pengujian
// sebelumnya (bug ReferenceError PUPPETEER_EXECUTABLE_PATH tidak
// terdeteksi karena jalur kode ini tidak pernah benar-benar tereksekusi
// di pengetesan lokal, cuma jalur error Supabase yang tereksekusi duluan).

// Kalau env var PUPPETEER_EXECUTABLE_PATH tidak diisi manual, cari
// Chromium yang di-install nixpacks.toml lewat PATH (`which`) -- ini yang
// dipakai di Railway secara default, tanpa Owner perlu mengisi env var
// tambahan secara manual.
let resolvedChromiumPath = null;
function resolveChromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (resolvedChromiumPath) return resolvedChromiumPath;
  for (const bin of ["chromium", "chromium-browser", "google-chrome-stable"]) {
    try {
      resolvedChromiumPath = execSync(`which ${bin}`, { encoding: "utf8" }).trim();
      if (resolvedChromiumPath) return resolvedChromiumPath;
    } catch (e) { /* coba nama berikutnya */ }
  }
  return null;
}

let browserPromise = null;
async function getBrowser() {
  const executablePath = resolveChromiumPath();
  if (!executablePath) {
    throw new Error("Chromium tidak ditemukan di server ini -- pastikan nixpacks.toml (nixPkgs \"chromium\") sudah ter-deploy, atau isi env var PUPPETEER_EXECUTABLE_PATH manual. Lihat server/README.md.");
  }
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath,
      // Wajib di kontainer Linux tanpa user namespace (Railway dst.) --
      // tanpa ini Chromium gagal start dengan error sandbox.
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }).catch(err => { browserPromise = null; throw err; });
  }
  return browserPromise;
}

module.exports = { resolveChromiumPath, getBrowser };
