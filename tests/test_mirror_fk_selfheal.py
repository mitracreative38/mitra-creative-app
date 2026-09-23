from playwright.sync_api import sync_playwright

# Kasus Owner (2026-09-23): 2 proyek KLA Bandung tidak pernah muncul di
# perangkat Admin. Akar masalah: upsert mirror proyek ditolak PERMANEN oleh
# foreign key klien_id (baris kliennya belum ada di cloud), antrean pending
# mencoba ulang tapi selalu ditolak lagi -> proyek "hidup hanya di perangkat
# pembuatnya". Fitur baru: penyembuhan FK saat mirror (upsertDenganInduk) --
# induk (klien/proyek) dikirim dulu, lalu diulang; induk yatim -> tautan
# di-null-kan supaya datanya tetap sampai ke semua perangkat.
# Mock Supabase di tes ini menegakkan FK persis seperti database asli.

MOCK_SB = """
window.__store = { klien: [], proyek: [], rab: [], penawaran: [], kas_usaha_transaksi: [] };
window.__fkRules = {
  proyek: [{ col: 'klien_id', parent: 'klien', name: 'proyek_klien_id_fkey' }],
  rab: [{ col: 'klien_id', parent: 'klien', name: 'rab_klien_id_fkey' }],
  penawaran: [{ col: 'klien_id', parent: 'klien', name: 'penawaran_klien_id_fkey' }],
  kas_usaha_transaksi: [
    { col: 'proyek_id', parent: 'proyek', name: 'kas_usaha_transaksi_proyek_id_fkey' },
    { col: 'klien_id', parent: 'klien', name: 'kas_usaha_transaksi_klien_id_fkey' }]
};
window.__mockSb = {
  from(table) {
    return {
      upsert: async (row) => {
        for (const r of (window.__fkRules[table] || [])) {
          if (row[r.col] && !(window.__store[r.parent] || []).some(x => x.id === row[r.col])) {
            return { error: { code: '23503', message: 'insert or update on table "' + table + '" violates foreign key constraint "' + r.name + '"' } };
          }
        }
        const list = window.__store[table] = window.__store[table] || [];
        const i = list.findIndex(x => x.id === row.id);
        if (i >= 0) list[i] = row; else list.push(row);
        return { error: null };
      }
    };
  }
};
"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.add_init_script(MOCK_SB)
    page.goto("http://localhost:8938/index.html")
    page.wait_for_timeout(1200)

    page.evaluate("""
      () => {
        sb = window.__mockSb;
        targetCompanyId = 'comp-uji';
        state.klien.push({ id: 'kl-kla', nama: 'PT. KLA Teknologi Indonesia', tahap: 'Deal/SPK',
          kontakNama: '', telepon: '', sumber: '', kontakList: [], riwayat: [] });
        state.proyek.push({ id: 'pr-kla', nama: 'RENOVASI KLA COMPUTER CABANG BANDUNG',
          klienId: 'kl-kla', klien: 'PT. KLA TEKNOLOGI INDONESIA', status: 'berjalan',
          nilaiKontrak: 438416426, tanggalMulai: hariIniIso(), biayaBahan: 0, biayaUpah: 0, biayaLain: 0,
          karyawanIds: [], subkontraktor: [], belanjaMaterial: [], dokumen: [] });
        saveState();
      }
    """)

    # ===== 1. Kasus KLA: klien belum di cloud -> proyek tetap terkirim =====
    page.evaluate("notePendingMirror('proyek', 'pr-kla')")  # simulasikan sisa antrean lama
    page.evaluate("(async () => { await mirrorProyekUpsert(state.proyek.find(x => x.id === 'pr-kla')); })()")
    page.wait_for_timeout(400)
    st1 = page.evaluate("""
      () => ({
        proyekDiCloud: window.__store.proyek.some(r => r.id === 'pr-kla' && r.klien_id === 'kl-kla'),
        klienIkutTerkirim: window.__store.klien.some(r => r.id === 'kl-kla'),
        pendingBersih: !((JSON.parse(localStorage.getItem('mitraCreative_pendingMirror_v1') || '{}').proyek) || []).includes('pr-kla')
      })
    """)
    assert st1["proyekDiCloud"], f"proyek harus terkirim walau kliennya belum ada di cloud: {st1}"
    assert st1["klienIkutTerkirim"], f"klien induk harus otomatis dikirim lebih dulu: {st1}"
    assert st1["pendingBersih"], st1
    print("Skenario 1 (kasus KLA Bandung: klien induk dikirim otomatis -> proyek sampai ke cloud, pending bersih) OK")

    # ===== 2. Klien yatim (tidak ada di state) -> tautan di-null-kan =====
    page.evaluate("""
      () => {
        state.proyek.push({ id: 'pr-yatim', nama: 'Proyek Klien Terhapus', klienId: 'kl-hilang',
          klien: 'Klien Lama', status: 'berjalan', nilaiKontrak: 1000000, tanggalMulai: hariIniIso(),
          biayaBahan: 0, biayaUpah: 0, biayaLain: 0, karyawanIds: [], subkontraktor: [], belanjaMaterial: [], dokumen: [] });
      }
    """)
    page.evaluate("(async () => { await mirrorProyekUpsert(state.proyek.find(x => x.id === 'pr-yatim')); })()")
    page.wait_for_timeout(300)
    st2 = page.evaluate("""
      () => {
        const r = window.__store.proyek.find(x => x.id === 'pr-yatim');
        return { ada: !!r, klienIdNull: r && r.klien_id === null, namaTetap: r && r.klien === 'Klien Lama' };
      }
    """)
    assert st2["ada"] and st2["klienIdNull"] and st2["namaTetap"], st2
    print("Skenario 2 (klien yatim: proyek tetap terkirim tanpa tautan id, nama klien teks tetap terbawa) OK")

    # ===== 3. Kas transaksi ber-proyek yang belum di cloud (berantai) =====
    page.evaluate("""
      () => {
        window.__store.proyek = window.__store.proyek.filter(r => r.id !== 'pr-kla');
        window.__store.klien = [];
        state.kasUsaha.transactions.push({ id: 'kas-kla', tanggal: hariIniIso(), tipe: 'Keluar',
          kategori: 'Biaya Bahan', jumlah: 500000, keterangan: 'Besi hollow KLA', status: 'lunas', proyekId: 'pr-kla' });
      }
    """)
    page.evaluate("(async () => { await mirrorKasUsahaUpsert(state.kasUsaha.transactions.find(t => t.id === 'kas-kla')); })()")
    page.wait_for_timeout(300)
    st3 = page.evaluate("""
      () => ({
        kas: window.__store.kas_usaha_transaksi.some(r => r.id === 'kas-kla' && r.proyek_id === 'pr-kla'),
        proyek: window.__store.proyek.some(r => r.id === 'pr-kla'),
        klien: window.__store.klien.some(r => r.id === 'kl-kla')
      })
    """)
    assert st3["kas"] and st3["proyek"] and st3["klien"], f"penyembuhan berantai kas -> proyek -> klien: {st3}"
    print("Skenario 3 (transaksi Kas ber-proyek: proyek + klien induk dikirim berantai, kas sampai ke cloud) OK")

    # ===== 4. RAB & Penawaran ber-klien juga sembuh =====
    page.evaluate("""
      () => {
        window.__store.klien = [];
        state.proyekRab.push({ id: 'rab-fk', nomor: 'RAB-FK', nama: 'RAB Uji FK', klien: 'PT KLA', klienId: 'kl-kla',
          lokasi: '', kategori: KATEGORI_PEKERJAAN[0], tanggal: hariIniIso(), ppn: 0, pph: 0, biayaLain: 0, items: [], skemaPembayaran: [] });
        state.penawaran.push({ id: 'pw-fk', nomor: 'PW-FK', tanggal: hariIniIso(), klienId: 'kl-kla', kepada: 'PT KLA',
          alamatKlien: '', perihal: 'Uji', kategori: KATEGORI_PEKERJAAN[0], status: 'draft', diskon: 0, ppn: 0, pph: 0,
          biayaLain: 0, items: [], skemaPembayaran: [], nego: [], syarat: '', penutup: '' });
      }
    """)
    page.evaluate("(async () => { await mirrorRabUpsert(state.proyekRab.find(x => x.id === 'rab-fk')); await mirrorPenawaranUpsert(state.penawaran.find(x => x.id === 'pw-fk')); })()")
    page.wait_for_timeout(300)
    st4 = page.evaluate("""
      () => ({
        rab: window.__store.rab.some(r => r.id === 'rab-fk' && r.klien_id === 'kl-kla'),
        pw: window.__store.penawaran.some(r => r.id === 'pw-fk' && r.klien_id === 'kl-kla'),
        klien: window.__store.klien.some(r => r.id === 'kl-kla')
      })
    """)
    assert st4["rab"] and st4["pw"] and st4["klien"], st4
    print("Skenario 4 (RAB & Penawaran ber-klien: sembuh dengan pola yang sama) OK")

    js_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (4 skenario)")
    browser.close()
