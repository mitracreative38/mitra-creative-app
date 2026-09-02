// Service Worker — Mode Offline tim lapangan (saran poin c).
//
// Tujuan: aplikasi tetap BISA DIBUKA dan dipakai di lokasi tanpa sinyal.
// Data memang sudah tersimpan lokal (localStorage) sejak awal, tapi tanpa
// service worker halaman itu sendiri gagal dimuat saat offline — jadi data
// yang aman pun tidak bisa diakses. Worker ini menyimpan salinan cangkang
// aplikasi (HTML/JS/CSS/ikon) di Cache Storage.
//
// Strategi: NETWORK-FIRST dengan cadangan cache. Saat online, selalu ambil
// versi terbaru dari server (jadi pembaruan deploy langsung terasa, sejalan
// dengan mekanisme banner "versi usang" di app.js) sambil memperbarui
// salinan cache; saat offline, sajikan salinan terakhir dari cache.
// Panggilan data (Supabase / server API) TIDAK pernah di-cache — data
// bisnis harus selalu segar, dan kegagalannya sudah ditangani gagal-lembut
// oleh app.js (mode lokal + antrean sinkron).
const CACHE_NAME = "mitra-offline-v1";
const APP_SHELL = [
  "./",
  "index.html",
  "app.js",
  "data.js",
  "style.css",
  "manifest.json",
  "mobile-init.bundle.js",
  "qrcode.bundle.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // add() satu per satu (bukan addAll): satu file gagal tidak boleh
    // menggagalkan seluruh pemasangan salinan offline.
    await Promise.allSettled(APP_SHELL.map(path => cache.add(path)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Hanya GET aset origin sendiri yang dicegat. Lalu lintas data (Supabase,
// server API pendamping) dan pustaka CDN dibiarkan langsung ke browser:
// data bisnis harus selalu segar, dan <script> CDN dimuat no-cors
// (respons opaque) sehingga memang tidak pernah bisa dijadikan cadangan
// cache — mencegatnya cuma menyamarkan pesan error jaringan aslinya.
function bolehDicache(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/api/")) return false;
  return true;
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (!/^https?:$/.test(url.protocol)) return;
  if (!bolehDicache(url)) return; // biarkan browser menangani langsung

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // Simpan salinan hanya untuk respons sehat (200) — respons error /
      // opaque tidak berguna sebagai cadangan offline.
      if (fresh && fresh.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      // Offline: sajikan salinan terakhir. ignoreSearch supaya
      // "app.js?v=abc123" (cache-busting deploy) tetap cocok dengan
      // salinan "app.js?v=lama" yang tersimpan.
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      // Navigasi halaman (buka/refresh aplikasi) jatuh ke index.html.
      if (req.mode === "navigate") {
        const shell = await caches.match("index.html", { ignoreSearch: true });
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
