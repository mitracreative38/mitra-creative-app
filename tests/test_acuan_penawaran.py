from playwright.sync_api import sync_playwright

# Permintaan Owner (2026-10-09): "ketika penawaran naik ke margin proyek,
# detail penghitungan penawaran langsung hilang, gak bisa buat acuan" --
# rincian perhitungan penawaran kini di-SNAPSHOT ke proyek saat proyek
# dibuat dan tampil sebagai panel baca-saja "Acuan Perhitungan Penawaran"
# di Margin Proyek (bahan koreksi lonjakan volume/material). Yang diuji:
# 1. createProyekFromDoc menyimpan snapshot lengkap (items, pph, totals)
#    dan ikut dikirim ke cloud (proyekToRow.acuan_penawaran).
# 2. Panel acuan tampil di detail proyek dengan item + totals + PPh.
# 3. Penawaran sumbernya DIHAPUS -> panel tetap tampil (snapshot permanen).
# 4. Proyek lama tanpa snapshot: dibangun otomatis dari dokumen sumber
#    yang masih ada; tanpa dokumen & tanpa snapshot -> panel tersembunyi.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8939/index.html")
    page.wait_for_timeout(1200)

    # ===== 1. Snapshot saat proyek lahir =====
    st1 = page.evaluate("""
      () => {
        const pw = { id: 'pw-acu', nomor: '050/MC-PH/X/2026', tanggal: hariIniIso(), klienId: '',
          kepada: 'KLA COMPUTER', alamatKlien: '', perihal: 'Renovasi Acuan', kategori: KATEGORI_PEKERJAAN[0],
          status: 'disetujui', diskon: 0, ppn: 0, pph: 0.5, biayaLain: 0,
          items: [
            { id: 'i1', uraian: 'Pasang partisi', spesifikasi: 'Gypsum 9mm', satuan: 'm2', volume: 100, hargaSatuan: 250000, kelompok: 'SIPIL' },
            { id: 'i2', uraian: 'Instalasi listrik', spesifikasi: '', satuan: 'titik', volume: 20, hargaSatuan: 350000, kelompok: 'ME' }
          ], skemaPembayaran: [], nego: [], syarat: '', penutup: '' };
        state.penawaran.push(pw);
        saveState();
        const { proj } = createProyekFromDoc('pw', pw);
        window.__projId = proj.id;
        const a = proj.acuanPenawaran;
        return { nomor: a.nomor, nItems: a.items.length, pph: a.pph,
                 subtotal: a.totals.subtotal, pphValue: a.totals.pphValue, total: a.totals.total,
                 mirrorAda: !!proyekToRow(proj).acuan_penawaran };
      }
    """)
    # subtotal = 100x250rb + 20x350rb = 32jt; PPh 0,5% = 160rb; total 32.16jt
    assert st1 == {"nomor": "050/MC-PH/X/2026", "nItems": 2, "pph": 0.5,
                   "subtotal": 32000000, "pphValue": 160000, "total": 32160000, "mirrorAda": True}, st1
    print("Skenario 1 (snapshot acuan lengkap tersimpan di proyek + ikut baris mirror cloud) OK")

    # ===== 2. Panel acuan tampil di detail proyek =====
    st2 = page.evaluate("""
      () => {
        currentProyekId = window.__projId;
        renderProyekDetail();
        const panel = document.getElementById('pd_acuanPanel');
        const isi = document.querySelector('#pd_acuanTable tbody').innerHTML;
        return { tampil: panel.style.display !== 'none', isi,
                 ket: document.getElementById('pd_acuanKet').textContent };
      }
    """)
    assert st2["tampil"], "panel acuan harus tampil"
    for teks in ["Pasang partisi", "Gypsum 9mm", "Instalasi listrik", "Rp 250.000", "Total Penawaran", "Rp 32.160.000", "PPh Final (0.5%)"]:
        assert teks in st2["isi"], f"'{teks}' tidak ada di tabel acuan"
    assert "050/MC-PH/X/2026" in st2["ket"] and "baca-saja" in st2["ket"], st2["ket"]
    print("Skenario 2 (panel Acuan Perhitungan Penawaran tampil lengkap: item + spesifikasi + totals + PPh) OK")

    # ===== 3. Penawaran dihapus -> acuan tetap ada =====
    st3 = page.evaluate("""
      () => {
        state.penawaran = state.penawaran.filter(x => x.id !== 'pw-acu');
        saveState();
        renderProyekDetail();
        return { tampil: document.getElementById('pd_acuanPanel').style.display !== 'none',
                 isi: document.querySelector('#pd_acuanTable tbody').innerHTML.includes('Pasang partisi') };
      }
    """)
    assert st3["tampil"] and st3["isi"], ("acuan harus tetap tampil walau penawaran sumber dihapus", st3)
    print("Skenario 3 (penawaran sumber dihapus: acuan TETAP tampil dari snapshot permanen) OK")

    # ===== 4. Proyek lama tanpa snapshot =====
    st4 = page.evaluate("""
      () => {
        state.penawaran.push({ id: 'pw-lama2', nomor: 'PH-LAMA2', tanggal: hariIniIso(), klienId: '', kepada: 'X',
          alamatKlien: '', perihal: 'lama', kategori: KATEGORI_PEKERJAAN[0], status: 'disetujui',
          diskon: 0, ppn: 0, pph: 0, biayaLain: 0, items: [
            { id: 'j1', uraian: 'Neon box lama', spesifikasi: '', satuan: 'unit', volume: 1, hargaSatuan: 5000000, kelompok: '' }
          ], skemaPembayaran: [], nego: [], syarat: '', penutup: '' });
        state.proyek.push({ id: 'p-lama', nama: 'Proyek Lama', klien: 'X', nilaiKontrak: 5000000, status: 'berjalan',
          tanggalMulai: hariIniIso(), sumberPenawaranId: 'pw-lama2', invoices: [], rencanaTermin: [], bap: [], dokumen: [] });
        state.proyek.push({ id: 'p-polos', nama: 'Proyek Polos', klien: 'Y', nilaiKontrak: 0, status: 'berjalan',
          tanggalMulai: hariIniIso(), invoices: [], rencanaTermin: [], bap: [], dokumen: [] });
        saveState();
        currentProyekId = 'p-lama';
        renderProyekDetail();
        const lamaTampil = document.getElementById('pd_acuanPanel').style.display !== 'none';
        const lamaIsi = document.querySelector('#pd_acuanTable tbody').innerHTML.includes('Neon box lama');
        const snapshotTerbentuk = !!state.proyek.find(x => x.id === 'p-lama').acuanPenawaran;
        currentProyekId = 'p-polos';
        renderProyekDetail();
        const polosTersembunyi = document.getElementById('pd_acuanPanel').style.display === 'none';
        return { lamaTampil, lamaIsi, snapshotTerbentuk, polosTersembunyi };
      }
    """)
    assert st4 == {"lamaTampil": True, "lamaIsi": True, "snapshotTerbentuk": True, "polosTersembunyi": True}, st4
    print("Skenario 4 (proyek lama: acuan dibangun otomatis dari dokumen sumber; proyek tanpa sumber: panel tersembunyi) OK")

    js_errors = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (4 skenario)")
    browser.close()
