from playwright.sync_api import sync_playwright

# Laporan Owner (2026-10-12): "di kas keluar perusahaan hanya uang bersih
# di slip gaji -- bon & uang makan tidak tercatat keluar di kas".
# Uang makan & bon di slip adalah uang TUNAI yang sudah diberikan harian
# (makanya jadi potongan gaji kotor saat gajian), jadi kas perusahaan juga
# keluar sebesar itu. Kini tiap slip mencerminkan DUA hal ke Kas:
# gaji bersih dibayarkan + transaksi "Uang makan & bon". Yang diuji:
# 1. syncSlipGajiKasTxn membuat txn gaji bersih + txn uang makan & bon
#    (total Kas = slipKasTotal); potongan pinjaman TIDAK jadi kas keluar.
# 2. Slip tanpa uang makan/bon: tidak ada txn tambahan (pelaksana bulanan
#    yang uang makannya sudah di dalam upah kotor tidak dobel).
# 3. Penyembuhan slip lama: txn uang makan & bon yang belum ada dibuat
#    otomatis saat renderAll; idempoten (tidak dobel saat diulang).
# 4. Alokasi proyek: uang makan & bon ikut terbagi per proyek sesuai
#    bobot hari absensi, totalnya persis.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8939/index.html")
    page.wait_for_timeout(1200)

    # ===== 1. Slip dengan uang makan + bon + potongan pinjaman =====
    st1 = page.evaluate("""
      () => {
        const k = { id: 'ky-um', nama: 'Darmuji', jabatan: 'Tukang', tipeGaji: 'Harian', aktif: true,
          upahHarian: 150000, tarifLembur: 0, uangMakanHarian: 20000, gajiBulanan: 0, targetBulanan: 0,
          persenBonus: 0, pinjamanAwal: 500000, absensi: [], pembinaan: [], biodata: {}, slipGaji: [] };
        state.karyawan.push(k);
        const sl = { id: 'sl-um1', mulai: '2026-10-04', selesai: '2026-10-10', upahKotor: 900000,
          uangMakan: 120000, bon: 50000, potonganPinjaman: 100000, defisitSebelum: 0 };
        k.slipGaji.push(sl);
        saveState();
        syncSlipGajiKasTxn(k, sl);
        const txns = state.kasUsaha.transactions.filter(t => t.sumberSlipId === 'sl-um1');
        return {
          n: txns.length,
          total: txns.reduce((s, t) => s + t.jumlah, 0),
          kasTotal: slipKasTotal(sl),
          dibayar: slipGajiDibayar(sl),
          gajiTxn: txns.find(t => t.keterangan.startsWith('Gaji')).jumlah,
          umTxn: (txns.find(t => t.keterangan.startsWith('Uang makan & bon')) || {}).jumlah
        };
      }
    """)
    # bersih = 900rb - 120rb - 50rb - 100rb = 630rb; um&bon = 170rb; kas total = 800rb
    assert st1["dibayar"] == 630000 and st1["umTxn"] == 170000 and st1["gajiTxn"] == 630000, st1
    assert st1["n"] == 2 and st1["total"] == 800000 and st1["total"] == st1["kasTotal"], st1
    assert st1["total"] != 900000, "potongan pinjaman 100rb TIDAK boleh ikut jadi kas keluar"
    print("Skenario 1 (Kas = gaji bersih 630rb + uang makan & bon 170rb = 800rb; potongan pinjaman tidak ikut) OK")

    # ===== 2. Slip tanpa uang makan/bon -> tanpa txn tambahan =====
    st2 = page.evaluate("""
      () => {
        const k = state.karyawan.find(x => x.id === 'ky-um');
        const sl = { id: 'sl-um2', mulai: '2026-10-11', selesai: '2026-10-17', upahKotor: 750000,
          uangMakan: 0, bon: 0, potonganPinjaman: 0, defisitSebelum: 0 };
        k.slipGaji.push(sl);
        saveState();
        syncSlipGajiKasTxn(k, sl);
        const txns = state.kasUsaha.transactions.filter(t => t.sumberSlipId === 'sl-um2');
        return { n: txns.length, total: txns.reduce((s, t) => s + t.jumlah, 0) };
      }
    """)
    assert st2 == {"n": 1, "total": 750000}, st2
    print("Skenario 2 (slip tanpa uang makan/bon: hanya txn gaji bersih, tidak ada txn tambahan) OK")

    # ===== 3. Penyembuhan slip lama + idempoten =====
    st3 = page.evaluate("""
      () => {
        // Simulasi slip lama: hapus txn 'Uang makan & bon' (dulu memang tidak pernah ada)
        state.kasUsaha.transactions = state.kasUsaha.transactions.filter(t =>
          !(t.sumberSlipId === 'sl-um1' && t.keterangan.startsWith('Uang makan & bon')));
        saveState();
        renderAll();
        const sesudah1 = state.kasUsaha.transactions.filter(t => t.sumberSlipId === 'sl-um1');
        renderAll(); // idempoten: jalan kedua tidak boleh menambah apa pun
        const sesudah2 = state.kasUsaha.transactions.filter(t => t.sumberSlipId === 'sl-um1');
        return { n1: sesudah1.length, total1: sesudah1.reduce((s, t) => s + t.jumlah, 0),
                 n2: sesudah2.length, total2: sesudah2.reduce((s, t) => s + t.jumlah, 0) };
      }
    """)
    assert st3 == {"n1": 2, "total1": 800000, "n2": 2, "total2": 800000}, st3
    print("Skenario 3 (slip lama otomatis disembuhkan saat render; pengulangan tidak membuat dobel) OK")

    # ===== 4. Alokasi per proyek ikut untuk uang makan & bon =====
    st4 = page.evaluate("""
      () => {
        state.proyek.push({ id: 'p-um-a', nama: 'Proyek A', klien: '', nilaiKontrak: 0, status: 'berjalan',
          tanggalMulai: hariIniIso(), invoices: [], rencanaTermin: [] });
        state.proyek.push({ id: 'p-um-b', nama: 'Proyek B', klien: '', nilaiKontrak: 0, status: 'berjalan',
          tanggalMulai: hariIniIso(), invoices: [], rencanaTermin: [] });
        const k = state.karyawan.find(x => x.id === 'ky-um');
        k.absensi = [
          { tanggal: '2026-10-19', hadir: true, proyekId: 'p-um-a' },
          { tanggal: '2026-10-20', hadir: true, proyekId: 'p-um-a' },
          { tanggal: '2026-10-21', hadir: true, proyekId: 'p-um-b' }
        ];
        const sl = { id: 'sl-um3', mulai: '2026-10-18', selesai: '2026-10-24', upahKotor: 450000,
          uangMakan: 60000, bon: 0, potonganPinjaman: 0, defisitSebelum: 0 };
        k.slipGaji.push(sl);
        saveState();
        syncSlipGajiKasTxn(k, sl);
        const txns = state.kasUsaha.transactions.filter(t => t.sumberSlipId === 'sl-um3');
        const um = txns.filter(t => t.keterangan.startsWith('Uang makan & bon'));
        return {
          umTotal: um.reduce((s, t) => s + t.jumlah, 0),
          umProyek: um.map(t => t.proyekId).sort(),
          totalSemua: txns.reduce((s, t) => s + t.jumlah, 0)
        };
      }
    """)
    assert st4["umTotal"] == 60000 and st4["umProyek"] == ["p-um-a", "p-um-b"], st4
    assert st4["totalSemua"] == 390000 + 60000, st4  # bersih 390rb + um 60rb
    print("Skenario 4 (uang makan & bon terbagi per proyek sesuai bobot hari, total persis) OK")

    js_errors = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (4 skenario)")
    browser.close()
