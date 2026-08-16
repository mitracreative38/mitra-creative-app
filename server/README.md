# Server Backend (Node.js)

Backend terpisah dari frontend statis di `www/` (yang tetap di-deploy ke
GitHub Pages seperti biasa, tidak berubah). Server ini yang nanti menangani
hal-hal yang tidak bisa dilakukan dari situs statis: cetak PDF otomatis,
pengingat WhatsApp/email terjadwal, dan payment gateway.

Tahap sekarang baru fondasi: server Express kosong dengan satu endpoint
`/health` untuk memastikan semuanya tersambung dengan benar sebelum fitur
sungguhan (PDF, WA/email, payment) mulai ditambahkan satu per satu.

## Menjalankan di komputer sendiri (opsional, untuk coba-coba)

```
cd server
npm install
cp .env.example .env
# isi SUPABASE_SERVICE_ROLE_KEY di file .env (lihat instruksi di dalam file itu)
npm run dev
```

Lalu buka `http://localhost:3000/health` di browser -- harus muncul
`{"ok":true,...}`.

## Deploy ke Railway (dilakukan sendiri oleh Owner, sekali saja)

Langkah ini butuh akun & kartu pembayaran Owner sendiri, jadi tidak bisa
dilakukan otomatis -- ikuti langkah berikut di [railway.app](https://railway.app):

1. Daftar/masuk ke Railway pakai akun GitHub yang sama dengan repo ini.
2. Klik **New Project > Deploy from GitHub repo**, pilih repo
   `mitracreative38/mitra-creative-app`.
3. Setelah project dibuat, buka pengaturan service-nya (Settings), cari
   **Root Directory**, isi dengan `server` -- supaya Railway cuma
   menjalankan folder ini, bukan seluruh repo.
4. Buka tab **Variables**, tambahkan:
   - `SUPABASE_URL` = `https://iapcwaowvscftjfcdutm.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = (ambil dari Supabase Dashboard >
     Project Settings > API > bagian "service_role secret" -- klik
     "Reveal" lalu salin. **Jangan pernah dibagikan/ditaruh di tempat
     lain.**)
   - `ALLOWED_ORIGIN` = `https://mitracreative38.github.io`
5. Railway akan otomatis build & jalankan server begitu variable disimpan.
   Tunggu sampai statusnya "Active", lalu buka tab **Settings > Networking**
   dan klik **Generate Domain** untuk dapat alamat publik server ini
   (bentuknya seperti `mitra-creative-server-production.up.railway.app`).
6. Cek `https://<alamat-railway-anda>/health` di browser -- harus muncul
   `{"ok":true,"supabaseConfigured":true,...}`. Kalau `supabaseConfigured`
   masih `false`, berarti Variable di langkah 4 belum tersimpan dengan
   benar.
7. Kabari alamat Railway itu supaya bisa dipakai untuk langkah berikutnya
   (menyambungkan frontend ke server ini untuk fitur PDF/WA/email/payment).

Setelah ini aktif, setiap kali ada perubahan di folder `server/` yang
di-push ke branch `main`, Railway akan otomatis build ulang dan deploy --
sama seperti GitHub Pages untuk frontend.
