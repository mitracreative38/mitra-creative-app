from playwright.sync_api import sync_playwright

# Dua laporan Owner (2026-09-11):
# A. "Absensi dulu pernah ada yang masuk setengah hari kerja, kenapa hilang?"
#    -> fitur setengah hari ternyata belum pernah ada di kode; dibuat sekarang
#    dan diintegrasikan ke SEMUA hitungan hari hadir. Yang diuji:
#    1. Kolom Hadir punya dropdown Penuh/"1/2 Hari"; simpan -> record
#       absensi menyimpan setengahHari, dan muncul lagi saat panel dimuat ulang.
#    2. Penggajian "Hitung dari Absensi": 2 hari penuh + 1 setengah hari =
#       2.5 hari x upah harian.
#    3. Rekap Absensi Bulanan: tanda "1/2" di grid + total Hadir 2.5.
#    4. Alokasi upah slip per proyek berbobot porsi (proyek B cuma 1/2 hari
#       -> dapat 1/5 dari gaji, bukan 1/3).
# B. "Print PDF penawaran: spesifikasi tidak masuk" -> createPenawaranFromRab
#    membuang field spesifikasi & kelompok saat RAB dijadikan Penawaran.
#    5. Buat Penawaran dari RAB: spesifikasi & kelompok ikut tersalin dan
#       tampil di editor Penawaran.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8937/index.html")
    page.wait_for_timeout(1200)

    # Setup deterministik: 1 karyawan harian + 2 proyek.
    page.evaluate("""
      () => {
        state.karyawan = [{ id: 'k-uji', nama: 'Pekerja Uji', jabatan: 'Tukang', aktif: true,
          tipeGaji: 'Harian', upahHarian: 100000, tarifLembur: 0, uangMakanHarian: 0,
          gajiBulanan: 0, targetBulanan: 0, persenBonus: 0, pinjamanAwal: 0,
          absensi: [], slipGaji: [], pembinaan: [] }];
        state.proyek = [
          { id: 'pr-a', nama: 'Proyek A', status: 'berjalan', nilaiKontrak: 1, tanggalMulai: hariIniIso(),
            biayaBahan: 0, biayaUpah: 0, biayaLain: 0, karyawanIds: [], subkontraktor: [], belanjaMaterial: [], dokumen: [] },
          { id: 'pr-b', nama: 'Proyek B', status: 'berjalan', nilaiKontrak: 1, tanggalMulai: hariIniIso(),
            biayaBahan: 0, biayaUpah: 0, biayaLain: 0, karyawanIds: [], subkontraktor: [], belanjaMaterial: [], dokumen: [] }
        ];
        saveState(); renderAll();
        showPage('karyawan');
        showSubtab('ky', 'absensi');
        document.getElementById('ab_tanggal').value = '2026-09-07';
        renderAbsensiPanel();
      }
    """)
    page.wait_for_timeout(400)

    # ===== 1. Dropdown porsi di panel + simpan setengah hari =====
    st1a = page.evaluate("""
      () => {
        const tr = document.querySelector("#ab_table tbody tr[data-karyawan-id='k-uji']");
        const porsi = tr.querySelector('.ab-porsi');
        return { ada: !!porsi, aktif: !porsi.disabled, nilaiAwal: porsi.value };
      }
    """)
    assert st1a["ada"] and st1a["aktif"] and st1a["nilaiAwal"] == "1", st1a
    page.evaluate("""
      () => {
        const tr = document.querySelector("#ab_table tbody tr[data-karyawan-id='k-uji']");
        tr.querySelector('.ab-porsi').value = '0.5';
      }
    """)
    page.click("#ab_saveBtn")
    page.wait_for_timeout(400)
    st1b = page.evaluate("""
      () => {
        const rec = state.karyawan[0].absensi.find(a => a.tanggal === '2026-09-07');
        renderAbsensiPanel(); // muat ulang panel: pilihan harus kembali "0.5"
        const tr = document.querySelector("#ab_table tbody tr[data-karyawan-id='k-uji']");
        return { hadir: rec.hadir, setengah: rec.setengahHari, ulang: tr.querySelector('.ab-porsi').value };
      }
    """)
    assert st1b["hadir"] and st1b["setengah"] is True and st1b["ulang"] == "0.5", st1b
    # Tidak hadir -> dropdown porsi nonaktif.
    st1c = page.evaluate("""
      () => {
        const tr = document.querySelector("#ab_table tbody tr[data-karyawan-id='k-uji']");
        const cb = tr.querySelector('.ab-hadir');
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        const off = tr.querySelector('.ab-porsi').disabled;
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        return { off, on: !tr.querySelector('.ab-porsi').disabled };
      }
    """)
    assert st1c["off"] and st1c["on"], st1c
    print("Skenario 1 (dropdown Penuh/setengah hari di Absensi: tersimpan, dimuat ulang, nonaktif saat tidak hadir) OK")

    # ===== 2. Penggajian: 2 hari penuh + 1 setengah = 2.5 hari upah =====
    page.evaluate("""
      () => {
        const k = state.karyawan[0];
        k.absensi = [
          { id: 'a1', tanggal: '2026-09-07', hadir: true, setengahHari: true, jamLembur: 0, proyekId: 'pr-b' },
          { id: 'a2', tanggal: '2026-09-08', hadir: true, jamLembur: 0, proyekId: 'pr-a' },
          { id: 'a3', tanggal: '2026-09-09', hadir: true, setengahHari: false, jamLembur: 0, proyekId: 'pr-a' },
          { id: 'a4', tanggal: '2026-09-10', hadir: false, jamLembur: 0 }
        ];
        saveState();
        renderPenggajianPanel();
        document.getElementById('pg_karyawan').value = 'k-uji';
        document.getElementById('pg_mulai').value = '2026-09-06';
        document.getElementById('pg_selesai').value = '2026-09-12';
        computePayrollFromAbsensi(true);
      }
    """)
    page.wait_for_timeout(200)
    st2 = page.evaluate("""
      () => ({
        hari: pgComputed.hariHadir,
        upah: pgComputed.totalUpahHarian,
        tampil: document.getElementById('pg_hariHadir').textContent
      })
    """)
    assert st2["hari"] == 2.5 and st2["upah"] == 250000, st2
    assert "2.5" in st2["tampil"], st2
    print("Skenario 2 (Penggajian: 2 hari penuh + 1 setengah hari = 2.5 hari x 100rb = 250rb) OK")

    # ===== 3. Rekap bulanan: tanda 1/2 + total 2.5; slip massal ikut 2.5 =====
    st3 = page.evaluate("""
      () => {
        const r = rekapBulanData('2026-09').rows.find(x => x.nama === 'Pekerja Uji');
        const slip = hitungSlipHarianDariAbsensi(state.karyawan[0], '2026-09-06', '2026-09-12');
        return { hadir: r.hadir, tanda7: r.days[6], tanda8: r.days[7], slipHari: slip.hariHadir, slipUpah: slip.totalUpahHarian };
      }
    """)
    assert st3["hadir"] == 2.5 and st3["tanda7"] == "½" and st3["tanda8"] == "✓", st3
    assert st3["slipHari"] == 2.5 and st3["slipUpah"] == 250000, st3
    print("Skenario 3 (Rekap bulanan bertanda 1/2 & total 2.5; rumus slip massal sama persis) OK")

    # ===== 4. Alokasi upah per proyek berbobot porsi =====
    st4 = page.evaluate("""
      () => alokasiSlipPerProyek(state.karyawan[0], {
        mulai: '2026-09-06', selesai: '2026-09-12',
        tipeGaji: 'Harian', upahKotor: 250000, uangMakan: 0, bon: 0, potonganPinjaman: 0
      })
    """)
    byId = {r["proyekId"]: r for r in st4}
    assert byId["pr-a"]["jumlah"] == 200000 and byId["pr-a"]["hari"] == 2, st4
    assert byId["pr-b"]["jumlah"] == 50000 and byId["pr-b"]["hari"] == 0.5, st4
    assert sum(r["jumlah"] for r in st4) == 250000, st4
    print("Skenario 4 (alokasi upah ke Margin Proyek: A 2 hari = 200rb, B setengah hari = 50rb) OK")

    # ===== 5. Buat Penawaran dari RAB: spesifikasi & kelompok ikut =====
    st5 = page.evaluate("""
      () => {
        const rab = { id: 'rab-spek', nomor: 'RAB-SPEK', nama: 'CCTV Uji', klien: 'PT Uji', klienId: '', lokasi: '',
          kategori: KATEGORI_PEKERJAAN[0], tanggal: hariIniIso(), ppn: 0, pph: 0.5, biayaLain: 0, skemaPembayaran: [],
          items: [{ id: 'it1', uraian: 'IP Camera 4MP', spesifikasi: 'Hikvision DS-2CD2T46G2H-ISU/SL, PoE, IR 60m',
                    satuan: 'unit', volume: 3, hargaSatuan: 4500000, ahspId: '', kelompok: 'Material' }] };
        state.proyekRab.push(rab);
        const pw = createPenawaranFromRab(rab);
        state.penawaran.push(pw);
        saveState();
        showPage('penawaran'); showPwEditor(pw.id);
        const it = pw.items[0];
        return {
          spesifikasi: it.spesifikasi, kelompok: it.kelompok,
          diEditor: document.getElementById('pw_itemsTable').textContent.includes('Hikvision DS-2CD2T46G2H')
        };
      }
    """)
    assert st5["spesifikasi"].startswith("Hikvision") and st5["kelompok"] == "Material", st5
    assert st5["diEditor"], "spesifikasi harus tampil di editor Penawaran hasil 'Buat Penawaran' dari RAB"
    print("Skenario 5 (Buat Penawaran dari RAB: spesifikasi & kelompok tersalin -> kolom Spesifikasi PDF tidak lagi '-') OK")

    js_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (5 skenario)")
    browser.close()
