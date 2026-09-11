# Tes Playwright

Tes UI otomatis (Python + Playwright, Chromium) untuk aplikasi di `www/`.

Cara menjalankan:

```bash
pip install playwright
# jalankan server statis dari folder www di port yang dipakai file tesnya
cd www && python3 -m http.server 8937 --bind 127.0.0.1 &
cd www && python3 -m http.server 8944 --bind 127.0.0.1 &
python3 tests/test_setengah_hari_spek.py
python3 tests/audit_smoke_semua_halaman.py
```

Disimpan di repo (bukan folder sementara) supaya suite tes tidak hilang
saat lingkungan kerja di-reset.
