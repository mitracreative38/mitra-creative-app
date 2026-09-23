from playwright.sync_api import sync_playwright

# Permintaan Owner (2026-09-23, gambar stempel Mitra Creative): stempel
# perusahaan tercetak DI BAWAH tanda tangan Owner (ttd menimpa stempel)
# di semua dokumen. Yang diuji:
# 1. Helper ttdDenganStempel dipakai ownerTtdOrSpace: stempel + ttd muncul
#    berpasangan di cetak Invoice, Slip Gaji, dan MOU.
# 2. Cetak Penawaran (template Mitra/pwmc) ikut berstempel.
# 3. Nama penandatangan BUKAN Owner -> tetap ruang ttd kosong, tanpa stempel.
# 4. CSS stempel: posisi absolut di belakang ttd (z-index ttd lebih tinggi).

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8938/index.html")
    page.wait_for_timeout(1200)

    # ===== 1. ownerTtdOrSpace berstempel (dipakai Invoice/Slip/MOU/SPK) =====
    st1 = page.evaluate("""
      () => {
        const html = ownerTtdOrSpace(OWNER_TTD_NAMA);
        return {
          adaStempel: html.includes('ttd-stempel') && html.includes(OWNER_STEMPEL_DATA_URI.slice(0, 40)),
          adaTtd: html.includes('ttd-img'),
          urutan: html.indexOf('ttd-stempel') < html.indexOf('ttd-img')
        };
      }
    """)
    assert st1["adaStempel"] and st1["adaTtd"], st1
    assert st1["urutan"], "stempel harus dirender sebelum ttd (di bawah/di belakang)"
    print("Skenario 1 (ownerTtdOrSpace: stempel + ttd berpasangan, stempel di lapisan bawah) OK")

    # ===== 2. Cetak penawaran Mitra ikut berstempel =====
    st2 = page.evaluate("""
      () => {
        const pw = { id: 'pw-st', nomor: 'PH-1', tanggal: hariIniIso(), kepada: 'Klien', perihal: 'Uji',
          kategori: KATEGORI_PEKERJAAN[0], status: 'draft', diskon: 0, ppn: 0, pph: 0, biayaLain: 0,
          items: [], skemaPembayaran: [], nego: [], syarat: '', penutup: '',
          ttdNama: OWNER_TTD_NAMA, ttdJabatan: 'Owner' };
        const html = buildPenawaranPrintHtml(pw);
        return html.includes('ttd-stempel') && html.includes('ttd-img');
      }
    """)
    assert st2, "cetak penawaran Mitra harus berstempel"
    print("Skenario 2 (cetak Surat Penawaran Mitra berstempel di bawah ttd) OK")

    # ===== 3. Penandatangan bukan Owner -> tanpa stempel =====
    st3 = page.evaluate("""
      () => {
        const html = ownerTtdOrSpace('Orang Lain');
        return !html.includes('ttd-stempel') && html.includes('sign-space');
      }
    """)
    assert st3, "nama lain harus tetap ruang ttd kosong tanpa stempel"
    print("Skenario 3 (penandatangan bukan Owner: tanpa stempel, ruang ttd kosong) OK")

    # ===== 4. CSS: stempel absolut di belakang ttd =====
    st4 = page.evaluate("""
      () => {
        const area = document.getElementById('printArea');
        area.innerHTML = '<div style="text-align:right;">' + ownerTtdOrSpace(OWNER_TTD_NAMA) + '</div>';
        area.style.display = 'block';
        const stempel = area.querySelector('.ttd-stempel');
        const ttd = area.querySelector('.ttd-wrap .ttd-img');
        const cs = getComputedStyle(stempel);
        const ct = getComputedStyle(ttd);
        return { pos: cs.position, zStempel: cs.zIndex, zTtd: ct.zIndex,
          tampil: stempel.complete !== undefined };
      }
    """)
    assert st4["pos"] == "absolute" and st4["zStempel"] == "0" and st4["zTtd"] == "1", st4
    print("Skenario 4 (CSS: stempel absolut z-index 0, ttd z-index 1 -- ttd menimpa stempel) OK")

    js_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (4 skenario)")
    browser.close()
