from playwright.sync_api import sync_playwright

# Permintaan Owner (2026-09-13): "ketika gaji yang diterima minus, tolong
# akumulasikan di minggu berikutnya" -- sebelumnya slip minus dicatat sebagai
# transaksi Kas NEGATIF dan tidak pernah dibawa ke periode berikutnya.
# Yang diuji:
# 1. Slip minggu 1 minus (1 hari hadir 100rb, uang makan 150rb): dibayarkan
#    Rp 0, transaksi Kas 0 (bukan -50rb), defisit 50rb tercatat.
# 2. Preview Penggajian minggu 2: baris "Defisit Periode Lalu" tampil dan
#    Take Home = gaji minggu 2 - defisit.
# 3. Simpan slip minggu 2 (2 hari, tanpa potongan): dibayarkan 150rb,
#    transaksi Kas 150rb, defisit lunas (0).
# 4. Koreksi slip minggu 1 lewat modal (uang makan turun jadi 50rb -> tidak
#    minus lagi): slip minggu 2 otomatis dibayar penuh 200rb, transaksi Kas
#    kedua slip ikut disamakan (propagasi rantai).
# 5. Penyembuhan data lama: slip minus peninggalan (transaksi Kas -30rb)
#    otomatis dibetulkan ke 0 saat slip baru dibuat, defisitnya dipotong di
#    slip baru itu.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8938/index.html")
    page.wait_for_timeout(1200)

    # Setup: 1 karyawan harian upah 100rb, absensi minggu 1 (1 hari) &
    # minggu 2 (2 hari). uangMakanHarian 0 supaya jatah mingguan otomatis 0
    # dan kita kontrol potongan lewat input manual.
    page.evaluate("""
      () => {
        state.kasUsaha.transactions = [];
        state.proyek = [];
        state.karyawan = [{ id: 'k-def', nama: 'Pekerja Defisit', jabatan: 'Tukang', aktif: true,
          tipeGaji: 'Harian', upahHarian: 100000, tarifLembur: 0, uangMakanHarian: 0,
          gajiBulanan: 0, targetBulanan: 0, persenBonus: 0, pinjamanAwal: 0,
          absensi: [
            { id: 'd1', tanggal: '2026-08-31', hadir: true, jamLembur: 0 },
            { id: 'd2', tanggal: '2026-09-07', hadir: true, jamLembur: 0 },
            { id: 'd3', tanggal: '2026-09-08', hadir: true, jamLembur: 0 }
          ], slipGaji: [], pembinaan: [] }];
        state.periodeTerkunci = null;
        saveState(); renderAll();
        showPage('karyawan'); showSubtab('ky', 'penggajian');
        document.getElementById('pg_karyawan').value = 'k-def';
        document.getElementById('pg_mulai').value = '2026-08-30';
        document.getElementById('pg_selesai').value = '2026-09-05';
        computePayrollFromAbsensi(true);
        document.getElementById('pg_uangMakan').value = '150.000';
        refreshPenggajianSummary();
      }
    """)
    page.wait_for_timeout(300)

    # ===== 1. Slip minggu 1 minus -> dibayar 0, Kas 0, defisit 50rb =====
    page.click("#pg_simpanCetakBtn")
    page.wait_for_timeout(400)
    st1 = page.evaluate("""
      () => {
        const k = state.karyawan[0];
        const sl = k.slipGaji[0];
        return {
          bersih: slipGajiBersih(sl), dibayar: slipGajiDibayar(sl), defisit: slipDefisitSesudah(sl),
          kas: state.kasUsaha.transactions.filter(t => t.sumberSlipId === sl.id).reduce((s, t) => s + t.jumlah, 0),
          adaTxn: state.kasUsaha.transactions.some(t => t.sumberSlipId === sl.id),
          adaMinus: state.kasUsaha.transactions.some(t => t.jumlah < 0)
        };
      }
    """)
    assert st1["bersih"] == -50000 and st1["dibayar"] == 0 and st1["defisit"] == 50000, st1
    assert st1["adaTxn"] and st1["kas"] == 0 and not st1["adaMinus"], f"Kas tidak boleh minus: {st1}"
    print("Skenario 1 (slip minus: dibayar Rp 0, Kas 0 bukan -50rb, defisit 50rb tercatat) OK")

    # ===== 2. Preview minggu 2 menampilkan potongan defisit =====
    page.evaluate("""
      () => {
        document.getElementById('pg_mulai').value = '2026-09-06';
        document.getElementById('pg_selesai').value = '2026-09-12';
        computePayrollFromAbsensi(true);
        document.getElementById('pg_uangMakan').value = '0';
        refreshPenggajianSummary();
      }
    """)
    page.wait_for_timeout(200)
    st2 = page.evaluate("""
      () => ({
        rowTampil: document.getElementById('pg_defisitRow').style.display !== 'none',
        defisitTeks: document.getElementById('pg_defisitLalu').textContent,
        takeHome: document.getElementById('pg_gajiBersih').textContent
      })
    """)
    assert st2["rowTampil"] and "50.000" in st2["defisitTeks"], st2
    assert "150.000" in st2["takeHome"], st2
    print("Skenario 2 (preview minggu 2: baris Defisit Periode Lalu 50rb, Take Home 150rb) OK")

    # ===== 3. Simpan slip minggu 2 -> defisit terpotong & lunas =====
    page.click("#pg_simpanCetakBtn")
    page.wait_for_timeout(400)
    st3 = page.evaluate("""
      () => {
        const k = state.karyawan[0];
        const sl2 = k.slipGaji[1];
        return {
          defisitSebelum: sl2.defisitSebelum, dibayar: slipGajiDibayar(sl2), sisaDefisit: slipDefisitSesudah(sl2),
          kas: state.kasUsaha.transactions.filter(t => t.sumberSlipId === sl2.id).reduce((s, t) => s + t.jumlah, 0)
        };
      }
    """)
    assert st3["defisitSebelum"] == 50000 and st3["dibayar"] == 150000 and st3["sisaDefisit"] == 0, st3
    assert st3["kas"] == 150000, st3
    print("Skenario 3 (slip minggu 2: dipotong defisit 50rb, dibayar & Kas 150rb, defisit lunas) OK")

    # ===== 4. Koreksi slip 1 -> slip 2 otomatis dibayar penuh (propagasi) =====
    page.evaluate("""
      () => {
        const k = state.karyawan[0];
        openSlipGajiEditModal(k.slipGaji[0]);
        document.getElementById('sge_uangMakan').value = '50.000';
      }
    """)
    page.wait_for_timeout(200)
    page.click("#slipGajiEditForm button[type=submit]")
    page.wait_for_timeout(400)
    st4 = page.evaluate("""
      () => {
        const k = state.karyawan[0];
        const sl1 = k.slipGaji[0], sl2 = k.slipGaji[1];
        return {
          s1Dibayar: slipGajiDibayar(sl1), s1Kas: state.kasUsaha.transactions.filter(t => t.sumberSlipId === sl1.id).reduce((s, t) => s + t.jumlah, 0),
          s2Dibayar: slipGajiDibayar(sl2), s2Kas: state.kasUsaha.transactions.filter(t => t.sumberSlipId === sl2.id).reduce((s, t) => s + t.jumlah, 0)
        };
      }
    """)
    assert st4["s1Dibayar"] == 50000 and st4["s1Kas"] == 50000, st4
    assert st4["s2Dibayar"] == 200000 and st4["s2Kas"] == 200000, f"slip 2 harus otomatis dibayar penuh setelah slip 1 tidak minus: {st4}"
    print("Skenario 4 (koreksi slip 1: defisit hilang -> slip 2 & transaksi Kas-nya otomatis disamakan) OK")

    # ===== 5. Data lama: transaksi minus peninggalan disembuhkan =====
    page.evaluate("""
      () => {
        state.karyawan.push({ id: 'k-lama', nama: 'Pekerja Lama', jabatan: 'Kenek', aktif: true,
          tipeGaji: 'Harian', upahHarian: 100000, tarifLembur: 0, uangMakanHarian: 0,
          gajiBulanan: 0, targetBulanan: 0, persenBonus: 0, pinjamanAwal: 0,
          absensi: [
            { id: 'l1', tanggal: '2026-09-07', hadir: true, jamLembur: 0 },
            { id: 'l2', tanggal: '2026-09-08', hadir: true, jamLembur: 0 }
          ],
          slipGaji: [{ id: 'sl-lama', mulai: '2026-08-23', selesai: '2026-08-29', namaKaryawan: 'Pekerja Lama',
            jabatan: 'Kenek', tipeGaji: 'Harian', hariHadir: 1, jamLembur: 0, upahHarian: 100000, tarifLembur: 0,
            totalUpahHarian: 100000, totalLembur: 0, upahKotor: 100000, uangMakan: 130000, bon: 0,
            potonganPinjaman: 0, sisaSebelum: 0, sisaSesudah: 0, pembayaran: { metode: 'Tunai' },
            tanggalDibuat: '2026-08-29' }], pembinaan: [] });
        // Transaksi Kas minus persis seperti perilaku lama sebelum fitur ini.
        state.kasUsaha.transactions.push({ id: 'txn-lama', sumberSlipId: 'sl-lama', proyekId: '', tipe: 'Keluar',
          status: 'lunas', tanggal: '2026-08-29', jumlah: -30000, kategori: 'Gaji Karyawan',
          keterangan: 'Gaji Pekerja Lama (lama, minus)' });
        saveState(); renderPenggajianPanel();
        document.getElementById('pg_karyawan').value = 'k-lama';
        document.getElementById('pg_mulai').value = '2026-09-06';
        document.getElementById('pg_selesai').value = '2026-09-12';
        computePayrollFromAbsensi(true);
        document.getElementById('pg_uangMakan').value = '0';
        refreshPenggajianSummary();
      }
    """)
    page.wait_for_timeout(200)
    page.click("#pg_simpanCetakBtn")
    page.wait_for_timeout(400)
    st5 = page.evaluate("""
      () => {
        const k = state.karyawan.find(x => x.id === 'k-lama');
        const baru = k.slipGaji.find(s => s.id !== 'sl-lama');
        return {
          kasLama: state.kasUsaha.transactions.filter(t => t.sumberSlipId === 'sl-lama').reduce((s, t) => s + t.jumlah, 0),
          baruDefisit: baru.defisitSebelum, baruDibayar: slipGajiDibayar(baru),
          kasBaru: state.kasUsaha.transactions.filter(t => t.sumberSlipId === baru.id).reduce((s, t) => s + t.jumlah, 0),
          masihAdaMinus: state.kasUsaha.transactions.some(t => t.jumlah < 0)
        };
      }
    """)
    assert st5["kasLama"] == 0, f"transaksi minus lama harus dibetulkan ke 0: {st5}"
    assert st5["baruDefisit"] == 30000 and st5["baruDibayar"] == 170000 and st5["kasBaru"] == 170000, st5
    assert not st5["masihAdaMinus"], st5
    print("Skenario 5 (transaksi gaji minus peninggalan dibetulkan ke 0, defisit 30rb dipotong di slip baru) OK")

    js_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (5 skenario)")
    browser.close()
