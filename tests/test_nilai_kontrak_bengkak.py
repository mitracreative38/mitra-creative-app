from playwright.sync_api import sync_playwright

# Laporan Owner (2026-10-09): nilai kontrak proyek KLA Bandung tiba-tiba
# jadi Rp 42.825.587.625 padahal aslinya Rp 428.255.876.
# Akar masalah: total penawaran bisa pecahan (PPh 0,5%), formatNumberInput
# lama memformat 428255876.25 -> "428.255.876,25", lalu parseNumberInput
# membuang SEMUA tanda baca sehingga digit desimal menempel -> 42825587625
# (100x) setiap kali modal Edit Info Proyek disimpan. Yang diuji:
# 1. Round-trip format->parse nilai pecahan tidak lagi membesar 100x.
# 2. parseNumberInput aman utk ketikan normal (ribuan "1.500" tetap 1500,
#    desimal ",25"/".5" dibuang, angka pecahan dibulatkan).
# 3. Penyembuhan otomatis: proyek korban bug (nilai kontrak ~100x total
#    termin, persen termin ~100%) dikembalikan ke nilai benar saat render.
# 4. Tanpa salah tangkap: proyek sehat & proyek besar tanpa termin tidak
#    disentuh.

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8939/index.html")
    page.wait_for_timeout(1200)

    # ===== 1. Round-trip bug KLA =====
    st1 = page.evaluate("""
      () => ({
        format: formatNumberInput(428255876.25),
        roundtrip: parseNumberInput(formatNumberInput(428255876.25))
      })
    """)
    assert st1["roundtrip"] == 428255876, st1
    assert "," not in st1["format"], f"format tidak boleh mengeluarkan desimal: {st1}"
    print("Skenario 1 (round-trip 428.255.876,25 tidak lagi membengkak jadi 42,8 miliar) OK")

    # ===== 2. parseNumberInput aman =====
    st2 = page.evaluate("""
      () => ({
        ribuan: parseNumberInput('428.255.876'),
        ribuanKecil: parseNumberInput('1.500'),
        desimalKoma: parseNumberInput('428.255.876,25'),
        desimalTitik: parseNumberInput('2.5'),
        angkaPecahan: parseNumberInput(150000.75),
        minus: parseNumberInput('-2.000'),
        kosong: parseNumberInput('')
      })
    """)
    assert st2 == {"ribuan": 428255876, "ribuanKecil": 1500, "desimalKoma": 428255876,
                   "desimalTitik": 2, "angkaPecahan": 150001, "minus": -2000, "kosong": 0}, st2
    print("Skenario 2 (parse: ribuan utuh, desimal dibuang, pecahan dibulatkan, minus aman) OK")

    # ===== 3. Penyembuhan proyek korban bug =====
    st3 = page.evaluate("""
      () => {
        state.proyek.push({ id: 'p-bengkak', nama: 'KLA Bandung (korban)', klien: 'KLA', status: 'berjalan',
          nilaiKontrak: 42825587625, tanggalMulai: hariIniIso(), invoices: [], bap: [], dokumen: [],
          karyawanIds: [], subkontraktor: [], belanjaMaterial: [],
          rencanaTermin: [
            { id: 't1', label: 'Termin 1', persen: 30, nilai: 128476763, tipe: 'normal' },
            { id: 't2', label: 'Termin 2', persen: 30, nilai: 128476763, tipe: 'normal' },
            { id: 't3', label: 'Termin 3', persen: 30, nilai: 128476763, tipe: 'normal' },
            { id: 't4', label: 'Termin 4', persen: 10, nilai: 42825588, tipe: 'retensi' }
          ] });
        saveState();
        healNilaiKontrakBengkak();
        return state.proyek.find(x => x.id === 'p-bengkak').nilaiKontrak;
      }
    """)
    assert st3 == 428255876, f"nilai kontrak korban bug harus kembali 428.255.876: {st3}"
    print("Skenario 3 (proyek korban bug otomatis sembuh: 42,8 miliar -> 428.255.876) OK")

    # ===== 4. Tanpa salah tangkap =====
    st4 = page.evaluate("""
      () => {
        state.proyek.push({ id: 'p-sehat', nama: 'Sehat', klien: '', status: 'berjalan',
          nilaiKontrak: 428255876, tanggalMulai: hariIniIso(), invoices: [],
          rencanaTermin: [
            { id: 's1', label: 'Termin 1', persen: 50, nilai: 214127938, tipe: 'normal' },
            { id: 's2', label: 'Termin 2', persen: 50, nilai: 214127938, tipe: 'normal' }
          ] });
        state.proyek.push({ id: 'p-besar', nama: 'Proyek Besar Asli', klien: '', status: 'berjalan',
          nilaiKontrak: 42825587625, tanggalMulai: hariIniIso(), invoices: [], rencanaTermin: [] });
        state.proyek.push({ id: 'p-dp', nama: 'Hanya DP 1%', klien: '', status: 'berjalan',
          nilaiKontrak: 100000000, tanggalMulai: hariIniIso(), invoices: [],
          rencanaTermin: [{ id: 'd1', label: 'DP', persen: 1, nilai: 1000000, tipe: 'normal' }] });
        saveState();
        healNilaiKontrakBengkak();
        return {
          sehat: state.proyek.find(x => x.id === 'p-sehat').nilaiKontrak,
          besar: state.proyek.find(x => x.id === 'p-besar').nilaiKontrak,
          dp: state.proyek.find(x => x.id === 'p-dp').nilaiKontrak
        };
      }
    """)
    assert st4 == {"sehat": 428255876, "besar": 42825587625, "dp": 100000000}, st4
    print("Skenario 4 (proyek sehat, proyek besar asli tanpa termin, dan termin parsial tidak disentuh) OK")

    js_errors = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (4 skenario)")
    browser.close()
