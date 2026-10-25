from playwright.sync_api import sync_playwright

# Permintaan Owner (2026-10-25): cetak PENAWARAN sama seperti invoice --
# PPh Final dibagi otomatis ke jumlah tiap uraian pekerjaan, hasil
# penawaran sudah termasuk PPh (tanpa baris PPh terlihat klien).
# Grand Total TIDAK berubah, hanya penyajian. Yang diuji:
# 1. Penawaran Mitra (pwmc, berkelompok): tiap item & sub total kelompok
#    sudah termasuk PPh proporsional; baris "Jumlah Seluruh Bagian
#    Pekerjaan" = Grand Total; tanpa baris PPh; sisa pembulatan di item
#    terakhir sehingga penjumlahan persis.
# 2. PPh 0: angka dasar tampil apa adanya (tidak ada markup).
# 3. Template Mata Resolusi: sama (urutan item flat), catatan tidak
#    menyebut PPh.
# 4. MOU: tabel item & subtotal sama tersamarkan, kalimat memakai "pajak
#    yang berlaku" tanpa menyebut PPh.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8939/index.html")
    page.wait_for_timeout(1200)

    page.evaluate("""
      () => {
        window.__pwSamar = {
          id: 'pw-samar', nomor: '060/MC-PH/X/2026', tanggal: hariIniIso(), klienId: '',
          kepada: 'KLA COMPUTER', alamatKlien: 'Surabaya', perihal: 'Renovasi Cabang',
          kategori: KATEGORI_PEKERJAAN[0], status: 'terkirim', diskon: 0, ppn: 0, pph: 0.5, biayaLain: 0,
          items: [
            { id: 'a1', kelompok: 'BAGIAN A', uraian: 'Partisi dinding', spesifikasi: '', satuan: 'ls', volume: 1, hargaSatuan: 10000000 },
            { id: 'b1', kelompok: 'BAGIAN B', uraian: 'Pintu gudang', spesifikasi: '', satuan: 'ls', volume: 1, hargaSatuan: 5000000 },
            { id: 'b2', kelompok: 'BAGIAN B', uraian: 'Transportasi', spesifikasi: '', satuan: 'ls', volume: 1, hargaSatuan: 4000000 }
          ], skemaPembayaran: [], nego: [], syarat: '1. Harga sudah final', penutup: 'Terima kasih.',
          ttdNama: '', ttdJabatan: ''
        };
      }
    """)

    # ===== 1. Penawaran Mitra berkelompok =====
    html = page.evaluate("buildPenawaranPrintHtml(window.__pwSamar)")
    # subtotal 19jt + PPh 0,5% (95rb) = 19.095.000; item: 10.050.000 /
    # 5.025.000 / sisa 4.020.000; sub total B = 9.045.000
    assert "PPh Final" not in html, "baris PPh tidak boleh tampil di penawaran"
    for teks in ["Rp 10.050.000", "Rp 5.025.000", "Rp 4.020.000", "Rp 9.045.000", "Jumlah Seluruh Bagian Pekerjaan", "Grand Total Penawaran"]:
        assert teks in html, f"'{teks}' tidak ada di cetakan penawaran"
    assert html.count("Rp 19.095.000") == 2, f"subtotal & grand total harus sama-sama 19.095.000: {html.count('Rp 19.095.000')}"
    assert "Rp 10.000.000" not in html and "Rp 19.000.000" not in html, "angka dasar tanpa PPh tidak boleh tampil"
    print("Skenario 1 (penawaran: PPh terbagi ke item & sub total kelompok; subtotal = grand total; tanpa baris PPh) OK")

    # ===== 2. PPh 0: tanpa markup =====
    html0 = page.evaluate("""
      () => {
        const pw = JSON.parse(JSON.stringify(window.__pwSamar));
        pw.pph = 0;
        return buildPenawaranPrintHtml(pw);
      }
    """)
    assert "Rp 10.000.000" in html0 and html0.count("Rp 19.000.000") == 2 and "PPh Final" not in html0, "pph 0 harus tampil apa adanya"
    print("Skenario 2 (pph 0: angka dasar utuh, tanpa markup) OK")

    # ===== 3. Mata Resolusi =====
    html_mr = page.evaluate("""
      () => {
        const pw = JSON.parse(JSON.stringify(window.__pwSamar));
        pw.brand = 'mataresolusi';
        pw.items = [
          { id: 'm1', uraian: 'Branding dinding', spesifikasi: '', satuan: 'ls', volume: 1, hargaSatuan: 1000000 },
          { id: 'm2', uraian: 'Neon box', spesifikasi: '', satuan: 'unit', volume: 1, hargaSatuan: 1000000 }
        ];
        return buildPenawaranPrintHtml(pw);
      }
    """)
    assert "PPh Final" not in html_mr, "template Mata Resolusi tidak boleh menyebut PPh"
    assert html_mr.count("Rp 1.005.000") == 2 and "Rp 2.010.000" in html_mr, "item & total MR harus sudah termasuk PPh"
    print("Skenario 3 (Mata Resolusi: PPh terbagi ke item, catatan tanpa PPh) OK")

    # ===== 4. MOU =====
    html_mou = page.evaluate("""
      () => {
        const pw = JSON.parse(JSON.stringify(window.__pwSamar));
        pw.status = 'disetujui';
        pw.mou = { tanggal: hariIniIso() };
        return buildMouPrintHtml(pw);
      }
    """)
    assert "PPh Final" not in html_mou, "MOU tidak boleh menyebut PPh"
    assert "Rp 10.050.000" in html_mou and html_mou.count("Rp 19.095.000") >= 2, "item & total MOU harus sudah termasuk PPh"
    assert "pajak yang berlaku" in html_mou, "kalimat harga memakai 'pajak yang berlaku'"
    print("Skenario 4 (MOU: item & subtotal tersamarkan, kalimat 'pajak yang berlaku') OK")

    js_errors = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (4 skenario)")
    browser.close()
