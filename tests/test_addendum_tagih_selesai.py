from playwright.sync_api import sync_playwright

# Laporan Owner (2026-09-30): "sistem untuk KLA computer biasanya dikerjakan
# dahulu baru dibayar ... kenapa penawaran addendum tidak muncul?".
# Akar masalah: tombol "Buat Penawaran Addendum" dulu hanya mengikutkan
# catatan berstatus "Rencana", padahal alur kerjakan-dulu-tagih-belakangan
# membuat semua catatan sudah Dikerjakan/Selesai. Kini anti-dobel dikunci ke
# TAUTAN penawaran (penawaranId), bukan status pekerjaan. Yang diuji:
# 1. Catatan Selesai/Dikerjakan/Rencana tanpa tautan -> semua ikut jadi SATU
#    Penawaran Addendum; status Selesai/Dikerjakan TIDAK ditimpa, hanya
#    Rencana yang naik jadi "penawaran"; catatan yang SUDAH tertaut dilewati.
# 2. Klik kedua kali -> alert anti-dobel, tidak ada penawaran baru.
# 3. Penawarannya dihapus (lepasKaitanPenawaranTerhapus) -> tautan lepas,
#    status Selesai tetap Selesai -> bisa dibuatkan penawaran lagi.
# 4. Tabel: baris tertaut menampilkan tombol "📄 <nomor>" (buka penawaran),
#    baris belum tertaut menampilkan tombol transfer per-baris.
# 5. Survey (Laporan Kerja): tindak lanjut "Dibuat Penawaran" berstatus
#    Selesai tanpa tautan juga bisa ditransfer massal; status tetap Selesai.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(f"{d.type}:{d.message[:200]}"), d.accept()))
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8939/index.html")
    page.wait_for_timeout(1200)

    page.evaluate("""
      () => {
        state.penawaran.push({ id: 'pw-lama', nomor: 'PH-LAMA', tanggal: hariIniIso(), kepada: 'KLA', klienId: '',
          alamatKlien: '', perihal: 'lama', kategori: KATEGORI_PEKERJAAN[0], status: 'terkirim',
          diskon: 0, ppn: 11, pph: 0.5, biayaLain: 0, items: [], syarat: '', penutup: '', ttdNama: '', ttdJabatan: '' });
        const proyek = { id: 'p-add', nama: 'KLA Computer', klien: 'KLA', klienId: '', nilaiKontrak: 0,
          tanggalMulai: hariIniIso(), status: 'berjalan', items: [], pekerjaanTambahan: [
            { id: 'ps-a', tanggal: hariIniIso(), sumber: 'Permintaan Klien', uraian: 'Pasang brankas kasir', ahspId: '',
              volume: 1, satuan: 'ls', hargaSatuan: 150000, status: 'selesai', catatan: '', penawaranId: '' },
            { id: 'ps-b', tanggal: hariIniIso(), sumber: 'Permintaan Klien', uraian: 'Waterproofing kamar mandi', ahspId: '',
              volume: 1, satuan: 'ls', hargaSatuan: 1120000, status: 'dikerjakan', catatan: '', penawaranId: '' },
            { id: 'ps-c', tanggal: hariIniIso(), sumber: 'Temuan Lapangan', uraian: 'Stiker meja', ahspId: '',
              volume: 5, satuan: 'unit', hargaSatuan: 275000, status: 'rencana', catatan: '', penawaranId: '' },
            { id: 'ps-d', tanggal: hariIniIso(), sumber: 'Permintaan Klien', uraian: 'Pintu (sudah ditagih)', ahspId: '',
              volume: 2, satuan: 'unit', hargaSatuan: 2500000, status: 'selesai', catatan: '', penawaranId: 'pw-lama' }
          ] };
        state.proyek.push(proyek);
        saveState();
        currentProyekId = 'p-add';
      }
    """)

    # ===== 1. Semua catatan tanpa tautan ikut; status kerja tidak ditimpa =====
    jumlah_pw_awal = page.evaluate("state.penawaran.length")
    dialogs.clear()
    page.evaluate("document.getElementById('ps_pwAddendumBtn').click()")
    page.wait_for_timeout(500)
    st1 = page.evaluate("""
      () => {
        const p = state.proyek.find(x => x.id === 'p-add');
        const pwBaru = state.penawaran[state.penawaran.length - 1];
        const by = id => p.pekerjaanTambahan.find(x => x.id === id);
        return {
          jumlahPw: state.penawaran.length,
          itemPw: pwBaru.items.map(i => i.uraian),
          perihal: pwBaru.perihal,
          a: { status: by('ps-a').status, tertaut: by('ps-a').penawaranId === pwBaru.id },
          b: { status: by('ps-b').status, tertaut: by('ps-b').penawaranId === pwBaru.id },
          c: { status: by('ps-c').status, tertaut: by('ps-c').penawaranId === pwBaru.id },
          d: { status: by('ps-d').status, penawaranId: by('ps-d').penawaranId },
          pwBaruId: pwBaru.id
        };
      }
    """)
    assert any(d.startswith("confirm:") and "3 catatan" in d for d in dialogs), dialogs
    assert st1["jumlahPw"] == jumlah_pw_awal + 1, st1
    assert len(st1["itemPw"]) == 3 and "Pintu (sudah ditagih)" not in st1["itemPw"], st1
    assert "Addendum" in st1["perihal"], st1
    assert st1["a"] == {"status": "selesai", "tertaut": True}, st1
    assert st1["b"] == {"status": "dikerjakan", "tertaut": True}, st1
    assert st1["c"] == {"status": "penawaran", "tertaut": True}, st1
    assert st1["d"] == {"status": "selesai", "penawaranId": "pw-lama"}, st1
    print("Skenario 1 (catatan Selesai/Dikerjakan ikut tertagih; status kerja tidak ditimpa; yang sudah tertaut dilewati) OK")

    # ===== 2. Klik kedua -> anti-dobel =====
    dialogs.clear()
    page.evaluate("document.getElementById('ps_pwAddendumBtn').click()")
    page.wait_for_timeout(300)
    assert any(d.startswith("alert:") and "SUDAH pernah dibuatkan penawaran" in d for d in dialogs), dialogs
    assert page.evaluate("state.penawaran.length") == jumlah_pw_awal + 1, "tidak boleh ada penawaran baru"
    print("Skenario 2 (klik kedua: alert anti-dobel, tidak ada dokumen dobel) OK")

    # ===== 3. Penawaran dihapus -> tautan lepas, bisa ditagihkan ulang =====
    st3 = page.evaluate("""
      (pwId) => {
        state.penawaran = state.penawaran.filter(x => x.id !== pwId);
        lepasKaitanPenawaranTerhapus(pwId);
        saveState();
        const p = state.proyek.find(x => x.id === 'p-add');
        const by = id => p.pekerjaanTambahan.find(x => x.id === id);
        return { a: by('ps-a'), c: by('ps-c') };
      }
    """, st1["pwBaruId"])
    assert st3["a"]["penawaranId"] == "" and st3["a"]["status"] == "selesai", st3
    assert st3["c"]["penawaranId"] == "" and st3["c"]["status"] == "rencana", st3
    dialogs.clear()
    page.evaluate("document.getElementById('ps_pwAddendumBtn').click()")
    page.wait_for_timeout(400)
    assert any(d.startswith("confirm:") and "3 catatan" in d for d in dialogs), dialogs
    print("Skenario 3 (penawaran dihapus -> tautan lepas bersih, catatan bisa ditagihkan ulang) OK")

    # ===== 4. Tabel: tombol buka penawaran utk baris tertaut =====
    html = page.evaluate("""
      () => {
        renderPekerjaanSusulan(state.proyek.find(x => x.id === 'p-add'));
        return document.querySelector('#pj_susulanTable tbody').innerHTML;
      }
    """)
    assert "data-goto-pw-susulan" in html, "tombol buka penawaran tertaut tidak ada"
    assert "PH-LAMA" in html, "nomor penawaran tertaut tidak tampil"
    assert 'data-pw-susulan="ps-d"' not in html, "baris tertaut tidak boleh punya tombol transfer lagi"
    print("Skenario 4 (tabel menampilkan '📄 <nomor>' pembuka penawaran utk baris yang sudah tertaut) OK")

    # ===== 5. Survey: tindak lanjut Selesai tanpa tautan tetap bisa ditransfer =====
    page.evaluate("""
      () => {
        state.laporanKerja = state.laporanKerja || [];
        state.laporanKerja.push({ id: 'lk-add', tanggal: hariIniIso(), jenis: JENIS_LAPORAN_KERJA[0],
          judul: 'Survey KLA', klienId: '', proyekId: '', petugas: '', catatan: '', foto: [], tindakLanjut: [
            { id: 'tl-a', uraian: 'Ganti plafon ruang kasir', ahspId: '', p: 0, l: 0, t: 0, volume: 2, satuan: 'm2',
              hargaSatuan: 90000, rencana: 'Dibuat Penawaran', status: 'selesai', catatan: '', penawaranId: '', foto: [], video: [] }
          ] });
        saveState();
        currentLaporanKerjaId = 'lk-add';
      }
    """)
    dialogs.clear()
    jumlah_pw = page.evaluate("state.penawaran.length")
    page.evaluate("document.getElementById('lkr_pwSemuaBtn').click()")
    page.wait_for_timeout(400)
    st5 = page.evaluate("""
      () => {
        const l = state.laporanKerja.find(x => x.id === 'lk-add');
        const tl = l.tindakLanjut[0];
        return { jumlahPw: state.penawaran.length, status: tl.status, tertaut: !!tl.penawaranId };
      }
    """)
    assert st5["jumlahPw"] == jumlah_pw + 1 and st5["status"] == "selesai" and st5["tertaut"], (st5, dialogs)
    print("Skenario 5 (survey: catatan Selesai 'Dibuat Penawaran' bisa ditransfer; status tetap Selesai) OK")

    js_errors = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (5 skenario)")
    browser.close()
