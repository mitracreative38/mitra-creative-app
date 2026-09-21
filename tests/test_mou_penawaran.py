from playwright.sync_api import sync_playwright

# Permintaan Owner (2026-09-21): setelah penawaran harga di-ACC klien,
# terbit MOU (Surat Perjanjian Kerjasama) dengan kop surat yang sama dengan
# penawaran -- meniru contoh MOU KLA Computer Purwokerto (para pihak, tabel
# pekerjaan & harga, fasilitas, termin ber-terbilang + rekening, penyelesaian
# masalah, force majeure, adendum, ttd dua pihak). Yang diuji:
# 1. Tombol MOU di editor penawaran ACC membuka modal dengan prefill cerdas
#    (nomor -PH -> -SPK, wakil & alamat dari data klien, fasilitas dari
#    kelompok item).
# 2. Penawaran BELUM di-ACC -> muncul konfirmasi dulu.
# 3. Simpan & Cetak: dokumen memuat kop perusahaan, tanggal terbilang, para
#    pihak, tabel item + spesifikasi + GRAND TOTAL, pasal V-VII, ttd 2 pihak.
# 4. Termin dari Skema Pembayaran penawaran (30/40/20/10) dengan nilai rupiah
#    + terbilang; total seluruh tahap = grand total persis (sisa pembulatan
#    di tahap terakhir).
# 5. Integrasi: penawaran yang sudah jadi proyek -> MOU tercatat di Dokumen
#    Proyek (jenis MOU/SPK); pw.mou ikut jalur mirror (penawaranToRow) dan
#    kembali utuh lewat rowToPenawaran.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8938/index.html")
    page.wait_for_timeout(1200)

    page.evaluate("""
      () => {
        state.klien = [{ id: 'kl-mou', nama: 'PT. KLA TEKNOLOGI INDONESIA', tahap: 'Deal/SPK',
          kontakNama: 'Nicholas Ferdinand', telepon: '085357628866', alamat: 'Ruko Mataram Plaza D8, Semarang',
          sumber: '', kontakList: [], riwayat: [] }];
        state.proyek = [{ id: 'pr-mou', nama: 'CCTV KLA', status: 'berjalan', nilaiKontrak: 3015000,
          tanggalMulai: hariIniIso(), biayaBahan: 0, biayaUpah: 0, biayaLain: 0, karyawanIds: [],
          subkontraktor: [], belanjaMaterial: [], dokumen: [] }];
        state.penawaran = [{ id: 'pw-mou', nomor: '047/MC-PH/IX/2026', tanggal: hariIniIso(),
          klienId: 'kl-mou', kepada: 'PT. KLA TEKNOLOGI INDONESIA', alamatKlien: '',
          perihal: 'Pekerjaan CCTV KLA Computer', kategori: KATEGORI_PEKERJAAN[0], status: 'disetujui',
          diskon: 0, ppn: 0, pph: 0.5, biayaLain: 0, proyekId: 'pr-mou',
          items: [
            { id: 'i1', uraian: 'IP Camera 4MP', spesifikasi: 'Hikvision DS-2CD2T46G2H', satuan: 'unit', volume: 2, hargaSatuan: 1000000, kelompok: 'BARANG' },
            { id: 'i2', uraian: 'Instalasi CCTV', spesifikasi: 'Termasuk kabel CAT6', satuan: 'titik', volume: 1, hargaSatuan: 1000000, kelompok: 'JASA' }
          ],
          skemaPembayaran: [
            { id: 's1', label: 'Tahap I', persen: 30, syarat: 'sebelum pekerjaan dimulai atau setelah MOU disepakati' },
            { id: 's2', label: 'Tahap II', persen: 40, syarat: 'saat akan dilakukan proses pemasangan di lokasi' },
            { id: 's3', label: 'Tahap III', persen: 20, syarat: 'setelah pekerjaan sudah diselesaikan' },
            { id: 's4', label: 'Tahap IV', persen: 10, syarat: 'maksimal 30 hari setelah pengecekan pekerjaan' }
          ],
          nego: [], syarat: '', penutup: '', ttdNama: state.ownerNama, ttdJabatan: state.ownerJabatan }];
        state.rekening = 'BCA 854-6013940 a.n. CV. MITRA CREATIVE';
        saveState(); renderAll();
        showPage('penawaran'); showPwEditor('pw-mou');
      }
    """)
    page.wait_for_timeout(400)

    # ===== 1. Tombol MOU -> modal prefill =====
    dialogs.clear()
    page.click("#pw_mouBtn")
    page.wait_for_timeout(300)
    st1 = page.evaluate("""
      () => ({
        open: document.getElementById('mouModal').classList.contains('open'),
        nomor: document.getElementById('mou_nomor').value,
        p1: document.getElementById('mou_pihak1Nama').value,
        p1a: document.getElementById('mou_pihak1Alamat').value,
        p2: document.getElementById('mou_pihak2Nama').value,
        rek: document.getElementById('mou_rekening').value,
        fasilitas: document.getElementById('mou_fasilitas').value
      })
    """)
    assert st1["open"] and st1["nomor"] == "047/MC-SPK/IX/2026", st1
    assert st1["p1"] == "Nicholas Ferdinand" and "Mataram Plaza" in st1["p1a"], st1
    assert st1["rek"].startswith("BCA") and "BARANG" in st1["fasilitas"] and "JASA" in st1["fasilitas"], st1
    assert not dialogs, f"penawaran ACC tidak boleh ada konfirmasi: {dialogs}"
    print("Skenario 1 (tombol MOU: modal terbuka, prefill nomor -SPK, wakil/alamat klien, rekening, fasilitas per kelompok) OK")

    # ===== 2. Penawaran belum ACC -> konfirmasi dulu =====
    page.evaluate("closeModals()")
    page.evaluate("""
      () => {
        state.penawaran[0].status = 'terkirim';
        renderPwEditor();
      }
    """)
    dialogs.clear()
    page.click("#pw_mouBtn")
    page.wait_for_timeout(300)
    assert any("belum Disetujui" in d for d in dialogs), dialogs
    assert page.evaluate("document.getElementById('mouModal').classList.contains('open')"), "setelah konfirmasi diterima, modal tetap terbuka"
    page.evaluate("closeModals(); state.penawaran[0].status = 'disetujui';")
    print("Skenario 2 (penawaran belum ACC: konfirmasi muncul dulu, boleh dilanjutkan sadar) OK")

    # ===== 3 & 4. Simpan & Cetak: isi dokumen + termin =====
    page.click("#pw_mouBtn")
    page.wait_for_timeout(300)
    page.fill("#mou_tanggal", "2026-09-21")
    page.fill("#mou_deadline", "2026-10-31")
    page.fill("#mou_pihak1Telepon", "085357628866")
    page.click("#mou_cetakBtn")
    page.wait_for_timeout(500)
    st3 = page.evaluate("""
      () => {
        const teks = document.getElementById('printArea').textContent;
        const html = document.getElementById('printArea').innerHTML;
        return {
          kop: html.includes('pwmc-header') && teks.includes(state.company || 'CV. Mitra Creative'),
          judul: teks.includes('SURAT PERJANJIAN KERJASAMA'),
          tglTerbilang: teks.includes('Dua puluh satu') && teks.includes('(21-09-2026)'),
          pihak: teks.includes('PIHAK PERTAMA') && teks.includes('PIHAK KEDUA') && teks.includes('Nicholas Ferdinand'),
          item: teks.includes('IP Camera 4MP') && teks.includes('Hikvision DS-2CD2T46G2H') && teks.includes('GRAND TOTAL'),
          pasal: teks.includes('Force Majeure') && teks.includes('Adendum') && teks.includes('Penyelesaian Masalah'),
          deadline: teks.includes('denda sebesar 1% per hari'),
          rekening: teks.includes('854-6013940'),
          mouTersimpan: !!state.penawaran[0].mou && state.penawaran[0].mou.nomor === '047/MC-SPK/IX/2026'
        };
      }
    """)
    for k, v in st3.items():
        assert v, f"{k} gagal: {st3}"
    print("Skenario 3 (cetak MOU: kop penawaran, tanggal terbilang, para pihak, tabel item, pasal V-VII, deadline+denda, rekening) OK")

    st4 = page.evaluate("""
      () => {
        const teks = document.getElementById('printArea').textContent;
        return {
          t1: teks.includes('Tahap I sebesar 30% atau senilai Rp 904.500'),
          t2: teks.includes('Tahap II sebesar 40% atau senilai Rp 1.206.000'),
          t3: teks.includes('Tahap III sebesar 20% atau senilai Rp 603.000'),
          t4: teks.includes('Tahap IV sebesar 10% atau senilai Rp 301.500'),
          terbilang: teks.includes('Sembilan ratus empat ribu lima ratus rupiah'),
          total: teks.includes('Rp 3.015.000')
        };
      }
    """)
    for k, v in st4.items():
        assert v, f"{k} gagal: {st4}"
    print("Skenario 4 (termin 30/40/20/10 dari skema: nilai + terbilang benar, jumlah 4 tahap = grand total 3.015.000) OK")

    # ===== 5. Integrasi dokumen proyek + jalur mirror =====
    st5 = page.evaluate("""
      () => {
        const pw = state.penawaran[0];
        const dok = (state.proyek[0].dokumen || []).find(d => /MOU/i.test(d.jenis));
        const row = penawaranToRow(pw);
        const balik = rowToPenawaran(row);
        return {
          dokAda: !!dok, dokNomor: dok && dok.nomor,
          rowPunyaMou: !!row.mou,
          balikMouNomor: balik.mou && balik.mou.nomor,
          tanpaMouTanpaKolom: !('mou' in penawaranToRow({ id: 'x', items: [] }))
        };
      }
    """)
    assert st5["dokAda"] and st5["dokNomor"] == "047/MC-SPK/IX/2026", st5
    assert st5["rowPunyaMou"] and st5["balikMouNomor"] == "047/MC-SPK/IX/2026", st5
    assert st5["tanpaMouTanpaKolom"], f"penawaran tanpa MOU tidak boleh mengirim kolom mou (degradasi pra-SQL fix56): {st5}"
    print("Skenario 5 (MOU tercatat di Dokumen Proyek + ikut jalur mirror cloud, kolom mou hanya dikirim bila ada) OK")

    js_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (5 skenario)")
    browser.close()
