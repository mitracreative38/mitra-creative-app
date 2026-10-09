from playwright.sync_api import sync_playwright

# Permintaan Owner (2026-09-23, screenshot invoice): invoice termin terlalu
# kosong -- harga deal & rincian sub total yang disahkan tidak ada, termin
# lain (lunas/belum ditagih) tidak terlihat, sisa tagihan tidak ada.
# Yang diuji pada cetak invoice:
# 1. Rincian Nilai Kontrak: sub total per kelompok dari penawaran yang
#    disahkan + penyesuaian harga deal/nego + baris Nilai Kontrak.
# 2. Status Termin Pembayaran: semua termin tampil -- Lunas (termin 1),
#    TAGIHAN INI (termin 2), Belum ditagih (termin 3 & 4).
# 3. Ringkasan: Nilai Kontrak, Sudah Dibayar Sebelumnya, Total Tagihan Ini,
#    dan Sisa Tagihan Setelah Invoice Ini dengan angka yang benar.
# 4. Proyek tanpa rencana termin & tanpa dokumen sumber tetap tercetak
#    normal (fallback lama) tanpa error.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8938/index.html")
    page.wait_for_timeout(1200)

    page.evaluate("""
      () => {
        const pw = { id: 'pw-inv', nomor: '047/MC-PH/IX/2026', tanggal: hariIniIso(), klienId: '',
          kepada: 'PT. KLA TEKNOLOGI INDONESIA', alamatKlien: '', perihal: 'Renovasi KLA Computer',
          kategori: KATEGORI_PEKERJAAN[0], status: 'disetujui', diskon: 0, ppn: 0, pph: 0, biayaLain: 0,
          items: [
            { id: 'i1', uraian: 'Neon box', spesifikasi: '', satuan: 'unit', volume: 2, hargaSatuan: 100000000, kelompok: 'BARANG' },
            { id: 'i2', uraian: 'Jasa pasang', spesifikasi: '', satuan: 'ls', volume: 1, hargaSatuan: 100000000, kelompok: 'JASA' }
          ], skemaPembayaran: [], nego: [], syarat: '', penutup: '' };
        state.penawaran.push(pw);
        const proyek = { id: 'pr-inv', nama: 'RENOVASI KLA COMPUTER CABANG BANDUNG', klien: 'PT. KLA TEKNOLOGI INDONESIA',
          status: 'berjalan', nilaiKontrak: 295000000, tanggalMulai: hariIniIso(), lokasi: '',
          sumberPenawaranId: 'pw-inv', biayaBahan: 0, biayaUpah: 0, biayaLain: 0,
          karyawanIds: [], subkontraktor: [], belanjaMaterial: [], dokumen: [],
          rencanaTermin: [
            { id: 't1', label: 'Termin 1', persen: 30, nilai: 88500000, tipe: 'normal', invoiceId: 'inv-1' },
            { id: 't2', label: 'Termin 2', persen: 40, nilai: 118000000, tipe: 'normal', invoiceId: 'inv-2' },
            { id: 't3', label: 'Termin 3', persen: 20, nilai: 59000000, tipe: 'normal' },
            { id: 't4', label: 'Termin 4', persen: 10, nilai: 29500000, tipe: 'retensi' }
          ],
          invoices: [
            { id: 'inv-1', nomor: '007/MC-INV/IX/2026', tanggal: '2026-09-10', keterangan: 'Termin 1 — RENOVASI KLA',
              jumlah: 88500000, status: 'dibayar', tanggalBayar: '2026-09-12' },
            { id: 'inv-2', nomor: '008/MC-INV/IX/2026', tanggal: hariIniIso(), keterangan: 'Termin 2 — RENOVASI KLA',
              jumlah: 118000000, status: 'terkirim', tanggalBayar: '' }
          ] };
        state.proyek.push(proyek);
        saveState();
        document.getElementById('printArea').innerHTML =
          buildInvoicePrintHtml(proyek, proyek.invoices[1]);
      }
    """)
    page.wait_for_timeout(300)

    teks = page.evaluate("document.getElementById('printArea').textContent")

    # ===== 1. Rincian nilai kontrak =====
    assert "Rincian Nilai Kontrak" in teks and "BARANG" in teks and "JASA" in teks, "sub total kelompok harus tampil"
    assert "Rp 200.000.000" in teks and "Rp 100.000.000" in teks, teks[:400]
    assert "Penyesuaian Harga Deal/Nego" in teks and "- Rp 5.000.000" in teks, \
        "harga deal 295jt beda dari total dokumen 300jt harus tampil sebagai penyesuaian"
    assert "Nilai Kontrak (Harga Deal)" in teks and "Rp 295.000.000" in teks
    print("Skenario 1 (rincian nilai kontrak: sub total BARANG/JASA + penyesuaian nego + harga deal 295jt) OK")

    # ===== 2. Status semua termin =====
    assert "Status Termin Pembayaran" in teks
    assert "TAGIHAN INI" in teks, "termin yang sedang ditagih harus bertanda"
    assert "Lunas" in teks and "12" in teks, "termin 1 harus tampil Lunas dengan tanggal bayar"
    assert teks.count("Belum ditagih") == 2, f"termin 3 & 4 harus tampil Belum ditagih: {teks.count('Belum ditagih')}"
    assert "(retensi)" in teks
    print("Skenario 2 (status semua termin: Lunas / TAGIHAN INI / 2x Belum ditagih + penanda retensi) OK")

    # ===== 3. Ringkasan pembayaran =====
    # (dibetulkan 1/10 atas laporan Owner: sisa = yang BELUM DITAGIH, jadi
    # invoice sebelumnya dikurangkan walau statusnya baru Terkirim)
    assert "Sudah Ditagih Sebelumnya" in teks and "Rp 88.500.000" in teks
    assert "dibayar Rp 88.500.000" in teks, "keterangan porsi yang sudah dibayar harus tampil"
    assert "Total Tagihan Ini" in teks and "Rp 118.000.000" in teks
    assert "Sisa Belum Ditagih Setelah Invoice Ini" in teks, "sisa belum ditagih wajib tampil"
    # Rekening bawaan perusahaan wajib tampil walau Pengaturan > Rekening kosong.
    assert "854-6013940" in teks, "rekening bawaan CV harus tercetak di invoice"
    # 295jt - 88.5jt - 118jt = 88.5jt (muncul minimal 2x: termin lunas & sisa)
    assert teks.count("Rp 88.500.000") >= 2, teks.count("Rp 88.500.000")
    print("Skenario 3 (ringkasan: ditagih sebelumnya 88,5jt (dibayar), tagihan ini 118jt, sisa belum ditagih 88,5jt) OK")

    # ===== 3b. Kasus Owner 1/10: termin 1 baru "Terkirim" (belum dibayar)
    # tetap dikurangkan; invoice ADDENDUM tidak ikut mengurangi kontrak =====
    teks3b = page.evaluate("""
      () => {
        const p = state.proyek.find(x => x.id === 'pr-inv');
        p.invoices[0].status = 'terkirim';
        p.invoices[0].tanggalBayar = '';
        p.invoices.push({ id: 'inv-add', nomor: '009/MC-INV/X/2026', tanggal: hariIniIso(),
          keterangan: 'Addendum Pekerjaan Tambahan', jumlah: 20000000, status: 'terkirim', tanggalBayar: '',
          addendumItems: [{ uraian: 'Pekerjaan tambahan', volume: 1, satuan: 'ls', hargaSatuan: 20000000 }] });
        document.getElementById('printArea').innerHTML = buildInvoicePrintHtml(p, p.invoices[1]);
        return document.getElementById('printArea').textContent;
      }
    """)
    assert "Sudah Ditagih Sebelumnya" in teks3b and "Rp 88.500.000" in teks3b, "termin terkirim (belum dibayar) tetap dikurangkan"
    assert "dibayar" not in teks3b.split("Sudah Ditagih Sebelumnya")[1][:60], "tidak ada porsi dibayar -> keterangan dibayar tidak tampil"
    # Sisa = 295 - 88.5 - 118 = 88.5jt; invoice addendum 20jt TIDAK boleh ikut mengurangi
    assert "Sisa Belum Ditagih Setelah Invoice Ini" in teks3b and teks3b.count("Rp 88.500.000") >= 2, teks3b.count("Rp 88.500.000")
    assert "Rp 108.500.000" not in teks3b and "Rp 68.500.000" not in teks3b, "addendum tidak boleh menggeser sisa kontrak"
    print("Skenario 3b (invoice terkirim belum dibayar tetap mengurangi sisa; invoice addendum tidak ikut hitungan kontrak) OK")

    # ===== 3c. PPh Final per tagihan + pembulatan sisa (Owner 9/10) =====
    st3c = page.evaluate("""
      () => {
        const pw = state.penawaran.find(x => x.id === 'pw-inv');
        pw.pph = 0.5;
        const p = state.proyek.find(x => x.id === 'pr-inv');
        const html = buildInvoicePrintHtml(p, p.invoices[1]);
        // Kasus Rp -1: invoice penutup yang sisa pembulatannya -1 harus tampil Rp 0
        const p2 = { id: 'pr-sisa', nama: 'KLA Mataram', klien: 'KLA', nilaiKontrak: 225764959, rencanaTermin: [],
          invoices: [
            { id: 'iv1', nomor: 'I1', tanggal: hariIniIso(), keterangan: 'T1-3', jumlah: 203188464, status: 'terkirim' },
            { id: 'iv2', nomor: 'I2', tanggal: hariIniIso(), keterangan: 'Termin 4', jumlah: 22576496, status: 'draft' }
          ] };
        const html2 = buildInvoicePrintHtml(p2, p2.invoices[1]);
        return { adaPph: html.includes('PPh Final (0.5%) sesuai 047/MC-PH/IX/2026'), nilaiPph: html.includes('Rp 1.500.000'),
                 infoTerakhir: html.includes('disetor sekali pada tagihan terakhir'),
                 sisaNol: html2.includes('Rp 0'), minusSatu: html2.includes('Rp -1'),
                 pphTerakhir: html2.includes('disetor pada tagihan terakhir INI') && html2.includes('Rp 1.128.825') };
      }
    """)
    # Revisi Owner: angka PPh diambil PERSIS dari penawaran (0,5% x subtotal
    # 300jt = Rp 1.500.000), bukan dihitung ulang dari nilai kontrak nego.
    assert st3c["adaPph"] and st3c["nilaiPph"], ("PPh harus persis angka penawaran: Rp 1.500.000 + nomor acuan", st3c)
    assert st3c["infoTerakhir"], ("di tagihan non-terakhir harus tertulis disetor sekali pada tagihan terakhir", st3c)
    assert st3c["sisaNol"] and not st3c["minusSatu"], ("sisa pembulatan -1 harus tampil Rp 0", st3c)
    assert st3c["pphTerakhir"], ("tanpa dokumen sumber: fallback 0,5% x kontrak, ditandai disetor di tagihan terakhir INI", st3c)
    print("Skenario 3c (PPh Final persis dari penawaran; disetor di tagihan terakhir; sisa -1 jadi Rp 0) OK")

    # ===== 4. Fallback proyek polos =====
    st4 = page.evaluate("""
      () => {
        const polos = { id: 'pr-polos', nama: 'Proyek Polos', klien: 'Klien X', nilaiKontrak: 0,
          invoices: [{ id: 'iv', nomor: 'INV-X', tanggal: hariIniIso(), keterangan: 'Tagihan jasa', jumlah: 500000, status: 'draft' }] };
        document.getElementById('printArea').innerHTML = buildInvoicePrintHtml(polos, polos.invoices[0]);
        const t = document.getElementById('printArea').textContent;
        return { tagihan: t.includes('Rp 500.000') && t.includes('Total Tagihan Ini'),
          tanpaTermin: !t.includes('Status Termin'), tanpaRincian: !t.includes('Rincian Nilai Kontrak') };
      }
    """)
    assert st4["tagihan"] and st4["tanpaTermin"] and st4["tanpaRincian"], st4
    # Tanpa nilai kontrak (proyek polos/maintenance) tidak ada dasar PPh
    # global -> baris PPh tidak tampil.
    st4b = page.evaluate("""
      () => {
        const polos = { id: 'pr-polos2', nama: 'Proyek Polos', klien: 'Klien X', nilaiKontrak: 0,
          invoices: [{ id: 'iv', nomor: 'INV-X', tanggal: hariIniIso(), keterangan: 'Tagihan jasa', jumlah: 500000, status: 'draft' }] };
        return !buildInvoicePrintHtml(polos, polos.invoices[0]).includes('PPh Final');
      }
    """)
    assert st4b, "tanpa nilai kontrak baris PPh global tidak boleh tampil"
    print("Skenario 4 (proyek tanpa termin/dokumen sumber: invoice tetap benar; tanpa kontrak = tanpa baris PPh) OK")

    js_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (6 skenario)")
    browser.close()
