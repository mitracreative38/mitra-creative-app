from playwright.sync_api import sync_playwright

# Audit smoke: buka SEMUA halaman aplikasi (daftar diambil dinamis dari tombol
# nav data-page di index.html) + subtab Karyawan & Laporan Keuangan, pastikan
# tidak ada error JS sama sekali. Ditulis ulang setelah suite regresi lama di
# scratchpad hilang bersama recycle container (2026-09-11).

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    page.on("dialog", lambda d: d.accept())
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8944/index.html")
    page.wait_for_timeout(1200)

    pages = page.evaluate("Array.from(document.querySelectorAll('.nav-item[data-page]')).map(b => b.dataset.page)")
    assert len(pages) >= 20, f"daftar halaman nav terlalu sedikit: {pages}"
    for nama in pages:
        page.evaluate("(n) => showPage(n)", nama)
        page.wait_for_timeout(150)
    print(f"{len(pages)} halaman nav dibuka tanpa error")

    # Subtab yang render fungsinya terpisah dari showPage.
    for prefix, subs in [("ky", ["daftar", "absensi", "penggajian", "rekap"]),
                         ("lk", ["arus", "labarugi", "neraca", "proyeksi", "tutupbuku"])]:
        page.evaluate("""
          (pfx) => {
            const btn = document.querySelector(`.subtab-item[data-subtab-page="${pfx}"]`);
            showPage(btn.closest('.page').id.replace('page-', ''));
          }
        """, prefix)
        page.wait_for_timeout(100)
        oks = page.evaluate("""
          (pfx) => Array.from(document.querySelectorAll(`.subtab-item[data-subtab-page="${pfx}"]`)).map(b => b.dataset.subtab)
        """, prefix)
        for s in oks:
            page.evaluate("([pfx, s]) => showSubtab(pfx, s)", [prefix, s])
            page.wait_for_timeout(120)
        print(f"subtab {prefix}: {oks} OK")

    js_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL" not in e and "Failed to load resource" not in e]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SMOKE SEMUA HALAMAN PASS")
    browser.close()
