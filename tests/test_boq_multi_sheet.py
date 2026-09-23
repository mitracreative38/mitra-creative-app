import base64
import io
import os
import zipfile

from playwright.sync_api import sync_playwright

# Laporan Owner (2026-09-23): "saya impor BOQ, malah muncul ada AC juga".
# Akar masalah: workbook DED sering berisi BEBERAPA sheet (rekap, per
# divisi/lantai, perhitungan AC, dst.) dan parser lama mengambil sheet
# PERTAMA yang berisi item secara diam-diam. Kini pengguna memilih sheet
# yang mau diimpor. Yang diuji:
# 1. Workbook 2 sheet -> muncul prompt daftar sheet; pilih sheet 2 ->
#    pratinjau HANYA berisi item sheet 2 (item AC di sheet 1 tidak ikut).
# 2. Pilih sheet 1 (default) -> item AC yang masuk.
# 3. Batal di prompt -> tidak ada pratinjau yang terbuka.
# 4. Workbook 1 sheet -> tanpa prompt, langsung pratinjau (perilaku lama).

JSZIP_PATH = os.path.join(os.path.dirname(__file__), "vendor", "jszip.min.js")


def buat_sheet(rows):
    def cell(ref, val, teks=False):
        if teks:
            return f'<c r="{ref}" t="inlineStr"><is><t>{val}</t></is></c>'
        return f'<c r="{ref}"><v>{val}</v></c>'
    xml_rows = []
    for i, (uraian, volume, satuan) in enumerate(rows, start=1):
        if i == 1:
            xml_rows.append(f'<row r="1">{cell("A1", uraian, True)}{cell("B1", volume, True)}{cell("C1", satuan, True)}</row>')
        else:
            xml_rows.append(f'<row r="{i}">{cell(f"A{i}", uraian, True)}{cell(f"B{i}", volume)}{cell(f"C{i}", satuan, True)}</row>')
    return ('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{"".join(xml_rows)}</sheetData></worksheet>')


