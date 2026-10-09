from playwright.sync_api import sync_playwright

# Laporan Owner (2026-10-09): Termin Diterima KLA Mataram Rp 406 juta
# padahal nilai kontrak Rp 225 juta -- "kena double invoice".
# Akar masalah: uang masuk dicatat MANUAL di Kas saat diterima, lalu
# invoice di-set "Dibayar" sehingga tercipta Kas Masuk OTOMATIS kedua
# untuk uang yang sama -> Termin Diterima/Laporan dobel hitung.
# Yang diuji:
# 1. Pencegahan: saat invoice di-set Dibayar dan ada Kas Masuk manual
#    belum tertaut dengan proyek & jumlah sama -> tawaran TAUTKAN; OK =
#    tidak ada transaksi baru, catatan manual tertaut ke invoice.
# 2. Tolak tawaran (Batal) = tetap buat catatan baru (perilaku lama).
# 3. Penyembuhan: dobel yang sudah terlanjur terdeteksi di Pemeriksaan
#    Integrasi; tombol "Rapikan Dobel" menghapus txn otomatis, menautkan
#    txn manual -> Termin Diterima kembali benar.
# 4. Tanpa salah tangkap: Kas Masuk manual dengan jumlah BEDA tidak
#    dianggap dobel.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    dialogs = []
    respons_queue = []
    def on_dialog(d):
        dialogs.append(f"{d.type}:{d.message[:250]}")
        aksi = respons_queue.pop(0) if respons_queue else "accept"
        (d.dismiss if aksi == "dismiss" else d.accept)()
    page.on("dialog", on_dialog)
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8939/index.html")
    page.wait_for_timeout(1200)

    page.evaluate("""
      () => {
        const proyek = { id: 'p-dbl', nama: 'KLA Mataram', klien: 'KLA', klienId: '', lokasi: 'Semarang',
          nilaiKontrak: 225764959, status: 'berjalan', tanggalMulai: hariIniIso(), rencanaTermin: [],
          bap: [], dokumen: [], karyawanIds: [], subkontraktor: [], belanjaMaterial: [],
          invoices: [
            { id: 'inv-a', nomor: 'INV-A', tanggal: hariIniIso(), keterangan: 'Termin 1', jumlah: 50000000, status: 'terkirim', tanggalBayar: '' },
            { id: 'inv-b', nomor: 'INV-B', tanggal: hariIniIso(), keterangan: 'Termin 2', jumlah: 70000000, status: 'dibayar', tanggalBayar: hariIniIso() }
          ] };
        state.proyek.push(proyek);
        // Catatan manual saat uang termin 1 & 2 diterima (belum tertaut invoice)
        state.kasUsaha.transactions.push(
          { id: 'tx-m1', tipe: 'Masuk', status: 'lunas', tanggal: hariIniIso(), jumlah: 50000000,
            kategori: 'Pendapatan Jasa', keterangan: 'Terima termin 1 KLA Mataram', proyekId: 'p-dbl', sumberInvoiceId: '' },
          { id: 'tx-m2', tipe: 'Masuk', status: 'lunas', tanggal: hariIniIso(), jumlah: 70000000,
            kategori: 'Pendapatan Jasa', keterangan: 'Terima termin 2 KLA Mataram', proyekId: 'p-dbl', sumberInvoiceId: '' },
          // Duplikat otomatis yang sudah terlanjur tercipta utk INV-B
          { id: 'tx-auto-b', tipe: 'Masuk', status: 'lunas', tanggal: hariIniIso(), jumlah: 70000000,
            kategori: 'Pendapatan Jasa', keterangan: 'Pembayaran Invoice INV-B', proyekId: 'p-dbl', sumberInvoiceId: 'inv-b' }
        );
        saveState();
        currentProyekId = 'p-dbl';
        renderInvoiceProyek(proyek);
      }
    """)

    # ===== 1. Pencegahan: set INV-A Dibayar -> tawaran tautkan (OK) =====
    jml_txn = page.evaluate("state.kasUsaha.transactions.length")
    dialogs.clear()
    page.evaluate("""
      () => {
        const sel = document.querySelector('.inv-status[data-id="inv-a"]');
        sel.value = 'dibayar';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    """)
    page.wait_for_timeout(400)
    st1 = page.evaluate("""
      () => ({
        n: state.kasUsaha.transactions.length,
        m1: state.kasUsaha.transactions.find(t => t.id === 'tx-m1').sumberInvoiceId,
        status: state.proyek.find(x => x.id === 'p-dbl').invoices.find(i => i.id === 'inv-a').status
      })
    """)
    assert any("belum tertaut ke invoice mana pun" in d for d in dialogs), dialogs
    assert st1 == {"n": jml_txn, "m1": "inv-a", "status": "dibayar"}, st1
    print("Skenario 1 (invoice Dibayar: Kas manual yang cocok DITAUTKAN, tidak ada catatan dobel baru) OK")

    # ===== 2. Batal tawaran = buat catatan baru (perilaku lama) =====
    page.evaluate("""
      () => {
        const p = state.proyek.find(x => x.id === 'p-dbl');
        p.invoices.push({ id: 'inv-c', nomor: 'INV-C', tanggal: hariIniIso(), keterangan: 'Termin 3', jumlah: 30000000, status: 'terkirim', tanggalBayar: '' });
        state.kasUsaha.transactions.push({ id: 'tx-m3', tipe: 'Masuk', status: 'lunas', tanggal: hariIniIso(), jumlah: 30000000,
          kategori: 'Pendapatan Jasa', keterangan: 'Terima termin 3', proyekId: 'p-dbl', sumberInvoiceId: '' });
        saveState();
        renderInvoiceProyek(p);
      }
    """)
    respons_queue.append("dismiss")
    page.evaluate("""
      () => {
        const sel = document.querySelector('.inv-status[data-id="inv-c"]');
        sel.value = 'dibayar';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    """)
    page.wait_for_timeout(400)
    st2 = page.evaluate("""
      () => ({
        auto: state.kasUsaha.transactions.some(t => t.sumberInvoiceId === 'inv-c' && t.id !== 'tx-m3'),
        m3: state.kasUsaha.transactions.find(t => t.id === 'tx-m3').sumberInvoiceId || ''
      })
    """)
    assert st2 == {"auto": True, "m3": ""}, st2
    print("Skenario 2 (tawaran ditolak: catatan otomatis baru tetap dibuat seperti biasa) OK")

    # ===== 3. Penyembuhan dobel terlanjur (INV-B dan INV-C kini dobel) =====
    termin_sebelum = page.evaluate("projectCalc(state.proyek.find(x => x.id === 'p-dbl')).terminDiterima")
    assert termin_sebelum == 50000000 + 70000000 * 2 + 30000000 * 2, termin_sebelum
    temuan = page.evaluate("""
      () => {
        const t = computePemeriksaanIntegrasi().find(x => x.fix === 'kasDobelInvoice');
        return t ? t.data.map(d => d.inv.nomor) : null;
      }
    """)
    assert temuan and sorted(temuan) == ["INV-B", "INV-C"], temuan
    dialogs.clear()
    page.evaluate("""
      () => {
        renderPemeriksaanIntegrasi();
        document.querySelector('[data-fix-kas-dobel]').click();
      }
    """)
    page.wait_for_timeout(500)
    st3 = page.evaluate("""
      () => ({
        termin: projectCalc(state.proyek.find(x => x.id === 'p-dbl')).terminDiterima,
        autoB: state.kasUsaha.transactions.some(t => t.id === 'tx-auto-b'),
        m2: state.kasUsaha.transactions.find(t => t.id === 'tx-m2').sumberInvoiceId,
        m3: state.kasUsaha.transactions.find(t => t.id === 'tx-m3').sumberInvoiceId,
        sisaTemuan: computePemeriksaanIntegrasi().some(x => x.fix === 'kasDobelInvoice')
      })
    """)
    assert st3["termin"] == 50000000 + 70000000 + 30000000, st3
    assert not st3["autoB"] and st3["m2"] == "inv-b" and st3["m3"] == "inv-c" and not st3["sisaTemuan"], st3
    print("Skenario 3 (Rapikan Dobel: duplikat otomatis dihapus, manual tertaut, Termin Diterima kembali benar) OK")

    # ===== 4. Tanpa salah tangkap: jumlah beda tidak dianggap dobel =====
    st4 = page.evaluate("""
      () => {
        state.kasUsaha.transactions.push({ id: 'tx-lain', tipe: 'Masuk', status: 'lunas', tanggal: hariIniIso(),
          jumlah: 12345678, kategori: 'Pendapatan Jasa', keterangan: 'Pendapatan lain', proyekId: 'p-dbl', sumberInvoiceId: '' });
        saveState();
        return computePemeriksaanIntegrasi().some(x => x.fix === 'kasDobelInvoice');
      }
    """)
    assert st4 is False, "Kas Masuk jumlah beda tidak boleh dianggap dobel"
    print("Skenario 4 (Kas Masuk lain dengan jumlah beda tidak ikut tertangkap) OK")

    js_errors = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (4 skenario)")
    browser.close()
