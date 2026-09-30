from playwright.sync_api import sync_playwright

# Aturan Owner (30/9, kasus KLA Computer "dikerjakan dahulu baru dibayar"):
# - PENAWARAN Addendum hanya untuk catatan BELUM dikerjakan (status
#   "Rencana") -- minta persetujuan klien dulu.
# - Pekerjaan yang SUDAH Dikerjakan/Selesai langsung dibuatkan INVOICE
#   Addendum (tagihan dengan rincian item), bukan surat penawaran.
# Anti-dobel: tautan penawaranId / invoiceId (dicek ke invoice yang masih
# ada). Yang diuji:
# 1. Tombol "Buat Penawaran Addendum" hanya mengikutkan catatan Rencana.
# 2. Tombol "Buat Invoice Addendum" menggabungkan catatan Dikerjakan+
#    Selesai yang belum ditagihkan jadi SATU invoice (rincian item, total
#    benar, status pekerjaan tidak berubah); yang tertaut penawaran dilewati.
# 3. Klik kedua -> alert anti-dobel, tidak ada invoice baru.
# 4. Cetakan invoice addendum: tabel rincian item + rekening, TANPA bagian
#    nilai kontrak/status termin (tagihan terpisah dari kontrak).
# 5. Invoice terhapus -> tautan buntu tidak mengunci: catatan bisa
#    ditagihkan ulang.
# 6. Tabel susulan: 📄 hanya di baris Rencana, 🧾 di baris Dikerjakan/
#    Selesai yang belum ditagih, badge "🧾 <nomor>" di baris tertaut.
# 7. Survey: transfer massal kembali hanya utk status Rencana (yang sudah
#    dikerjakan diarahkan ke Invoice Addendum).

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(f"{d.type}:{d.message[:350]}"), d.accept()))
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8939/index.html")
    page.wait_for_timeout(1200)

    page.evaluate("""
      () => {
        state.penawaran.push({ id: 'pw-lama', nomor: 'PH-LAMA', tanggal: hariIniIso(), kepada: 'KLA', klienId: '',
          alamatKlien: '', perihal: 'lama', kategori: KATEGORI_PEKERJAAN[0], status: 'terkirim',
          diskon: 0, ppn: 11, pph: 0.5, biayaLain: 0, items: [], syarat: '', penutup: '', ttdNama: '', ttdJabatan: '' });
        const proyek = { id: 'p-add', nama: 'KLA Computer', klien: 'KLA', klienId: '', lokasi: 'Tasikmalaya',
          nilaiKontrak: 0, tanggalMulai: hariIniIso(), status: 'berjalan', items: [], rencanaTermin: [],
          invoices: [], bap: [], dokumen: [], pekerjaanTambahan: [
            { id: 'ps-a', tanggal: hariIniIso(), sumber: 'Permintaan Klien', uraian: 'Pasang brankas kasir', ahspId: '',
              volume: 1, satuan: 'ls', hargaSatuan: 150000, status: 'selesai', catatan: '', penawaranId: '' },
            { id: 'ps-b', tanggal: hariIniIso(), sumber: 'Permintaan Klien', uraian: 'Waterproofing kamar mandi', ahspId: '',
              volume: 1, satuan: 'ls', hargaSatuan: 1120000, status: 'dikerjakan', catatan: '', penawaranId: '' },
            { id: 'ps-c', tanggal: hariIniIso(), sumber: 'Temuan Lapangan', uraian: 'Stiker meja', ahspId: '',
              volume: 5, satuan: 'unit', hargaSatuan: 275000, status: 'rencana', catatan: '', penawaranId: '' },
            { id: 'ps-d', tanggal: hariIniIso(), sumber: 'Permintaan Klien', uraian: 'Pintu (lewat penawaran)', ahspId: '',
              volume: 2, satuan: 'unit', hargaSatuan: 2500000, status: 'selesai', catatan: '', penawaranId: 'pw-lama' }
          ] };
        state.proyek.push(proyek);
        saveState();
        currentProyekId = 'p-add';
      }
    """)

    # ===== 1. Penawaran Addendum: hanya catatan Rencana =====
    jumlah_pw_awal = page.evaluate("state.penawaran.length")
    dialogs.clear()
    page.evaluate("document.getElementById('ps_pwAddendumBtn').click()")
    page.wait_for_timeout(400)
    st1 = page.evaluate("""
      () => {
        const p = state.proyek.find(x => x.id === 'p-add');
        const pwBaru = state.penawaran[state.penawaran.length - 1];
        const by = id => p.pekerjaanTambahan.find(x => x.id === id);
        return { jumlahPw: state.penawaran.length, itemPw: pwBaru.items.map(i => i.uraian),
                 a: by('ps-a'), b: by('ps-b'), c: by('ps-c') };
      }
    """)
    assert any(d.startswith("confirm:") and "1 catatan" in d for d in dialogs), dialogs
    assert st1["jumlahPw"] == jumlah_pw_awal + 1 and st1["itemPw"] == ["Stiker meja"], st1
    assert st1["c"]["status"] == "penawaran" and st1["c"]["penawaranId"], st1
    assert not st1["a"]["penawaranId"] and not st1["b"]["penawaranId"], "catatan selesai/dikerjakan tidak boleh masuk penawaran"
    print("Skenario 1 (Penawaran Addendum hanya berisi catatan Rencana; yang sudah dikerjakan tidak ikut) OK")

    # ===== 2. Invoice Addendum: catatan Dikerjakan+Selesai belum ditagih =====
    dialogs.clear()
    page.evaluate("document.getElementById('ps_invAddendumBtn').click()")
    page.wait_for_timeout(500)
    st2 = page.evaluate("""
      () => {
        const p = state.proyek.find(x => x.id === 'p-add');
        const inv = p.invoices[p.invoices.length - 1];
        const by = id => p.pekerjaanTambahan.find(x => x.id === id);
        return { jumlahInv: p.invoices.length, inv,
                 a: by('ps-a'), b: by('ps-b'), d: by('ps-d') };
      }
    """)
    assert any(d.startswith("confirm:") and "2 pekerjaan" in d for d in dialogs), dialogs
    assert st2["jumlahInv"] == 1, st2
    assert st2["inv"]["jumlah"] == 150000 + 1120000, st2["inv"]
    assert len(st2["inv"]["addendumItems"]) == 2, st2["inv"]
    assert st2["a"]["invoiceId"] == st2["inv"]["id"] and st2["a"]["status"] == "selesai", st2
    assert st2["b"]["invoiceId"] == st2["inv"]["id"] and st2["b"]["status"] == "dikerjakan", st2
    assert not st2["d"].get("invoiceId"), "catatan yang tertaut penawaran tidak boleh ikut invoice"
    print("Skenario 2 (Invoice Addendum berisi pekerjaan Dikerjakan+Selesai; total & tautan benar; status tidak berubah) OK")

    # ===== 3. Klik kedua -> anti-dobel =====
    dialogs.clear()
    page.evaluate("document.getElementById('ps_invAddendumBtn').click()")
    page.wait_for_timeout(300)
    assert any(d.startswith("alert:") and "siap ditagihkan" in d for d in dialogs), dialogs
    assert page.evaluate("state.proyek.find(x => x.id === 'p-add').invoices.length") == 1, "tidak boleh ada invoice dobel"
    print("Skenario 3 (klik kedua: alert anti-dobel, tidak ada invoice dobel) OK")

    # ===== 4. Cetakan invoice addendum =====
    html = page.evaluate("""
      () => {
        const p = state.proyek.find(x => x.id === 'p-add');
        return buildInvoicePrintHtml(p, p.invoices[0]);
      }
    """)
    assert "Rincian Pekerjaan Tambahan" in html and "Pasang brankas kasir" in html and "Waterproofing kamar mandi" in html, "rincian item tidak tercetak"
    assert "854-6013940" in html, "rekening tidak tercetak"
    assert "Status Termin" not in html and "Nilai Kontrak" not in html, "bagian kontrak/termin tidak boleh ikut di invoice addendum"
    assert "terpisah dari nilai kontrak" in html, html[:300]
    print("Skenario 4 (cetakan invoice addendum: tabel rincian + rekening, tanpa bagian kontrak/termin) OK")

    # ===== 5. Invoice terhapus -> bisa ditagihkan ulang =====
    dialogs.clear()
    page.evaluate("""
      () => {
        const p = state.proyek.find(x => x.id === 'p-add');
        p.invoices = [];  // simulasi invoice dihapus, tautan catatan sengaja dibiarkan buntu (data lama)
        saveState();
        document.getElementById('ps_invAddendumBtn').click();
      }
    """)
    page.wait_for_timeout(400)
    assert any(d.startswith("confirm:") and "2 pekerjaan" in d for d in dialogs), dialogs
    assert page.evaluate("state.proyek.find(x => x.id === 'p-add').invoices.length") == 1, "invoice ulang tidak terbuat"
    print("Skenario 5 (invoice terhapus: tautan buntu tidak mengunci, pekerjaan bisa ditagihkan ulang) OK")

    # ===== 6. Tabel: tombol per-baris sesuai status =====
    html = page.evaluate("""
      () => {
        const p = state.proyek.find(x => x.id === 'p-add');
        p.pekerjaanTambahan.push({ id: 'ps-e', tanggal: hariIniIso(), sumber: 'Permintaan Klien',
          uraian: 'Servis pintu folding', ahspId: '', volume: 2, satuan: 'unit', hargaSatuan: 2000000,
          status: 'selesai', catatan: '', penawaranId: '', invoiceId: '' });
        renderPekerjaanSusulan(p);
        return document.querySelector('#pj_susulanTable tbody').innerHTML;
      }
    """)
    assert 'data-inv-susulan="ps-e"' in html, "baris Selesai belum ditagih harus punya tombol 🧾"
    assert 'data-pw-susulan="ps-e"' not in html, "baris Selesai tidak boleh punya tombol transfer penawaran"
    assert "data-goto-inv-susulan" in html, "baris tertaut invoice harus punya badge pembuka invoice"
    assert 'data-inv-susulan="ps-a"' not in html, "baris yang sudah ditagih tidak boleh punya tombol 🧾 lagi"
    print("Skenario 6 (tabel: 📄 hanya utk Rencana, 🧾 utk Selesai belum ditagih, badge nomor invoice utk yang tertaut) OK")

    # ===== 7. Survey: massal hanya status Rencana =====
    page.evaluate("""
      () => {
        state.laporanKerja = state.laporanKerja || [];
        state.laporanKerja.push({ id: 'lk-add', tanggal: hariIniIso(), jenis: JENIS_LAPORAN_KERJA[0],
          judul: 'Survey KLA', klienId: '', proyekId: '', petugas: '', catatan: '', foto: [], tindakLanjut: [
            { id: 'tl-a', uraian: 'Ganti plafon (sudah selesai)', ahspId: '', p: 0, l: 0, t: 0, volume: 2, satuan: 'm2',
              hargaSatuan: 90000, rencana: 'Dibuat Penawaran', status: 'selesai', catatan: '', penawaranId: '', foto: [], video: [] }
          ] });
        saveState();
        currentLaporanKerjaId = 'lk-add';
      }
    """)
    dialogs.clear()
    jumlah_pw = page.evaluate("state.penawaran.length")
    page.evaluate("document.getElementById('lkr_pwSemuaBtn').click()")
    page.wait_for_timeout(300)
    assert any(d.startswith("alert:") and "Invoice Addendum" in d for d in dialogs), dialogs
    assert page.evaluate("state.penawaran.length") == jumlah_pw, "catatan survey selesai tidak boleh jadi penawaran"
    dialogs.clear()
    page.evaluate("""
      () => {
        const l = state.laporanKerja.find(x => x.id === 'lk-add');
        l.tindakLanjut[0].status = 'rencana';
        document.getElementById('lkr_pwSemuaBtn').click();
      }
    """)
    page.wait_for_timeout(400)
    assert page.evaluate("state.penawaran.length") == jumlah_pw + 1, (dialogs, "catatan survey Rencana harus bisa jadi penawaran")
    print("Skenario 7 (survey: massal hanya status Rencana; yang selesai diarahkan ke Invoice Addendum) OK")

    js_errors = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (7 skenario)")
    browser.close()