def buat_xlsx(sheets):
    """sheets: list of (nama, rows). Baris pertama tiap sheet = header."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        deklarasi = "".join(
            f'<sheet name="{nama}" sheetId="{i+1}" r:id="rId{i+1}"/>' for i, (nama, _) in enumerate(sheets))
        z.writestr("xl/workbook.xml",
                   '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                   f'<sheets>{deklarasi}</sheets></workbook>')
        rels = "".join(
            f'<Relationship Id="rId{i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{i+1}.xml"/>' for i in range(len(sheets)))
        z.writestr("xl/_rels/workbook.xml.rels",
                   f'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rels}</Relationships>')
        for i, (_, rows) in enumerate(sheets):
            z.writestr(f"xl/worksheets/sheet{i+1}.xml", buat_sheet(rows))
    return base64.b64encode(buf.getvalue()).decode()


HEADER = ("Uraian Pekerjaan", "Volume", "Satuan")
XLSX_DUA_SHEET = buat_xlsx([
    ("PERHITUNGAN AC", [HEADER, ("Unit AC 1 PK", 2, "unit"), ("Pipa AC", 10, "m")]),
    ("PEKERJAAN SIPIL", [HEADER, ("Pasang Pintu Jendela", 3, "unit"), ("Cat Dinding", 50, "m2")]),
])
XLSX_SATU_SHEET = buat_xlsx([
    ("BOQ", [HEADER, ("Pasang Neon Box", 1, "unit")]),
])

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page()
    errors = []
    dialogs = []
    respons = {"prompt": "1", "batal": False}
    def on_dialog(d):
        dialogs.append(f"{d.type}:{d.message[:300]}")
        if d.type == "prompt":
            if respons["batal"]:
                d.dismiss()
            else:
                d.accept(respons["prompt"])
        else:
            d.accept()
    page.on("dialog", on_dialog)
    page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.goto("http://localhost:8938/index.html")
    page.wait_for_timeout(1200)
    page.add_script_tag(path=JSZIP_PATH)  # CDN JSZip tidak tersedia di sandbox tes

    page.evaluate("""
      () => {
        const rab = { id: 'rab-ms', nomor: 'RAB-MS', nama: 'Uji Multi Sheet', klien: '', klienId: '', lokasi: '',
          kategori: KATEGORI_PEKERJAAN[0], tanggal: hariIniIso(), ppn: 0, pph: 0, biayaLain: 0, items: [], skemaPembayaran: [] };
        state.proyekRab.push(rab);
        saveState();
        window.__kirimBoq = async (b64) => {
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          await handleBoqFile(new File([bytes], 'boq.xlsx'), { kind: 'rab', docId: 'rab-ms' });
        };
      }
    """)

    # ===== 1. Dua sheet -> prompt; pilih sheet 2 -> item AC TIDAK ikut =====
    respons["prompt"] = "2"
    dialogs.clear()
    page.evaluate("(b64) => window.__kirimBoq(b64)", XLSX_DUA_SHEET)
    page.wait_for_timeout(600)
    st1 = page.evaluate("""
      () => ({
        open: document.getElementById('importPreviewModal') ? document.getElementById('importPreviewModal').classList.contains('open') : null,
        uraian: (importPreviewRows || []).map(r => r.uraian)
      })
    """)
    assert any("prompt:" in d and "2 sheet" in d for d in dialogs), dialogs
    assert any("PERHITUNGAN AC (2 item)" in d for d in dialogs) and any("PEKERJAAN SIPIL (2 item)" in d for d in dialogs), dialogs
    assert any("Pintu Jendela" in u for u in st1["uraian"]), st1
    assert not any("AC" in u for u in st1["uraian"]), f"item sheet AC tidak boleh ikut: {st1}"
    print("Skenario 1 (2 sheet: prompt pilihan muncul; pilih sheet 2 -> item AC tidak ikut terimpor) OK")

    # ===== 2. Pilih sheet 1 -> item AC yang masuk =====
    page.evaluate("closeModals(); importPreviewRows = [];")
    respons["prompt"] = "1"
    page.evaluate("(b64) => window.__kirimBoq(b64)", XLSX_DUA_SHEET)
    page.wait_for_timeout(600)
    st2 = page.evaluate("(importPreviewRows || []).map(r => r.uraian)")
    assert any("Unit AC 1 PK" in u for u in st2) and not any("Pintu" in u for u in st2), st2
    print("Skenario 2 (pilih sheet 1 -> memang item AC yang terimpor, sesuai pilihan) OK")

    # ===== 3. Batal di prompt -> tidak ada pratinjau =====
    page.evaluate("closeModals(); importPreviewRows = [];")
    respons["batal"] = True
    page.evaluate("(b64) => window.__kirimBoq(b64)", XLSX_DUA_SHEET)
    page.wait_for_timeout(400)
    st3 = page.evaluate("""
      () => ({
        open: document.getElementById('importPreviewModal') ? document.getElementById('importPreviewModal').classList.contains('open') : false,
        rows: (importPreviewRows || []).length
      })
    """)
    assert not st3["open"] and st3["rows"] == 0, st3
    respons["batal"] = False
    print("Skenario 3 (batal di prompt -> impor dibatalkan bersih) OK")

    # ===== 4. Satu sheet -> tanpa prompt =====
    dialogs.clear()
    page.evaluate("(b64) => window.__kirimBoq(b64)", XLSX_SATU_SHEET)
    page.wait_for_timeout(600)
    st4 = page.evaluate("(importPreviewRows || []).map(r => r.uraian)")
    assert not any(d.startswith("prompt:") for d in dialogs), f"1 sheet tidak boleh memunculkan prompt: {dialogs}"
    assert any("Neon Box" in u for u in st4), st4
    print("Skenario 4 (1 sheet: langsung pratinjau tanpa prompt -- perilaku lama utuh) OK")

    js_errors = [e for e in errors if "favicon" not in e and "ERR_TUNNEL" not in e and "Failed to load resource" not in e and "jszip" not in e.lower()]
    assert not js_errors, f"Error JS: {js_errors}"
    print()
    print("SEMUA SKENARIO PASS (4 skenario)")
    browser.close()
