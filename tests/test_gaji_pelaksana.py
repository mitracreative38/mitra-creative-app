from playwright.sync_api import sync_playwright

# Permintaan Owner (2026-09-13): skema gaji Pelaksana yang unik --
# gaji BULANAN, tapi tiap minggu menerima uang makan flat 300rb (berangkat
# atau tidak TETAP utuh), lembur dihitung flat 50rb per HARI yang ada
# lemburnya (bukan per jam), dan ada bonus yang diinput manual oleh Owner.
# Yang diuji:
# 1. Modal Karyawan (tipe Bulanan): field Uang Makan Mingguan & Lembur per
#    Hari tampil, tersimpan di karyawan + menumpang di jsonb pembayaranGaji
#    (jalur persist cloud tanpa kolom DB baru).
# 2. Preview Penggajian Sep 2026 (4 Sabtu): uang makan 4 x 300rb = 1.2jt,
#    lembur 3 hari x 50rb = 150rb, bonus manual 500rb -> upah kotor 4.85jt.
# 3. Simpan slip: komponen tersimpan di slip, transaksi Kas = 4.85jt.
# 4. Cetak slip menampilkan semua komponen skema.
# 5. Uang makan tetap utuh walau TIDAK ada absensi hadir sama sekali (flat).

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8937/index.html")
    page.wait_for_timeout(1200)

    page.evaluate("""
      () => {
        state.karyawan = []; state.kasUsaha.transactions = []; state.periodeTerkunci = null;
        saveState(); renderAll();
        showPage('karyawan');
        openKaryawanModal(null);
      }
    """)
    page.wait_for_timeout(300)

    # ===== 1. Field skema pelaksana di modal karyawan (tipe Bulanan) =====
    page.fill("#kym_nama", "Pelaksana Uji")
    page.fill("#kym_jabatan", "Pelaksana")
    page.select_option("#kym_tipeGaji", "Bulanan")
    page.wait_for_timeout(150)
    st1a = page.evaluate("""
      () => ({
        bulananTampil: document.getElementById('kym_bulananFields').style.display !== 'none',
        umAda: !!document.getElementById('kym_uangMakanMingguan'),
        lemburAda: !!document.getElementById('kym_lemburHarian')
      })
    """)
    assert st1a["bulananTampil"] and st1a["umAda"] and st1a["lemburAda"], st1a
    page.fill("#kym_gajiBulanan", "3.000.000")
    page.fill("#kym_uangMakanMingguan", "300.000")
    page.fill("#kym_lemburHarian", "50.000")
    page.evaluate("document.getElementById('karyawanForm').requestSubmit()")
    page.wait_for_timeout(400)
    st1b = page.evaluate("""
      () => {
        const k = state.karyawan[0];
        return { nama: k.nama, tipe: k.tipeGaji, gaji: k.gajiBulanan, um: k.uangMakanMingguan, lembur: k.lemburHarian,
          jsonbUm: (k.pembayaranGaji || {}).uangMakanMingguan, jsonbLembur: (k.pembayaranGaji || {}).lemburHarian };
      }
    """)
    assert st1b["tipe"] == "Bulanan" and st1b["gaji"] == 3000000, st1b
    assert st1b["um"] == 300000 and st1b["lembur"] == 50000, st1b
    assert st1b["jsonbUm"] == 300000 and st1b["jsonbLembur"] == 50000, f"tarif harus ikut jsonb pembayaran utk sinkron cloud: {st1b}"
    print("Skenario 1 (modal karyawan Bulanan: tarif uang makan mingguan & lembur/hari tersimpan + jalur cloud) OK")

    # ===== 2. Preview Penggajian: 4 minggu + 3 hari lembur + bonus manual =====
    page.evaluate("""
      () => {
        const k = state.karyawan[0];
        k.absensi = [
          { id: 'p1', tanggal: '2026-09-07', hadir: true, jamLembur: 2 },
          { id: 'p2', tanggal: '2026-09-08', hadir: true, jamLembur: 5 },
          { id: 'p3', tanggal: '2026-09-09', hadir: true, jamLembur: 0 },
          { id: 'p4', tanggal: '2026-09-10', hadir: false, jamLembur: 1 }
        ];
        saveState();
        showSubtab('ky', 'penggajian');
        document.getElementById('pg_karyawan').value = k.id;
        document.getElementById('pg_mulai').value = '2026-09-01';
        document.getElementById('pg_selesai').value = '2026-09-30';
        computePayrollFromAbsensi(true);
        document.getElementById('pg_bonusManual').value = '500.000';
        refreshPenggajianSummary();
      }
    """)
    page.wait_for_timeout(200)
    st2 = page.evaluate("""
      () => ({
        umLabel: document.getElementById('pg_umMingguanLabel').textContent,
        um: document.getElementById('pg_umMingguan').textContent,
        lemburLabel: document.getElementById('pg_lemburHarianLabel').textContent,
        lembur: document.getElementById('pg_lemburHarian').textContent,
        kotor: pgComputed.upahKotor,
        takeHome: document.getElementById('pg_gajiBersih').textContent
      })
    """)
    assert "4 minggu" in st2["umLabel"] and "1.200.000" in st2["um"], st2
    # 3 hari ada lembur (termasuk hari tidak hadir tapi lembur): p1, p2, p4
    assert "3 hari" in st2["lemburLabel"] and "150.000" in st2["lembur"], st2
    assert st2["kotor"] == 4850000, f"kotor = 3jt + um 1.2jt + lembur 150rb + bonus manual 500rb: {st2}"
    assert "4.850.000" in st2["takeHome"], st2
    print("Skenario 2 (preview: uang makan 4x300rb, lembur 3 hari x 50rb, bonus manual 500rb -> kotor 4.85jt) OK")

    # ===== 3. Simpan slip: komponen tersimpan + Kas 4.85jt =====
    page.click("#pg_simpanCetakBtn")
    page.wait_for_timeout(400)
    st3 = page.evaluate("""
      () => {
        const sl = state.karyawan[0].slipGaji[0];
        return { umTotal: sl.umMingguanTotal, umMinggu: sl.umMingguanMinggu, lemburHari: sl.lemburHari,
          lemburTotal: sl.lemburHarianTotal, bonusManual: sl.bonusManual, kotor: sl.upahKotor,
          kas: state.kasUsaha.transactions.filter(t => t.sumberSlipId === sl.id).reduce((s, t) => s + t.jumlah, 0) };
      }
    """)
    assert st3["umTotal"] == 1200000 and st3["umMinggu"] == 4, st3
    assert st3["lemburHari"] == 3 and st3["lemburTotal"] == 150000, st3
    assert st3["bonusManual"] == 500000 and st3["kotor"] == 4850000 and st3["kas"] == 4850000, st3
    print("Skenario 3 (slip tersimpan lengkap dengan komponen skema, transaksi Kas 4.85jt) OK")

    # ===== 4. Cetak slip menampilkan komponen =====
    st4 = page.evaluate("""
      () => {
        const k = state.karyawan[0];
        document.getElementById('printArea').innerHTML = buildSlipGajiPrintHtml(k, k.slipGaji[0]);
        const teks = document.getElementById('printArea').textContent;
        return { um: teks.includes('Uang Makan Mingguan') && teks.includes('4 minggu'),
          lembur: teks.includes('Lembur Harian') && teks.includes('3 hari'),
          bonus: teks.includes('Bonus dari pemilik') };
      }
    """)
    assert st4["um"] and st4["lembur"] and st4["bonus"], st4
    print("Skenario 4 (cetak slip menampilkan uang makan mingguan, lembur harian, dan bonus manual) OK")

    # ===== 5. Uang makan flat walau tidak pernah hadir =====
    st5 = page.evaluate("""
      () => {
        const k = state.karyawan[0];
        k.absensi = [];
        saveState();
        computePayrollFromAbsensi(true);
        refreshPenggajianSummary();
        return { um: document.getElementById('pg_umMingguan').textContent, kotor: pgComputed.upahKotor };
      }
    """)
    assert "1.200.000" in st5["um"], f"uang makan mingguan flat tidak boleh terpotong absen: {st5}"
    assert st5["kotor"] == 4200000, f"kotor tanpa lembur/bonus = 3jt + 1.2jt: {st5}"
    print("Skenario 5 (uang makan mingguan tetap utuh walau tidak ada absensi -- flat sesuai aturan Owner) OK")

    js_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (5 skenario)")
    browser.close()
