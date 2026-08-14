// ===== State & persistence =====
const STORAGE_KEY = "mitraCreative_keuangan_v1";

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return withDefaults(JSON.parse(raw)); } catch (e) { /* fall through to seed */ }
  }
  const seeded = JSON.parse(JSON.stringify(SEED_DATA));
  seeded.kasUsaha.transactions.forEach(t => t.id = uid());
  seeded.kasPribadi.transactions.forEach(t => t.id = uid());
  seeded.proyek.forEach(p => p.id = uid());
  seeded.ahsp.forEach(a => a.id = uid());
  seeded.stok.forEach(s => s.id = uid());
  seeded.karyawan.forEach(k => k.id = uid());
  return seeded;
}
function withDefaults(s) {
  if (!s.ahsp) {
    s.ahsp = JSON.parse(JSON.stringify(SEED_AHSP));
    s.ahsp.forEach(a => a.id = uid());
  } else {
    const existingKode = new Set(s.ahsp.map(a => a.kode).filter(Boolean));
    SEED_AHSP.forEach(seedItem => {
      if (seedItem.kode && !existingKode.has(seedItem.kode)) {
        const copy = JSON.parse(JSON.stringify(seedItem));
        copy.id = uid();
        s.ahsp.push(copy);
      }
    });
    // One-time text fix-up for GS-01/GS-04 (only if still the original unedited seed text, never overwrites a user edit)
    const textFixups = {
      "GS-01": { from: "Partisi Pengaman Wiremesh + Rangka Hollow Blacksteel (+ Gypsum bila spek minta)", to: "Partisi Pengaman Wiremesh + Hollow Blacksteel" },
      "GS-04": { from: "Plafond Wiremesh + Rangka Hollow Blacksteel + Fin. Zincromate & Cat Besi", to: "Plafond Wiremesh + Hollow Blacksteel" }
    };
    s.ahsp.forEach(a => {
      const fix = a.kode && textFixups[a.kode];
      if (fix && a.uraian === fix.from) a.uraian = fix.to;
    });
  }
  if (!s.proyekRab) s.proyekRab = [];
  if (!s.penawaran) s.penawaran = [];
  if (typeof s.penawaranCounter !== "number") s.penawaranCounter = 0;
  if (!s.alamat) s.alamat = COMPANY_ADDRESS;
  if (!s.telepon) s.telepon = COMPANY_PHONE;
  if (!s.ownerNama) s.ownerNama = OWNER_INFO.nama;
  if (!s.ownerJabatan) s.ownerJabatan = OWNER_INFO.jabatan;
  if (!s.stok) s.stok = [];
  if (!s.karyawan) s.karyawan = [];
  return s;
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

let state = loadState();

// ===== Formatting helpers =====
function rupiah(n) {
  n = Number(n) || 0;
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function parseNumberInput(str) {
  if (typeof str === "number") return str;
  if (!str) return 0;
  const cleaned = str.toString().replace(/[^0-9-]/g, "");
  return cleaned ? parseInt(cleaned, 10) : 0;
}
function formatNumberInput(n) {
  n = Number(n) || 0;
  return n.toLocaleString("id-ID");
}
const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
function formatTanggal(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return `${d} ${BULAN_ID[m - 1]} ${y}`;
}
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ===== Live-format numeric text inputs (thousand separators) =====
function attachNumberFormatting(input) {
  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    const before = input.value;
    const digits = before.replace(/[^0-9]/g, "");
    input.value = digits ? Number(digits).toLocaleString("id-ID") : "";
    const diff = input.value.length - before.length;
    const newPos = Math.max(0, pos + diff);
    input.setSelectionRange(newPos, newPos);
  });
}

// ===== Calculations =====
function kasSummary(book) {
  const b = state[book];
  let masukLunas = 0, keluarLunas = 0, pending = 0;
  b.transactions.forEach(t => {
    const status = t.status || "lunas";
    if (t.tipe === "Masuk") {
      if (status === "pending") pending += t.jumlah;
      else masukLunas += t.jumlah;
    } else if (t.tipe === "Keluar") {
      keluarLunas += t.jumlah;
    }
  });
  const saldoAkhir = (b.saldoAwal || 0) + masukLunas - keluarLunas;
  return { masukLunas, keluarLunas, pending, saldoAkhir, saldoAwal: b.saldoAwal || 0 };
}
function projectCalc(p) {
  const totalBiaya = (p.biayaBahan || 0) + (p.biayaUpah || 0) + (p.biayaLain || 0);
  const margin = (p.nilaiKontrak || 0) - totalBiaya;
  const marginPct = p.nilaiKontrak ? margin / p.nilaiKontrak : 0;
  let status = "critical";
  if (marginPct > 0.30) status = "good";
  else if (marginPct >= 0.15) status = "warning";
  return { totalBiaya, margin, marginPct, status };
}
function marginStatusLabel(status) {
  return status === "good" ? "Bagus" : status === "warning" ? "Sehat" : "Tipis";
}

// ===== Bar chart (CSS bars) =====
function renderBarChart(container, rows) {
  // rows: [{label, value, color, formattedValue}]
  container.innerHTML = "";
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  if (rows.every(r => r.value === 0)) {
    container.innerHTML = '<div class="bar-chart-empty">Belum ada data</div>';
    return;
  }
  rows.forEach(r => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const pct = Math.max(2, Math.round((Math.abs(r.value) / max) * 100));
    row.innerHTML = `
      <div class="bar-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${r.color}"></div></div>
      <div class="bar-value">${r.formattedValue}</div>
    `;
    container.appendChild(row);
  });
}
function escapeHtml(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ===== Rendering: Dashboard =====
function renderDashboard() {
  const ku = kasSummary("kasUsaha");
  const kp = kasSummary("kasPribadi");
  const projects = state.proyek.map(p => ({ ...p, ...projectCalc(p) }));
  const totalMargin = projects.reduce((s, p) => s + p.margin, 0);
  const totalKontrak = projects.reduce((s, p) => s + (p.nilaiKontrak || 0), 0);

  document.getElementById("dashSaldoUsaha").textContent = rupiah(ku.saldoAkhir);
  document.getElementById("dashSaldoUsahaMeta").textContent = `Masuk ${rupiah(ku.masukLunas)} · Keluar ${rupiah(ku.keluarLunas)}`;
  document.getElementById("dashSaldoPribadi").textContent = rupiah(kp.saldoAkhir);
  document.getElementById("dashSaldoPribadiMeta").textContent = `Masuk ${rupiah(kp.masukLunas)} · Keluar ${rupiah(kp.keluarLunas)}`;
  document.getElementById("dashMarginTotal").textContent = rupiah(totalMargin);
  document.getElementById("dashMarginMeta").textContent = totalKontrak ? `Rata-rata margin ${(totalMargin / totalKontrak * 100).toFixed(1)}%` : "Belum ada proyek";
  document.getElementById("dashPiutang").textContent = rupiah(ku.pending);

  renderBarChart(document.getElementById("chartCashflow"), [
    { label: "Usaha - Masuk", value: ku.masukLunas, color: "var(--series-1)", formattedValue: rupiah(ku.masukLunas) },
    { label: "Usaha - Keluar", value: ku.keluarLunas, color: "var(--series-2)", formattedValue: rupiah(ku.keluarLunas) },
    { label: "Pribadi - Masuk", value: kp.masukLunas, color: "var(--series-1)", formattedValue: rupiah(kp.masukLunas) },
    { label: "Pribadi - Keluar", value: kp.keluarLunas, color: "var(--series-2)", formattedValue: rupiah(kp.keluarLunas) }
  ]);

  const marginRows = projects
    .slice().sort((a, b) => b.marginPct - a.marginPct)
    .map(p => ({
      label: p.nama, value: Math.max(0, p.marginPct * 100),
      color: p.status === "good" ? "var(--good)" : p.status === "warning" ? "var(--warning)" : "var(--critical)",
      formattedValue: (p.marginPct * 100).toFixed(1) + "%"
    }));
  renderBarChart(document.getElementById("chartMargin"), marginRows);

  // Recent transactions across both books
  const all = [
    ...state.kasUsaha.transactions.map(t => ({ ...t, sumber: "Kas Perusahaan" })),
    ...state.kasPribadi.transactions.map(t => ({ ...t, sumber: "Kas Pribadi" }))
  ].sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "")).slice(0, 8);

  const tbody = document.querySelector("#recentTable tbody");
  tbody.innerHTML = "";
  if (!all.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Belum ada transaksi</td></tr>';
  } else {
    all.forEach(t => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatTanggal(t.tanggal)}</td>
        <td>${escapeHtml(t.sumber)}</td>
        <td>${escapeHtml(t.keterangan)}</td>
        <td><span class="badge ${t.tipe === "Masuk" ? "badge-masuk" : "badge-keluar"}">${t.tipe}</span></td>
        <td class="num">${rupiah(t.jumlah)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// ===== Rendering: Kas books (Usaha / Pribadi) =====
const bookConfig = {
  kasUsaha: {
    prefix: "ku", kategoriList: KATEGORI_USAHA, extraLabel: "Klien / Proyek Terkait",
    hasStatus: true, hasFilterStatus: true
  },
  kasPribadi: {
    prefix: "kp", kategoriList: KATEGORI_PRIBADI, extraList: SUMBER_DANA_PRIBADI, extraLabel: "Sumber Dana",
    hasStatus: false, hasFilterStatus: false
  }
};

function renderKasBook(book) {
  const cfg = bookConfig[book];
  const p = cfg.prefix;
  const sum = kasSummary(book);

  const saldoInput = document.getElementById(`${p}_saldoAwal`);
  if (document.activeElement !== saldoInput) saldoInput.value = formatNumberInput(sum.saldoAwal);

  document.getElementById(`${p}_pemasukan`).textContent = rupiah(sum.masukLunas);
  document.getElementById(`${p}_pengeluaran`).textContent = rupiah(sum.keluarLunas);
  document.getElementById(`${p}_saldoAkhir`).textContent = rupiah(sum.saldoAkhir);

  if (book === "kasUsaha") {
    document.getElementById("ku_piutang").textContent = rupiah(sum.pending);
  }
  if (book === "kasPribadi") {
    const mk = currentMonthKey();
    const prive = state.kasPribadi.transactions
      .filter(t => t.tipe === "Masuk" && t.kategori === "Prive/Gaji Owner" && (t.tanggal || "").startsWith(mk))
      .reduce((s, t) => s + t.jumlah, 0);
    document.getElementById("kp_priveBulanIni").textContent = rupiah(prive);
  }

  // Filters
  const search = (document.getElementById(`${p}_search`)?.value || "").toLowerCase();
  const filterTipe = document.getElementById(`${p}_filterTipe`)?.value || "";
  const filterStatus = document.getElementById(`${p}_filterStatus`)?.value || "";

  let rows = state[book].transactions.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  if (search) {
    rows = rows.filter(t =>
      (t.keterangan || "").toLowerCase().includes(search) ||
      (t.extra || "").toLowerCase().includes(search) ||
      (t.kategori || "").toLowerCase().includes(search)
    );
  }
  if (filterTipe) rows = rows.filter(t => t.tipe === filterTipe);
  if (filterStatus) rows = rows.filter(t => (t.status || "lunas") === filterStatus);

  const tbody = document.querySelector(`#${p}_table tbody`);
  tbody.innerHTML = "";
  const colCount = book === "kasUsaha" ? 8 : 7;
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${colCount}">Belum ada transaksi</td></tr>`;
    return;
  }
  rows.forEach(t => {
    const tr = document.createElement("tr");
    const statusCell = book === "kasUsaha"
      ? `<td><span class="badge ${(t.status || "lunas") === "lunas" ? "badge-lunas" : "badge-pending"}">${(t.status || "lunas") === "lunas" ? "Lunas" : "Piutang"}</span></td>`
      : "";
    tr.innerHTML = `
      <td>${formatTanggal(t.tanggal)}</td>
      <td>${escapeHtml(t.keterangan)}</td>
      <td>${escapeHtml(t.kategori || "-")}</td>
      <td>${escapeHtml(t.extra || "-")}</td>
      <td><span class="badge ${t.tipe === "Masuk" ? "badge-masuk" : "badge-keluar"}">${t.tipe}</span></td>
      ${statusCell}
      <td class="num">${rupiah(t.jumlah)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit="${t.id}" data-book="${book}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete="${t.id}" data-book="${book}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Rendering: Proyek =====
function renderProyek() {
  const projects = state.proyek.map(p => ({ ...p, ...projectCalc(p) }));
  const totalKontrak = projects.reduce((s, p) => s + (p.nilaiKontrak || 0), 0);
  const totalBiaya = projects.reduce((s, p) => s + p.totalBiaya, 0);
  const totalMargin = projects.reduce((s, p) => s + p.margin, 0);
  const avgMargin = totalKontrak ? (totalMargin / totalKontrak) * 100 : 0;

  document.getElementById("pr_totalKontrak").textContent = rupiah(totalKontrak);
  document.getElementById("pr_totalBiaya").textContent = rupiah(totalBiaya);
  document.getElementById("pr_totalMargin").textContent = rupiah(totalMargin);
  document.getElementById("pr_avgMargin").textContent = avgMargin.toFixed(1) + "%";

  const tbody = document.querySelector("#pr_table tbody");
  tbody.innerHTML = "";
  if (!projects.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Belum ada proyek</td></tr>';
    return;
  }
  projects.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.nama)}</td>
      <td class="num">${rupiah(p.nilaiKontrak)}</td>
      <td class="num">${rupiah(p.biayaBahan)}</td>
      <td class="num">${rupiah(p.biayaUpah)}</td>
      <td class="num">${rupiah(p.biayaLain)}</td>
      <td class="num">${rupiah(p.totalBiaya)}</td>
      <td class="num">${rupiah(p.margin)}</td>
      <td class="num"><span class="badge-margin ${p.status}">${(p.marginPct * 100).toFixed(1)}% · ${marginStatusLabel(p.status)}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit-proyek="${p.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-proyek="${p.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Stok Material & Alat =====
function stokQty(item) {
  let qty = item.stokAwal || 0;
  (item.transactions || []).forEach(t => {
    if (t.tipe === "Masuk") qty += t.qty || 0;
    else if (t.tipe === "Keluar") qty -= t.qty || 0;
  });
  return qty;
}
function stokValue(item) {
  return stokQty(item) * (item.hargaSatuan || 0);
}
function stokStatus(item) {
  const qty = stokQty(item);
  if (qty <= 0) return "habis";
  if (qty <= (item.stokMinimum || 0)) return "hampir";
  return "aman";
}
function stokStatusLabel(status) {
  return status === "aman" ? "Aman" : status === "hampir" ? "Hampir Habis" : "Habis";
}

let currentStokId = null;
function renderStokList() {
  const items = state.stok.map(s => ({ ...s, qty: stokQty(s), nilai: stokValue(s), status: stokStatus(s) }));
  document.getElementById("stok_totalJenis").textContent = items.length;
  document.getElementById("stok_totalNilai").textContent = rupiah(items.reduce((sum, s) => sum + s.nilai, 0));
  document.getElementById("stok_totalHampir").textContent = items.filter(s => s.status === "hampir").length;
  document.getElementById("stok_totalHabis").textContent = items.filter(s => s.status === "habis").length;

  const search = (document.getElementById("stok_search").value || "").toLowerCase();
  const filterKategori = document.getElementById("stok_filterKategori").value;
  const filterStatus = document.getElementById("stok_filterStatus").value;

  let rows = items.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  if (search) rows = rows.filter(s => s.nama.toLowerCase().includes(search));
  if (filterKategori) rows = rows.filter(s => s.kategori === filterKategori);
  if (filterStatus) rows = rows.filter(s => s.status === filterStatus);

  const tbody = document.querySelector("#stok_table tbody");
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Belum ada barang. Klik + Tambah Barang untuk mulai mencatat stok.</td></tr>';
    return;
  }
  rows.forEach(s => {
    const tr = document.createElement("tr");
    if (s.status === "hampir") tr.classList.add("stok-row-hampir");
    if (s.status === "habis") tr.classList.add("stok-row-habis");
    tr.innerHTML = `
      <td><a href="#" class="stok-link" data-open-stok="${s.id}">${escapeHtml(s.nama)}</a></td>
      <td>${escapeHtml(s.kategori)}</td>
      <td>${escapeHtml(s.satuan)}</td>
      <td class="num">${s.qty}</td>
      <td class="num">${s.stokMinimum || 0}</td>
      <td class="num">${rupiah(s.hargaSatuan)}</td>
      <td class="num">${rupiah(s.nilai)}</td>
      <td><span class="badge-stok ${s.status}">${stokStatusLabel(s.status)}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit-stok="${s.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-stok="${s.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function showStokList() {
  currentStokId = null;
  document.getElementById("stok_listView").style.display = "block";
  document.getElementById("stok_riwayatView").style.display = "none";
  renderStokList();
}
function showStokRiwayat(id) {
  currentStokId = id;
  document.getElementById("stok_listView").style.display = "none";
  document.getElementById("stok_riwayatView").style.display = "block";
  renderStokRiwayat();
}
function renderStokRiwayat() {
  const item = state.stok.find(s => s.id === currentStokId);
  if (!item) { showStokList(); return; }
  const qty = stokQty(item);
  const status = stokStatus(item);
  document.getElementById("stok_riwayatNama").textContent = `Riwayat Stok: ${item.nama}`;
  document.getElementById("stok_infoKategori").textContent = item.kategori;
  document.getElementById("stok_infoSatuan").textContent = item.satuan;
  const hargaInput = document.getElementById("stok_infoHarga");
  if (document.activeElement !== hargaInput) hargaInput.value = formatNumberInput(item.hargaSatuan || 0);
  const minInput = document.getElementById("stok_infoMinimum");
  if (document.activeElement !== minInput) minInput.value = formatNumberInput(item.stokMinimum || 0);
  document.getElementById("stok_infoQty").textContent = `${qty} ${item.satuan}`;
  document.getElementById("stok_infoQty").className = "stat-value " + (status === "habis" ? "bad" : status === "hampir" ? "warn" : "good");
  document.getElementById("stok_infoStatus").textContent = stokStatusLabel(status);

  const tbody = document.querySelector("#stok_txnTable tbody");
  tbody.innerHTML = "";
  const rows = (item.transactions || []).slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Belum ada riwayat transaksi</td></tr>';
    return;
  }
  rows.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatTanggal(t.tanggal)}</td>
      <td><span class="badge ${t.tipe === "Masuk" ? "badge-masuk" : "badge-keluar"}">${t.tipe}</span></td>
      <td class="num">${t.qty}</td>
      <td>${escapeHtml(t.keterangan || "-")}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit-stoktxn="${t.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-stoktxn="${t.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById("stok_search").addEventListener("input", renderStokList);
document.getElementById("stok_filterKategori").addEventListener("change", renderStokList);
document.getElementById("stok_filterStatus").addEventListener("change", renderStokList);
document.getElementById("stok_backBtn").addEventListener("click", showStokList);
document.getElementById("stok_table").addEventListener("click", e => {
  const openLink = e.target.closest("[data-open-stok]");
  const editBtn = e.target.closest("[data-edit-stok]");
  const delBtn = e.target.closest("[data-delete-stok]");
  if (openLink) { e.preventDefault(); showStokRiwayat(openLink.dataset.openStok); }
  else if (editBtn) {
    const s = state.stok.find(x => x.id === editBtn.dataset.editStok);
    if (s) openStokModal(s);
  } else if (delBtn) {
    if (confirm("Hapus barang ini beserta seluruh riwayatnya?")) {
      state.stok = state.stok.filter(x => x.id !== delBtn.dataset.deleteStok);
      saveState();
      renderStokList();
    }
  }
});

// ===== Modal: barang stok (master data) =====
const stokModal = document.getElementById("stokModal");
function openStokModal(existing) {
  document.getElementById("sb_id").value = existing ? existing.id : "";
  document.getElementById("stokModalTitle").textContent = existing ? "Edit Barang" : "Tambah Barang";
  document.getElementById("satuanStokList").innerHTML = SATUAN_STOK.map(s => `<option value="${escapeHtml(s)}">`).join("");
  document.getElementById("sb_nama").value = existing ? existing.nama : "";
  document.getElementById("sb_kategori").value = existing ? existing.kategori : "Material";
  document.getElementById("sb_satuan").value = existing ? existing.satuan : "";
  document.getElementById("sb_stokAwal").value = existing ? formatNumberInput(existing.stokAwal || 0) : "";
  document.getElementById("sb_stokMinimum").value = existing ? formatNumberInput(existing.stokMinimum || 0) : "";
  document.getElementById("sb_hargaSatuan").value = existing ? formatNumberInput(existing.hargaSatuan || 0) : "";
  stokModal.classList.add("open");
}
["sb_stokAwal", "sb_stokMinimum", "sb_hargaSatuan"].forEach(id => attachNumberFormatting(document.getElementById(id)));
document.getElementById("stok_addBtn").addEventListener("click", () => openStokModal(null));
document.getElementById("stokForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("sb_id").value;
  const idx = state.stok.findIndex(s => s.id === id);
  const existing = idx >= 0 ? state.stok[idx] : null;
  const item = {
    id: id || uid(),
    nama: document.getElementById("sb_nama").value.trim(),
    kategori: document.getElementById("sb_kategori").value,
    satuan: document.getElementById("sb_satuan").value.trim(),
    stokAwal: parseNumberInput(document.getElementById("sb_stokAwal").value),
    stokMinimum: parseNumberInput(document.getElementById("sb_stokMinimum").value),
    hargaSatuan: parseNumberInput(document.getElementById("sb_hargaSatuan").value),
    transactions: existing ? existing.transactions : []
  };
  if (idx >= 0) state.stok[idx] = item; else state.stok.push(item);
  saveState();
  renderAll();
  closeModals();
});

// ===== Modal: transaksi stok (masuk/keluar) =====
const stokTxnModal = document.getElementById("stokTxnModal");
function openStokTxnModal(existing) {
  document.getElementById("st_id").value = existing ? existing.id : "";
  document.getElementById("stokTxnModalTitle").textContent = existing ? "Edit Transaksi Stok" : "Catat Transaksi Stok";
  document.getElementById("st_tipe").value = existing ? existing.tipe : "Masuk";
  document.getElementById("st_tanggal").value = existing ? existing.tanggal : new Date().toISOString().slice(0, 10);
  document.getElementById("st_qty").value = existing ? String(existing.qty) : "";
  document.getElementById("st_keterangan").value = existing ? (existing.keterangan || "") : "";
  stokTxnModal.classList.add("open");
}
document.getElementById("stok_addTxnBtn").addEventListener("click", () => openStokTxnModal(null));
document.getElementById("stokTxnForm").addEventListener("submit", e => {
  e.preventDefault();
  const item = state.stok.find(s => s.id === currentStokId);
  if (!item) { closeModals(); return; }
  const id = document.getElementById("st_id").value;
  const txn = {
    id: id || uid(),
    tipe: document.getElementById("st_tipe").value,
    tanggal: document.getElementById("st_tanggal").value,
    qty: parseFloat((document.getElementById("st_qty").value || "").replace(",", ".")) || 0,
    keterangan: document.getElementById("st_keterangan").value.trim()
  };
  const idx = item.transactions.findIndex(t => t.id === id);
  if (idx >= 0) item.transactions[idx] = txn; else item.transactions.push(txn);
  saveState();
  renderStokRiwayat();
  closeModals();
});
document.getElementById("stok_txnTable").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-stoktxn]");
  const delBtn = e.target.closest("[data-delete-stoktxn]");
  const item = state.stok.find(s => s.id === currentStokId);
  if (!item) return;
  if (editBtn) {
    const t = item.transactions.find(x => x.id === editBtn.dataset.editStoktxn);
    if (t) openStokTxnModal(t);
  } else if (delBtn) {
    if (confirm("Hapus transaksi ini?")) {
      item.transactions = item.transactions.filter(x => x.id !== delBtn.dataset.deleteStoktxn);
      saveState();
      renderStokRiwayat();
    }
  }
});
["stok_infoHarga", "stok_infoMinimum"].forEach(id => {
  const input = document.getElementById(id);
  attachNumberFormatting(input);
  input.addEventListener("change", () => {
    const item = state.stok.find(s => s.id === currentStokId);
    if (!item) return;
    if (id === "stok_infoHarga") item.hargaSatuan = parseNumberInput(input.value);
    else item.stokMinimum = parseNumberInput(input.value);
    saveState();
    renderStokRiwayat();
  });
});

// ===== Karyawan & Gaji =====
function sisaPinjaman(k) {
  const dipotong = (k.slipGaji || []).reduce((s, sl) => s + (sl.potonganPinjaman || 0), 0);
  return (k.pinjamanAwal || 0) - dipotong;
}
function slipTotalPotongan(sl) {
  return (sl.uangMakan || 0) + (sl.bon || 0) + (sl.potonganPinjaman || 0);
}
function slipGajiBersih(sl) {
  return (sl.upahKotor || 0) - slipTotalPotongan(sl);
}
function hitungBonusTarget(target, realisasi, persen) {
  const kelebihan = Math.max(0, (realisasi || 0) - (target || 0));
  return kelebihan * (persen || 0) / 100;
}

// ----- Subtab switching -----
document.querySelectorAll(".subtab-item").forEach(btn => {
  btn.addEventListener("click", () => showKaryawanSubtab(btn.dataset.subtab));
});
function showKaryawanSubtab(name) {
  document.querySelectorAll(".subtab-item").forEach(b => b.classList.toggle("active", b.dataset.subtab === name));
  document.querySelectorAll(".subtab-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`ky_${name}Panel`).classList.add("active");
  if (name === "absensi") renderAbsensiPanel();
  if (name === "penggajian") renderPenggajianPanel();
}

// ----- Daftar Karyawan -----
function renderKaryawanList() {
  const all = state.karyawan;
  const aktif = all.filter(k => k.aktif !== false);
  document.getElementById("ky_totalAktif").textContent = aktif.length;
  document.getElementById("ky_totalUpahHarian").textContent = rupiah(aktif.reduce((s, k) => s + (k.upahHarian || 0), 0));
  document.getElementById("ky_totalPinjaman").textContent = rupiah(all.reduce((s, k) => s + sisaPinjaman(k), 0));

  const search = (document.getElementById("ky_search").value || "").toLowerCase();
  let rows = all.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  if (search) rows = rows.filter(k => k.nama.toLowerCase().includes(search));

  const tbody = document.querySelector("#ky_table tbody");
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Belum ada karyawan. Klik + Tambah Karyawan untuk mulai.</td></tr>';
    return;
  }
  rows.forEach(k => {
    const tr = document.createElement("tr");
    const aktifBadge = k.aktif !== false
      ? `<span class="badge badge-lunas">Aktif</span>`
      : `<span class="badge badge-pending">Nonaktif</span>`;
    const isBulanan = k.tipeGaji === "Bulanan";
    const rateText = isBulanan
      ? `${rupiah(k.gajiBulanan)} / bulan`
      : `${rupiah(k.upahHarian)} / hari + ${rupiah(k.tarifLembur)} / jam lembur`;
    tr.innerHTML = `
      <td>${escapeHtml(k.nama)}</td>
      <td>${escapeHtml(k.jabatan || "-")}</td>
      <td>${isBulanan ? "Bulanan" : "Harian"}</td>
      <td class="num">${rateText}</td>
      <td class="num">${rupiah(sisaPinjaman(k))}</td>
      <td>${aktifBadge}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit-karyawan="${k.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-karyawan="${k.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
document.getElementById("ky_search").addEventListener("input", renderKaryawanList);
document.getElementById("ky_table").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-karyawan]");
  const delBtn = e.target.closest("[data-delete-karyawan]");
  if (editBtn) {
    const k = state.karyawan.find(x => x.id === editBtn.dataset.editKaryawan);
    if (k) openKaryawanModal(k);
  } else if (delBtn) {
    if (confirm("Hapus karyawan ini beserta seluruh riwayat absensi & slip gajinya?")) {
      state.karyawan = state.karyawan.filter(x => x.id !== delBtn.dataset.deleteKaryawan);
      saveState();
      renderAll();
    }
  }
});

// ----- Modal: karyawan (employee master) -----
const karyawanModal = document.getElementById("karyawanModal");
function toggleKaryawanTipeFields() {
  const isBulanan = document.getElementById("kym_tipeGaji").value === "Bulanan";
  document.getElementById("kym_harianFields").style.display = isBulanan ? "none" : "grid";
  document.getElementById("kym_bulananFields").style.display = isBulanan ? "grid" : "none";
}
document.getElementById("kym_tipeGaji").addEventListener("change", toggleKaryawanTipeFields);
function openKaryawanModal(existing) {
  document.getElementById("kym_id").value = existing ? existing.id : "";
  document.getElementById("karyawanModalTitle").textContent = existing ? "Edit Karyawan" : "Tambah Karyawan";
  document.getElementById("kym_nama").value = existing ? existing.nama : "";
  document.getElementById("kym_jabatan").value = existing ? (existing.jabatan || "") : "";
  document.getElementById("kym_tipeGaji").value = existing && existing.tipeGaji === "Bulanan" ? "Bulanan" : "Harian";
  document.getElementById("kym_aktif").value = existing && existing.aktif === false ? "0" : "1";
  document.getElementById("kym_upahHarian").value = existing ? formatNumberInput(existing.upahHarian || 0) : "";
  document.getElementById("kym_tarifLembur").value = existing ? formatNumberInput(existing.tarifLembur || 0) : "";
  document.getElementById("kym_uangMakanHarian").value = existing ? formatNumberInput(existing.uangMakanHarian || 0) : "";
  document.getElementById("kym_gajiBulanan").value = existing ? formatNumberInput(existing.gajiBulanan || 0) : "";
  document.getElementById("kym_targetBulanan").value = existing ? formatNumberInput(existing.targetBulanan || 0) : "";
  document.getElementById("kym_persenBonus").value = existing ? (existing.persenBonus || 0) : 0;
  document.getElementById("kym_pinjamanAwal").value = existing ? formatNumberInput(existing.pinjamanAwal || 0) : "";
  toggleKaryawanTipeFields();
  karyawanModal.classList.add("open");
}
["kym_upahHarian", "kym_tarifLembur", "kym_uangMakanHarian", "kym_gajiBulanan", "kym_targetBulanan", "kym_pinjamanAwal"].forEach(id => attachNumberFormatting(document.getElementById(id)));
document.getElementById("ky_addBtn").addEventListener("click", () => openKaryawanModal(null));
document.getElementById("karyawanForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("kym_id").value;
  const idx = state.karyawan.findIndex(k => k.id === id);
  const existing = idx >= 0 ? state.karyawan[idx] : null;
  const k = {
    id: id || uid(),
    nama: document.getElementById("kym_nama").value.trim(),
    jabatan: document.getElementById("kym_jabatan").value.trim(),
    tipeGaji: document.getElementById("kym_tipeGaji").value,
    aktif: document.getElementById("kym_aktif").value === "1",
    upahHarian: parseNumberInput(document.getElementById("kym_upahHarian").value),
    tarifLembur: parseNumberInput(document.getElementById("kym_tarifLembur").value),
    uangMakanHarian: parseNumberInput(document.getElementById("kym_uangMakanHarian").value),
    gajiBulanan: parseNumberInput(document.getElementById("kym_gajiBulanan").value),
    targetBulanan: parseNumberInput(document.getElementById("kym_targetBulanan").value),
    persenBonus: parseFloat(document.getElementById("kym_persenBonus").value) || 0,
    pinjamanAwal: parseNumberInput(document.getElementById("kym_pinjamanAwal").value),
    absensi: existing ? existing.absensi : [],
    slipGaji: existing ? existing.slipGaji : []
  };
  if (idx >= 0) state.karyawan[idx] = k; else state.karyawan.push(k);
  saveState();
  renderAll();
  closeModals();
});

// ----- Absensi Harian -----
function renderAbsensiPanel() {
  const tanggalInput = document.getElementById("ab_tanggal");
  if (!tanggalInput.value) tanggalInput.value = new Date().toISOString().slice(0, 10);
  const tanggal = tanggalInput.value;
  const aktif = state.karyawan.filter(k => k.aktif !== false).slice().sort((a, b) => a.nama.localeCompare(b.nama));
  const tbody = document.querySelector("#ab_table tbody");
  tbody.innerHTML = "";
  if (!aktif.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Belum ada karyawan aktif</td></tr>';
    return;
  }
  aktif.forEach(k => {
    const existing = (k.absensi || []).find(a => a.tanggal === tanggal);
    const hadir = existing ? existing.hadir : true;
    const jamLembur = existing ? existing.jamLembur : 0;
    const tr = document.createElement("tr");
    tr.dataset.karyawanId = k.id;
    tr.innerHTML = `
      <td>${escapeHtml(k.nama)}</td>
      <td>${escapeHtml(k.jabatan || "-")}</td>
      <td><input type="checkbox" class="att-check ab-hadir" ${hadir ? "checked" : ""}></td>
      <td class="num"><input type="text" inputmode="decimal" class="ab-lembur" value="${jamLembur || ""}" style="width:80px; text-align:right"></td>
    `;
    tbody.appendChild(tr);
  });
}
document.getElementById("ab_loadBtn").addEventListener("click", renderAbsensiPanel);
document.getElementById("ab_tanggal").addEventListener("change", renderAbsensiPanel);
document.getElementById("ab_saveBtn").addEventListener("click", () => {
  const tanggal = document.getElementById("ab_tanggal").value;
  if (!tanggal) { alert("Pilih tanggal terlebih dahulu."); return; }
  const rows = document.querySelectorAll("#ab_table tbody tr");
  let count = 0;
  rows.forEach(tr => {
    const kId = tr.dataset.karyawanId;
    if (!kId) return;
    const k = state.karyawan.find(x => x.id === kId);
    if (!k) return;
    const hadir = tr.querySelector(".ab-hadir").checked;
    const jamLembur = parseFloat((tr.querySelector(".ab-lembur").value || "").replace(",", ".")) || 0;
    if (!k.absensi) k.absensi = [];
    const idx = k.absensi.findIndex(a => a.tanggal === tanggal);
    const rec = { id: idx >= 0 ? k.absensi[idx].id : uid(), tanggal, hadir, jamLembur };
    if (idx >= 0) k.absensi[idx] = rec; else k.absensi.push(rec);
    count++;
  });
  saveState();
  alert(`Absensi tanggal ${formatTanggal(tanggal)} untuk ${count} karyawan berhasil disimpan.`);
});

// ----- Penggajian & Slip Gaji -----
let pgComputed = { hariHadir: 0, jamLembur: 0, totalUpahHarian: 0, totalLembur: 0, upahKotor: 0 };
function renderPenggajianPanel() {
  const sel = document.getElementById("pg_karyawan");
  const prevValue = sel.value;
  sel.innerHTML = state.karyawan.filter(k => k.aktif !== false).slice().sort((a, b) => a.nama.localeCompare(b.nama))
    .map(k => `<option value="${k.id}">${escapeHtml(k.nama)}</option>`).join("");
  if (prevValue && state.karyawan.some(k => k.id === prevValue)) sel.value = prevValue;
  if (!document.getElementById("pg_mulai").value) {
    // Gajian mingguan jatuh tiap Sabtu, jadi periode berjalan Minggu s.d. Sabtu —
    // bukan Senin s.d. Minggu, supaya hari Minggu (hari pertama periode) ikut terhitung.
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    document.getElementById("pg_mulai").value = sunday.toISOString().slice(0, 10);
    document.getElementById("pg_selesai").value = today.toISOString().slice(0, 10);
  }
  computePayrollFromAbsensi(true);
  renderPenggajianRiwayat();
}
function currentKaryawanForPayroll() {
  return state.karyawan.find(k => k.id === document.getElementById("pg_karyawan").value);
}
function computePayrollFromAbsensi(resetManualInputs) {
  const k = currentKaryawanForPayroll();
  const harianDiv = document.getElementById("pg_harianSummary");
  const bulananDiv = document.getElementById("pg_bulananSummary");
  if (!k) {
    pgComputed = { hariHadir: 0, jamLembur: 0, totalUpahHarian: 0, totalLembur: 0, upahKotor: 0, bonus: 0 };
    refreshPenggajianSummary();
    return;
  }
  const isBulanan = k.tipeGaji === "Bulanan";
  harianDiv.style.display = isBulanan ? "none" : "flex";
  bulananDiv.style.display = isBulanan ? "flex" : "none";
  document.getElementById("pg_upahKotorLabel").textContent = isBulanan ? "Gaji Kotor" : "Upah Kotor";

  if (isBulanan) {
    document.getElementById("pg_gajiBulananDisplay").textContent = rupiah(k.gajiBulanan || 0);
    pgComputed = { hariHadir: 0, jamLembur: 0, totalUpahHarian: 0, totalLembur: 0, upahKotor: k.gajiBulanan || 0, bonus: 0 };
    if (resetManualInputs) {
      document.getElementById("pg_target").value = formatNumberInput(k.targetBulanan || 0);
      document.getElementById("pg_realisasi").value = "";
      document.getElementById("pg_persenBonus").value = k.persenBonus || 0;
      document.getElementById("pg_uangMakan").value = formatNumberInput(0);
      document.getElementById("pg_bon").value = formatNumberInput(0);
      document.getElementById("pg_potonganPinjaman").value = formatNumberInput(0);
    }
  } else {
    const mulai = document.getElementById("pg_mulai").value;
    const selesai = document.getElementById("pg_selesai").value;
    const inRange = !mulai || !selesai ? [] : (k.absensi || []).filter(a => a.tanggal >= mulai && a.tanggal <= selesai);
    const hariHadir = inRange.filter(a => a.hadir).length;
    const jamLembur = inRange.filter(a => a.hadir).reduce((s, a) => s + (a.jamLembur || 0), 0);
    const totalUpahHarian = hariHadir * (k.upahHarian || 0);
    const totalLembur = jamLembur * (k.tarifLembur || 0);
    pgComputed = { hariHadir, jamLembur, totalUpahHarian, totalLembur, upahKotor: totalUpahHarian + totalLembur, bonus: 0 };
    if (resetManualInputs) {
      document.getElementById("pg_uangMakan").value = formatNumberInput((k.uangMakanHarian || 0) * 7);
      document.getElementById("pg_bon").value = formatNumberInput(0);
      document.getElementById("pg_potonganPinjaman").value = formatNumberInput(0);
    }
  }
  refreshPenggajianSummary();
}
function refreshPenggajianSummary() {
  const k = currentKaryawanForPayroll();
  const isBulanan = k && k.tipeGaji === "Bulanan";
  let upahKotor;
  if (isBulanan) {
    const target = parseNumberInput(document.getElementById("pg_target").value);
    const realisasi = parseNumberInput(document.getElementById("pg_realisasi").value);
    const persen = parseFloat(document.getElementById("pg_persenBonus").value) || 0;
    const bonus = hitungBonusTarget(target, realisasi, persen);
    document.getElementById("pg_bonusTarget").textContent = rupiah(bonus);
    upahKotor = (k.gajiBulanan || 0) + bonus;
    pgComputed.bonus = bonus;
    pgComputed.target = target;
    pgComputed.realisasi = realisasi;
    pgComputed.persenBonus = persen;
    pgComputed.upahKotor = upahKotor;
  } else {
    document.getElementById("pg_hariHadir").textContent = `${pgComputed.hariHadir} hari`;
    document.getElementById("pg_totalUpahHarian").textContent = rupiah(pgComputed.totalUpahHarian);
    document.getElementById("pg_jamLembur").textContent = `${pgComputed.jamLembur} jam`;
    document.getElementById("pg_totalLembur").textContent = rupiah(pgComputed.totalLembur);
    upahKotor = pgComputed.upahKotor;
  }
  document.getElementById("pg_upahKotor").textContent = rupiah(upahKotor);
  const uangMakan = parseNumberInput(document.getElementById("pg_uangMakan").value);
  const bon = parseNumberInput(document.getElementById("pg_bon").value);
  const potonganPinjaman = parseNumberInput(document.getElementById("pg_potonganPinjaman").value);
  const sisaSebelum = k ? sisaPinjaman(k) : 0;
  const sisaSesudah = sisaSebelum - potonganPinjaman;
  const gajiBersih = upahKotor - uangMakan - bon - potonganPinjaman;
  document.getElementById("pg_sisaSebelum").textContent = rupiah(sisaSebelum);
  document.getElementById("pg_sisaSesudah").textContent = rupiah(sisaSesudah);
  document.getElementById("pg_gajiBersih").textContent = rupiah(gajiBersih);
}
document.getElementById("pg_karyawan").addEventListener("change", () => computePayrollFromAbsensi(true));
document.getElementById("pg_mulai").addEventListener("change", () => computePayrollFromAbsensi(false));
document.getElementById("pg_selesai").addEventListener("change", () => computePayrollFromAbsensi(false));
document.getElementById("pg_hitungBtn").addEventListener("click", () => computePayrollFromAbsensi(false));
["pg_uangMakan", "pg_bon", "pg_potonganPinjaman", "pg_target", "pg_realisasi"].forEach(id => {
  attachNumberFormatting(document.getElementById(id));
  document.getElementById(id).addEventListener("input", refreshPenggajianSummary);
});
document.getElementById("pg_persenBonus").addEventListener("input", refreshPenggajianSummary);

function renderPenggajianRiwayat() {
  const k = currentKaryawanForPayroll();
  const tbody = document.querySelector("#pg_riwayatTable tbody");
  tbody.innerHTML = "";
  if (!k || !(k.slipGaji || []).length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Belum ada riwayat slip gaji</td></tr>';
    return;
  }
  const rows = k.slipGaji.slice().sort((a, b) => (b.mulai || "").localeCompare(a.mulai || ""));
  rows.forEach(sl => {
    const tr = document.createElement("tr");
    const keterangan = sl.tipeGaji === "Bulanan" ? "Bulanan + bonus" : `${sl.hariHadir} hari`;
    tr.innerHTML = `
      <td>${formatTanggal(sl.mulai)} — ${formatTanggal(sl.selesai)}</td>
      <td class="num">${keterangan}</td>
      <td class="num">${rupiah(sl.upahKotor)}</td>
      <td class="num">${rupiah(slipTotalPotongan(sl))}</td>
      <td class="num">${rupiah(slipGajiBersih(sl))}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-print-slip="${sl.id}" title="Cetak Ulang">🖨️</button>
          <button class="icon-btn" data-delete-slip="${sl.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
document.getElementById("pg_riwayatTable").addEventListener("click", e => {
  const printBtn = e.target.closest("[data-print-slip]");
  const delBtn = e.target.closest("[data-delete-slip]");
  const k = currentKaryawanForPayroll();
  if (!k) return;
  if (printBtn) {
    const sl = k.slipGaji.find(s => s.id === printBtn.dataset.printSlip);
    if (sl) printSlipGaji(k, sl);
  } else if (delBtn) {
    if (confirm("Hapus slip gaji ini? Sisa pinjaman akan otomatis dihitung ulang tanpa potongan dari slip ini.")) {
      k.slipGaji = k.slipGaji.filter(s => s.id !== delBtn.dataset.deleteSlip);
      saveState();
      renderPenggajianRiwayat();
      refreshPenggajianSummary();
      renderKaryawanList();
    }
  }
});
document.getElementById("pg_simpanCetakBtn").addEventListener("click", () => {
  const k = currentKaryawanForPayroll();
  const mulai = document.getElementById("pg_mulai").value;
  const selesai = document.getElementById("pg_selesai").value;
  if (!k || !mulai || !selesai) { alert("Pilih karyawan dan periode terlebih dahulu."); return; }
  const isBulanan = k.tipeGaji === "Bulanan";
  const slip = {
    id: uid(),
    mulai, selesai,
    namaKaryawan: k.nama,
    jabatan: k.jabatan,
    tipeGaji: isBulanan ? "Bulanan" : "Harian",
    uangMakan: parseNumberInput(document.getElementById("pg_uangMakan").value),
    bon: parseNumberInput(document.getElementById("pg_bon").value),
    potonganPinjaman: parseNumberInput(document.getElementById("pg_potonganPinjaman").value),
    sisaSebelum: sisaPinjaman(k),
    tanggalDibuat: new Date().toISOString().slice(0, 10)
  };
  if (isBulanan) {
    slip.gajiBulanan = k.gajiBulanan || 0;
    slip.target = pgComputed.target || 0;
    slip.realisasi = pgComputed.realisasi || 0;
    slip.persenBonus = pgComputed.persenBonus || 0;
    slip.bonus = pgComputed.bonus || 0;
    slip.upahKotor = slip.gajiBulanan + slip.bonus;
  } else {
    slip.hariHadir = pgComputed.hariHadir;
    slip.jamLembur = pgComputed.jamLembur;
    slip.upahHarian = k.upahHarian;
    slip.tarifLembur = k.tarifLembur;
    slip.totalUpahHarian = pgComputed.totalUpahHarian;
    slip.totalLembur = pgComputed.totalLembur;
    slip.upahKotor = pgComputed.upahKotor;
  }
  slip.sisaSesudah = slip.sisaSebelum - slip.potonganPinjaman;
  if (!k.slipGaji) k.slipGaji = [];
  k.slipGaji.push(slip);
  saveState();
  renderPenggajianRiwayat();
  refreshPenggajianSummary();
  renderKaryawanList();
  printSlipGaji(k, slip);
});

function buildSlipGajiPrintHtml(k, sl) {
  return `
    <div class="letterhead">
      <div class="letterhead-logo">${LOGO_SVG}</div>
      <div class="letterhead-text">
        <div class="lh-name">${escapeHtml(state.company || "CV. Mitra Creative")}</div>
        <div class="lh-tagline">CONTRACTOR SIPIL - ADVERTISING - KONTRUKSI - PENGADAAN BARANG DAN JASA</div>
        <div class="lh-address">${escapeHtml(state.alamat || COMPANY_ADDRESS)} - ${escapeHtml(state.telepon || COMPANY_PHONE)}</div>
      </div>
    </div>
    <div class="letterhead-rule"></div>
    <h3 style="text-align:center; margin:6px 0 16px; letter-spacing:.5px;">SLIP GAJI KARYAWAN</h3>
    <table class="meta-table" style="margin-bottom:14px;">
      <tr><td>Nama</td><td>:</td><td><strong>${escapeHtml(sl.namaKaryawan)}</strong></td></tr>
      <tr><td>Jabatan</td><td>:</td><td>${escapeHtml(sl.jabatan || "-")}</td></tr>
      <tr><td>Periode</td><td>:</td><td>${formatTanggal(sl.mulai)} — ${formatTanggal(sl.selesai)}</td></tr>
    </table>
    <table class="doc-items">
      <thead><tr><th>Uraian</th><th>Keterangan</th><th class="r">Jumlah</th></tr></thead>
      <tbody>
        ${sl.tipeGaji === "Bulanan" ? `
        <tr><td>Gaji Bulanan</td><td>Gaji tetap bulanan</td><td class="r">${rupiah(sl.gajiBulanan)}</td></tr>
        <tr><td>Bonus Target</td><td>Realisasi ${rupiah(sl.realisasi)} − Target ${rupiah(sl.target)} × ${sl.persenBonus}%</td><td class="r">${rupiah(sl.bonus)}</td></tr>
        ` : `
        <tr><td>Upah Harian</td><td>${sl.hariHadir} hari × ${rupiah(sl.upahHarian)}</td><td class="r">${rupiah(sl.totalUpahHarian)}</td></tr>
        <tr><td>Lembur</td><td>${sl.jamLembur} jam × ${rupiah(sl.tarifLembur)}</td><td class="r">${rupiah(sl.totalLembur)}</td></tr>
        `}
      </tbody>
    </table>
    <table class="doc-summary-table">
      <tr class="total-row"><td>Upah Kotor</td><td class="r">${rupiah(sl.upahKotor)}</td></tr>
      <tr><td>Uang Makan (sudah diterima)</td><td class="r">- ${rupiah(sl.uangMakan)}</td></tr>
      <tr><td>Bon Mingguan</td><td class="r">- ${rupiah(sl.bon)}</td></tr>
      <tr><td>Potongan Pinjaman</td><td class="r">- ${rupiah(sl.potonganPinjaman)}</td></tr>
      <tr class="total-row"><td>Gaji Bersih (Take Home)</td><td class="r">${rupiah(slipGajiBersih(sl))}</td></tr>
    </table>
    <p class="doc-p">Sisa Pinjaman Sebelum: <strong>${rupiah(sl.sisaSebelum)}</strong> &nbsp;→&nbsp; Sisa Pinjaman Sesudah: <strong>${rupiah(sl.sisaSesudah)}</strong></p>
    <div style="display:flex; justify-content:space-between; margin-top:30px; font-size:12.5px;">
      <div>
        Diterima oleh,
        <div class="sign-space"></div>
        <strong>${escapeHtml(sl.namaKaryawan)}</strong>
      </div>
      <div style="text-align:right;">
        Dibayar oleh,<br>${escapeHtml(state.company || "CV. Mitra Creative")}
        <div class="sign-space"></div>
        <strong>${escapeHtml(state.ownerNama)}</strong><br>${escapeHtml(state.ownerJabatan)}
      </div>
    </div>
  `;
}
function printSlipGaji(k, sl) {
  document.getElementById("printArea").innerHTML = buildSlipGajiPrintHtml(k, sl);
  document.body.classList.add("printing-quote");
  window.print();
}

// ===== AHSP / RAB / Penawaran calculations =====
function ahspHarga(item) {
  if (item.mode === "manual") return item.hargaManual || 0;
  const subtotal = (item.komponen || []).reduce((s, k) => s + (k.koefisien || 0) * (k.harga || 0), 0);
  return Math.round(subtotal * (1 + (item.overhead || 0) / 100));
}
function itemsSubtotal(items) {
  return (items || []).reduce((s, it) => s + (it.volume || 0) * (it.hargaSatuan || 0), 0);
}
function rabTotals(rab) {
  const subtotal = itemsSubtotal(rab.items);
  const ppnValue = subtotal * (rab.ppn || 0) / 100;
  const pphValue = subtotal * (rab.pph || 0) / 100;
  const total = subtotal + ppnValue + pphValue + (rab.biayaLain || 0);
  return { subtotal, ppnValue, pphValue, total };
}
function penawaranTotals(pw) {
  const subtotal = itemsSubtotal(pw.items);
  const diskonValue = subtotal * (pw.diskon || 0) / 100;
  const dpp = subtotal - diskonValue;
  const ppnValue = dpp * (pw.ppn || 0) / 100;
  const pphValue = dpp * (pw.pph || 0) / 100;
  const total = dpp + ppnValue + pphValue;
  return { subtotal, diskonValue, dpp, ppnValue, pphValue, total };
}
const ROMAWI_BULAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
function nextPenawaranNomor() {
  state.penawaranCounter = (state.penawaranCounter || 0) + 1;
  const n = String(state.penawaranCounter).padStart(3, "0");
  const d = new Date();
  return `${n}/MC-PH/${ROMAWI_BULAN[d.getMonth()]}/${d.getFullYear()}`;
}
function defaultSyarat() {
  return "1. Harga sudah termasuk PPh Final 0,5% dan PPN (jika berlaku) sesuai ketentuan yang berlaku.\n2. Pembayaran: DP 50% saat SPK diterbitkan, sisa 50% saat pekerjaan selesai (BAST).\n3. Penawaran ini berlaku 14 (empat belas) hari kalender sejak tanggal surat.\n4. Waktu pengerjaan disepakati bersama setelah SPK/kontrak ditandatangani.";
}
function defaultPenutup() {
  return "Demikian penawaran harga ini kami sampaikan. Besar harapan kami dapat bekerja sama dengan Bapak/Ibu. Atas perhatian dan kerja samanya kami ucapkan terima kasih.";
}
const LOGO_SVG = `<svg viewBox="0 0 64 64" width="52" height="52" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f5a623"/>
      <stop offset="1" stop-color="#d0221e"/>
    </linearGradient>
  </defs>
  <path d="M4 8 L20 8 L20 40 Q20 48 26 48 Q32 48 32 40 L32 8 L48 8 L48 40 Q48 56 32 56 Q16 56 16 40 Z" fill="url(#lgGrad)"/>
  <path d="M20 8 L20 32 Q20 40 26 40 Q28 40 28 34 L28 8 Z" fill="#f7c948" opacity="0.9"/>
</svg>`;

// ===== Rendering: AHSP =====
function renderAhsp() {
  const filterSel = document.getElementById("ah_filterKategori");
  if (filterSel.options.length <= 1) {
    KATEGORI_PEKERJAAN.forEach(k => filterSel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`));
  }
  const search = (document.getElementById("ah_search").value || "").toLowerCase();
  const filterKategori = filterSel.value;
  let rows = state.ahsp.slice().sort((a, b) => a.kategori.localeCompare(b.kategori) || a.uraian.localeCompare(b.uraian));
  if (filterKategori) rows = rows.filter(a => a.kategori === filterKategori);
  if (search) rows = rows.filter(a => (a.uraian || "").toLowerCase().includes(search) || (a.kode || "").toLowerCase().includes(search));

  const tbody = document.querySelector("#ah_table tbody");
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Belum ada item AHSP</td></tr>';
    return;
  }
  rows.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(a.kategori)}</td>
      <td>${escapeHtml(a.kode || "-")}</td>
      <td>${escapeHtml(a.uraian)}</td>
      <td>${escapeHtml(a.satuan)}</td>
      <td class="num">${rupiah(ahspHarga(a))}</td>
      <td>${a.mode === "manual" ? "Manual" : "Rincian Komponen"}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit-ahsp="${a.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-ahsp="${a.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Modal: AHSP item =====
const ahspModal = document.getElementById("ahspModal");
let ahspKomponenRows = [];

function openAhspModal(existing) {
  document.getElementById("ah_id").value = existing ? existing.id : "";
  document.getElementById("ahspModalTitle").textContent = existing ? "Edit Item AHSP" : "Tambah Item AHSP";
  const kategoriSel = document.getElementById("ah_kategori");
  if (kategoriSel.options.length === 0) {
    kategoriSel.innerHTML = KATEGORI_PEKERJAAN.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("");
  }
  document.getElementById("satuanList").innerHTML = SATUAN_LIST.map(s => `<option value="${escapeHtml(s)}">`).join("");

  kategoriSel.value = existing ? existing.kategori : KATEGORI_PEKERJAAN[0];
  document.getElementById("ah_kode").value = existing ? (existing.kode || "") : "";
  document.getElementById("ah_uraian").value = existing ? existing.uraian : "";
  document.getElementById("ah_satuan").value = existing ? existing.satuan : "";
  document.getElementById("ah_mode").value = existing ? existing.mode : "manual";
  document.getElementById("ah_hargaManual").value = existing ? formatNumberInput(existing.hargaManual || 0) : "";
  document.getElementById("ah_overhead").value = existing ? (existing.overhead ?? 10) : 10;

  ahspKomponenRows = existing && existing.komponen ? JSON.parse(JSON.stringify(existing.komponen)) : [];
  renderKomponenRows();
  toggleAhspMode();
  ahspModal.classList.add("open");
}
function toggleAhspMode() {
  const mode = document.getElementById("ah_mode").value;
  document.getElementById("ah_manualGroup").style.display = mode === "manual" ? "block" : "none";
  document.getElementById("ah_detailGroup").style.display = mode === "detail" ? "block" : "none";
}
document.getElementById("ah_mode").addEventListener("change", toggleAhspMode);

function renderKomponenRows() {
  const tbody = document.querySelector("#ah_komponenTable tbody");
  tbody.innerHTML = "";
  ahspKomponenRows.forEach((k, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td><select class="komp-jenis">${JENIS_KOMPONEN.map(j => `<option value="${j}" ${k.jenis === j ? "selected" : ""}>${j}</option>`).join("")}</select></td>
      <td><input type="text" class="komp-uraian" value="${escapeHtml(k.uraian || "")}" placeholder="mis. Semen PC"></td>
      <td><input type="text" class="komp-satuan" value="${escapeHtml(k.satuan || "")}" placeholder="kg"></td>
      <td class="num"><input type="text" inputmode="decimal" class="komp-koef" value="${k.koefisien || ""}" style="text-align:right"></td>
      <td class="num"><input type="text" inputmode="numeric" class="komp-harga" value="${formatNumberInput(k.harga || 0)}" style="text-align:right"></td>
      <td class="num komp-jumlah">${rupiah((k.koefisien || 0) * (k.harga || 0))}</td>
      <td><button type="button" class="icon-btn" data-remove-komponen="${idx}">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });
  document.querySelectorAll("#ah_komponenTable .komp-harga").forEach(attachNumberFormatting);
  recalcAhspTotals();
}
document.querySelector("#ah_komponenTable tbody").addEventListener("input", e => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const idx = Number(tr.dataset.idx);
  const row = ahspKomponenRows[idx];
  if (!row) return;
  row.jenis = tr.querySelector(".komp-jenis").value;
  row.uraian = tr.querySelector(".komp-uraian").value;
  row.satuan = tr.querySelector(".komp-satuan").value;
  row.koefisien = parseFloat(tr.querySelector(".komp-koef").value.replace(",", ".")) || 0;
  row.harga = parseNumberInput(tr.querySelector(".komp-harga").value);
  tr.querySelector(".komp-jumlah").textContent = rupiah(row.koefisien * row.harga);
  recalcAhspTotals();
});
document.querySelector("#ah_komponenTable tbody").addEventListener("click", e => {
  const btn = e.target.closest("[data-remove-komponen]");
  if (btn) {
    ahspKomponenRows.splice(Number(btn.dataset.removeKomponen), 1);
    renderKomponenRows();
  }
});
document.getElementById("ah_addKomponenBtn").addEventListener("click", () => {
  ahspKomponenRows.push({ jenis: "Bahan", uraian: "", satuan: "", koefisien: 0, harga: 0 });
  renderKomponenRows();
});
document.getElementById("ah_overhead").addEventListener("input", recalcAhspTotals);
function recalcAhspTotals() {
  const subtotal = ahspKomponenRows.reduce((s, k) => s + (k.koefisien || 0) * (k.harga || 0), 0);
  const overhead = parseFloat(document.getElementById("ah_overhead").value) || 0;
  document.getElementById("ah_komponenSubtotal").textContent = rupiah(subtotal);
  document.getElementById("ah_totalHsp").textContent = rupiah(Math.round(subtotal * (1 + overhead / 100)));
}
attachNumberFormatting(document.getElementById("ah_hargaManual"));
document.querySelector("[data-open-modal='ahsp']").addEventListener("click", () => openAhspModal(null));
document.getElementById("ah_search").addEventListener("input", renderAhsp);
document.getElementById("ah_filterKategori").addEventListener("change", renderAhsp);
document.getElementById("ahspForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("ah_id").value;
  const item = {
    id: id || uid(),
    kategori: document.getElementById("ah_kategori").value,
    kode: document.getElementById("ah_kode").value.trim(),
    uraian: document.getElementById("ah_uraian").value.trim(),
    satuan: document.getElementById("ah_satuan").value.trim(),
    mode: document.getElementById("ah_mode").value,
    hargaManual: parseNumberInput(document.getElementById("ah_hargaManual").value),
    overhead: parseFloat(document.getElementById("ah_overhead").value) || 0,
    komponen: JSON.parse(JSON.stringify(ahspKomponenRows))
  };
  const idx = state.ahsp.findIndex(a => a.id === id);
  if (idx >= 0) state.ahsp[idx] = item; else state.ahsp.push(item);
  saveState();
  renderAll();
  closeModals();
});
document.getElementById("ah_table").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-ahsp]");
  const delBtn = e.target.closest("[data-delete-ahsp]");
  if (editBtn) {
    const a = state.ahsp.find(x => x.id === editBtn.dataset.editAhsp);
    if (a) openAhspModal(a);
  } else if (delBtn) {
    if (confirm("Hapus item AHSP ini?")) {
      state.ahsp = state.ahsp.filter(x => x.id !== delBtn.dataset.deleteAhsp);
      saveState();
      renderAll();
    }
  }
});

// ===== Shared item modal (used by RAB & Penawaran) =====
const itemModal = document.getElementById("itemModal");
let itemModalCtx = null;
function getDoc(ctx) {
  if (!ctx) return null;
  return ctx.kind === "rab" ? state.proyekRab.find(r => r.id === ctx.docId) : state.penawaran.find(p => p.id === ctx.docId);
}
function openItemModal(ctx, existing) {
  itemModalCtx = { ...ctx, itemId: existing ? existing.id : null };
  document.getElementById("itemModalTitle").textContent = existing ? "Edit Item" : "Tambah Item";
  document.getElementById("it_id").value = existing ? existing.id : "";

  const pickSel = document.getElementById("it_ahspPick");
  pickSel.innerHTML = '<option value="">— Isi manual —</option>' +
    state.ahsp.slice().sort((a, b) => a.kategori.localeCompare(b.kategori) || a.uraian.localeCompare(b.uraian))
      .map(a => `<option value="${a.id}">${escapeHtml(a.kategori)} — ${escapeHtml(a.uraian)} (${rupiah(ahspHarga(a))}/${escapeHtml(a.satuan)})</option>`).join("");
  pickSel.value = "";

  document.getElementById("satuanList2").innerHTML = SATUAN_LIST.map(s => `<option value="${escapeHtml(s)}">`).join("");

  document.getElementById("it_uraian").value = existing ? existing.uraian : "";
  document.getElementById("it_satuan").value = existing ? existing.satuan : "";
  document.getElementById("it_volume").value = existing ? String(existing.volume) : "";
  document.getElementById("it_harga").value = existing ? formatNumberInput(existing.hargaSatuan) : "";
  updateItemJumlahPreview();
  itemModal.classList.add("open");
}
document.getElementById("it_ahspPick").addEventListener("change", () => {
  const a = state.ahsp.find(x => x.id === document.getElementById("it_ahspPick").value);
  if (a) {
    document.getElementById("it_uraian").value = a.uraian;
    document.getElementById("it_satuan").value = a.satuan;
    document.getElementById("it_harga").value = formatNumberInput(ahspHarga(a));
    updateItemJumlahPreview();
  }
});
["it_volume", "it_harga"].forEach(id => document.getElementById(id).addEventListener("input", updateItemJumlahPreview));
attachNumberFormatting(document.getElementById("it_harga"));
function updateItemJumlahPreview() {
  const vol = parseFloat((document.getElementById("it_volume").value || "").replace(",", ".")) || 0;
  const harga = parseNumberInput(document.getElementById("it_harga").value);
  document.getElementById("it_jumlah").value = rupiah(vol * harga);
}
document.getElementById("itemForm").addEventListener("submit", e => {
  e.preventDefault();
  const doc = getDoc(itemModalCtx);
  if (!doc) { closeModals(); return; }
  const item = {
    id: itemModalCtx.itemId || uid(),
    uraian: document.getElementById("it_uraian").value.trim(),
    satuan: document.getElementById("it_satuan").value.trim(),
    volume: parseFloat((document.getElementById("it_volume").value || "").replace(",", ".")) || 0,
    hargaSatuan: parseNumberInput(document.getElementById("it_harga").value)
  };
  const idx = doc.items.findIndex(x => x.id === item.id);
  if (idx >= 0) doc.items[idx] = item; else doc.items.push(item);
  saveState();
  if (itemModalCtx.kind === "rab") renderRabEditor(); else renderPwEditor();
  closeModals();
});

// ===== BOQ (.xlsx) / OCR import: fuzzy match against AHSP =====
function normalizeTokens(s) {
  return (s || "").toString().toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}
function findBestAhspMatch(text) {
  const tokens = new Set(normalizeTokens(text));
  if (!tokens.size) return null;
  let best = null, bestScore = 0;
  state.ahsp.forEach(a => {
    const aTokens = normalizeTokens(a.uraian);
    if (!aTokens.length) return;
    let overlap = 0;
    aTokens.forEach(t => { if (tokens.has(t)) overlap++; });
    const score = overlap / aTokens.length;
    if (score > bestScore) { bestScore = score; best = a; }
  });
  return bestScore >= 0.34 ? best : null;
}

// ===== BOQ (.xlsx) parsing =====
async function parseBoqWorkbook(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const parser = new DOMParser();
  async function readXml(path) {
    const file = zip.file(path);
    if (!file) return null;
    const text = await file.async("text");
    return parser.parseFromString(text, "application/xml");
  }
  const sharedStringsDoc = await readXml("xl/sharedStrings.xml");
  const sharedStrings = [];
  if (sharedStringsDoc) {
    sharedStringsDoc.querySelectorAll("si").forEach(si => sharedStrings.push(si.textContent || ""));
  }
  const relsDoc = await readXml("xl/_rels/workbook.xml.rels");
  const relMap = {};
  if (relsDoc) {
    relsDoc.querySelectorAll("Relationship").forEach(rel => { relMap[rel.getAttribute("Id")] = rel.getAttribute("Target"); });
  }
  const wbDoc = await readXml("xl/workbook.xml");
  let sheetPath = "xl/worksheets/sheet1.xml";
  if (wbDoc) {
    const sheetEl = wbDoc.querySelector("sheets sheet");
    if (sheetEl) {
      const rid = sheetEl.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      const target = rid ? relMap[rid] : null;
      if (target) sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target;
    }
  }
  const sheetDoc = await readXml(sheetPath);
  if (!sheetDoc) return [];

  function colToNum(letters) {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  }
  const grid = {};
  let maxRow = 0, maxCol = 0;
  sheetDoc.querySelectorAll("row").forEach(row => {
    const r = parseInt(row.getAttribute("r"), 10);
    if (r > maxRow) maxRow = r;
    row.querySelectorAll("c").forEach(c => {
      const ref = c.getAttribute("r");
      if (!ref) return;
      const m = ref.match(/[A-Z]+/);
      if (!m) return;
      const colNum = colToNum(m[0]);
      if (colNum > maxCol) maxCol = colNum;
      const type = c.getAttribute("t");
      const vEl = c.querySelector("v");
      const isEl = c.querySelector("is");
      let val = null;
      if (type === "s" && vEl) val = sharedStrings[parseInt(vEl.textContent, 10)] || "";
      else if (isEl) val = isEl.textContent || "";
      else if (vEl) val = vEl.textContent;
      grid[`${r},${colNum}`] = { raw: val, type };
    });
  });

  let headerRow = -1, specCol = -1, volCol = -1, satCol = -1;
  for (let r = 1; r <= maxRow && headerRow === -1; r++) {
    let sc = -1, vc = -1, tc = -1;
    for (let c = 1; c <= maxCol; c++) {
      const cell = grid[`${r},${c}`];
      if (!cell || cell.raw == null) continue;
      const txt = String(cell.raw).trim().toLowerCase();
      if (/spesifikasi/.test(txt)) sc = c;
      if (/^vol/.test(txt)) vc = c;
      if (/^sat/.test(txt)) tc = c;
    }
    if (sc > -1 && vc > -1 && tc > -1) { headerRow = r; specCol = sc; volCol = vc; satCol = tc; }
  }
  if (headerRow === -1) return [];

  const nameCols = [];
  for (let c = 2; c < specCol; c++) nameCols.push(c);

  function cellText(r, c) {
    const cell = grid[`${r},${c}`];
    if (!cell || cell.raw == null) return "";
    return String(cell.raw).trim();
  }
  function cellNumber(r, c) {
    const cell = grid[`${r},${c}`];
    if (!cell || cell.raw == null) return null;
    if (cell.type === "s" || cell.type === "str" || cell.type === "inlineStr") {
      const cleaned = String(cell.raw).replace(",", ".").replace(/[^\d.]/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    }
    const n = parseFloat(cell.raw);
    return isNaN(n) ? null : n;
  }

  const results = [];
  let pending = null;
  for (let r = headerRow + 1; r <= maxRow; r++) {
    const vol = cellNumber(r, volCol);
    const sat = cellText(r, satCol);
    const nameText = nameCols.map(c => cellText(r, c)).filter(Boolean).join(" ").trim();
    const specText = cellText(r, specCol);
    if (vol !== null && vol > 0 && sat) {
      if (pending) results.push(pending);
      pending = { uraian: nameText || specText || "Item", satuan: sat, volume: vol, matchText: [nameText, specText].filter(Boolean).join(" ") };
    } else if (pending) {
      const extra = [nameText, specText].filter(Boolean).join(" ");
      if (extra) pending.matchText += " " + extra;
    }
  }
  if (pending) results.push(pending);
  return results;
}

async function handleBoqFile(file, ctx) {
  if (typeof JSZip === "undefined") {
    alert("Gagal memuat pembaca file Excel (JSZip). Pastikan koneksi internet aktif saat pertama kali memakai fitur ini.");
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const rawRows = await parseBoqWorkbook(buf);
    if (!rawRows.length) {
      alert("Tidak ditemukan baris item (kolom VOL & SAT terisi) di file ini. Pastikan file punya header SPESIFIKASI/VOL/SAT seperti format BOQ standar.");
      return;
    }
    const rows = rawRows.map(r => {
      const match = findBestAhspMatch(r.matchText || r.uraian);
      return { uraian: r.uraian, satuan: r.satuan, volume: r.volume, hargaSatuan: match ? ahspHarga(match) : 0 };
    });
    openImportPreview(ctx, rows, null);
  } catch (err) {
    alert("Gagal membaca file BOQ: " + err.message);
  }
}

// ===== OCR image parsing =====
function extractMeasurementsFromText(text) {
  const results = [];
  const lines = text.split(/\r?\n/);
  lines.forEach(line => {
    const re = /(\d+(?:[.,]\d+)?)\s*(m²|m2|m3|m1|kg|titik|paket|ls|bh|unit)\b/gi;
    let m;
    while ((m = re.exec(line)) !== null) {
      const volume = parseFloat(m[1].replace(",", "."));
      const satuan = m[2].toLowerCase().replace("m²", "m2");
      const before = line.slice(0, m.index).trim();
      const uraian = before || line.trim() || "Item dari gambar";
      const match = findBestAhspMatch(uraian);
      results.push({ uraian, satuan, volume, hargaSatuan: match ? ahspHarga(match) : 0 });
    }
  });
  return results;
}
async function handleImageFile(file, ctx) {
  if (typeof Tesseract === "undefined") {
    alert("Gagal memuat mesin OCR (Tesseract.js). Pastikan koneksi internet aktif saat pertama kali memakai fitur ini.");
    return;
  }
  const btn = document.getElementById(ctx.kind === "rab" ? "rab_importImageBtn" : "pw_importImageBtn");
  const originalText = btn.textContent;
  btn.textContent = "⏳ Membaca gambar...";
  btn.disabled = true;
  try {
    const worker = await Tesseract.createWorker("eng");
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    const rows = extractMeasurementsFromText(text);
    openImportPreview(ctx, rows, text || "(tidak ada teks terbaca)");
    if (!rows.length) {
      alert("OCR tidak menemukan pola angka+satuan (mis. \"9.4 m2\") secara otomatis. Teks mentah hasil OCR tetap ditampilkan di pratinjau — Anda bisa tambah item manual berdasarkan teks tersebut.");
    }
  } catch (err) {
    alert("Gagal membaca gambar (OCR): " + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ===== Shared import preview modal =====
const importPreviewModal = document.getElementById("importPreviewModal");
let importPreviewRows = [];
let importPreviewCtx = null;
function openImportPreview(ctx, rows, rawText) {
  importPreviewCtx = ctx;
  importPreviewRows = rows.map(r => ({ checked: true, uraian: r.uraian, satuan: r.satuan, volume: r.volume, hargaSatuan: r.hargaSatuan || 0 }));
  document.getElementById("imp_rawTextWrap").style.display = rawText ? "block" : "none";
  document.getElementById("imp_rawText").textContent = rawText || "";
  document.getElementById("imp_count").textContent = importPreviewRows.length;
  renderImportPreviewRows();
  importPreviewModal.classList.add("open");
}
function renderImportPreviewRows() {
  const tbody = document.querySelector("#imp_table tbody");
  tbody.innerHTML = "";
  if (!importPreviewRows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Tidak ada item terdeteksi otomatis</td></tr>';
    return;
  }
  importPreviewRows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td><input type="checkbox" class="imp-checked" ${row.checked ? "checked" : ""}></td>
      <td><input type="text" class="imp-uraian" value="${escapeHtml(row.uraian)}"></td>
      <td><input type="text" class="imp-satuan" value="${escapeHtml(row.satuan)}" style="width:70px"></td>
      <td class="num"><input type="text" inputmode="decimal" class="imp-volume" value="${row.volume}" style="width:80px; text-align:right"></td>
      <td class="num"><input type="text" inputmode="numeric" class="imp-harga" value="${formatNumberInput(row.hargaSatuan)}" style="width:110px; text-align:right"></td>
      <td class="num imp-jumlah">${rupiah(row.volume * row.hargaSatuan)}</td>
    `;
    tbody.appendChild(tr);
  });
  document.querySelectorAll("#imp_table .imp-harga").forEach(attachNumberFormatting);
}
document.querySelector("#imp_table tbody").addEventListener("input", e => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const idx = Number(tr.dataset.idx);
  const row = importPreviewRows[idx];
  if (!row) return;
  row.uraian = tr.querySelector(".imp-uraian").value;
  row.satuan = tr.querySelector(".imp-satuan").value;
  row.volume = parseFloat((tr.querySelector(".imp-volume").value || "").replace(",", ".")) || 0;
  row.hargaSatuan = parseNumberInput(tr.querySelector(".imp-harga").value);
  tr.querySelector(".imp-jumlah").textContent = rupiah(row.volume * row.hargaSatuan);
});
document.querySelector("#imp_table tbody").addEventListener("change", e => {
  if (!e.target.classList.contains("imp-checked")) return;
  const tr = e.target.closest("tr");
  const idx = Number(tr.dataset.idx);
  if (importPreviewRows[idx]) importPreviewRows[idx].checked = e.target.checked;
});
document.getElementById("imp_importBtn").addEventListener("click", () => {
  const doc = getDoc(importPreviewCtx);
  if (!doc) { closeModals(); return; }
  const toImport = importPreviewRows.filter(r => r.checked);
  toImport.forEach(r => {
    doc.items.push({ id: uid(), uraian: (r.uraian || "").trim() || "Item", satuan: (r.satuan || "").trim() || "-", volume: r.volume || 0, hargaSatuan: r.hargaSatuan || 0 });
  });
  saveState();
  if (importPreviewCtx.kind === "rab") renderRabEditor(); else renderPwEditor();
  closeModals();
  if (toImport.length) alert(`${toImport.length} item berhasil diimpor. Cek kembali volume & harga di daftar item sebelum digunakan.`);
});
function wireImportButtons(prefix, kind) {
  document.getElementById(`${prefix}_importBoqBtn`).addEventListener("click", () => document.getElementById(`${prefix}_importBoqInput`).click());
  document.getElementById(`${prefix}_importBoqInput`).addEventListener("change", e => {
    const file = e.target.files[0];
    const docId = kind === "rab" ? currentRabId : currentPwId;
    if (file && docId) handleBoqFile(file, { kind, docId });
    e.target.value = "";
  });
  document.getElementById(`${prefix}_importImageBtn`).addEventListener("click", () => document.getElementById(`${prefix}_importImageInput`).click());
  document.getElementById(`${prefix}_importImageInput`).addEventListener("change", e => {
    const file = e.target.files[0];
    const docId = kind === "rab" ? currentRabId : currentPwId;
    if (file && docId) handleImageFile(file, { kind, docId });
    e.target.value = "";
  });
}
wireImportButtons("rab", "rab");
wireImportButtons("pw", "pw");

// ===== Rendering: RAB =====
let currentRabId = null;
function renderRabList() {
  const tbody = document.querySelector("#rab_table tbody");
  tbody.innerHTML = "";
  const rows = state.proyekRab.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Belum ada RAB</td></tr>';
    return;
  }
  rows.forEach(r => {
    const { total } = rabTotals(r);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.nama || "(Tanpa nama)")}${r.klien ? " — " + escapeHtml(r.klien) : ""}</td>
      <td>${escapeHtml(r.kategori || "-")}</td>
      <td>${formatTanggal(r.tanggal)}</td>
      <td class="num">${rupiah(total)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-open-rab="${r.id}" title="Buka">📂</button>
          <button class="icon-btn" data-delete-rab="${r.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function showRabList() {
  currentRabId = null;
  document.getElementById("rab_listView").style.display = "block";
  document.getElementById("rab_editorView").style.display = "none";
  renderRabList();
}
function showRabEditor(id) {
  currentRabId = id;
  document.getElementById("rab_listView").style.display = "none";
  document.getElementById("rab_editorView").style.display = "block";
  renderRabEditor();
}
function renderRabEditor() {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (!rab) { showRabList(); return; }
  const kategoriSel = document.getElementById("rab_kategori");
  if (kategoriSel.options.length === 0) kategoriSel.innerHTML = KATEGORI_PEKERJAAN.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("");

  if (document.activeElement.id !== "rab_nama") document.getElementById("rab_nama").value = rab.nama || "";
  if (document.activeElement.id !== "rab_klien") document.getElementById("rab_klien").value = rab.klien || "";
  if (document.activeElement.id !== "rab_lokasi") document.getElementById("rab_lokasi").value = rab.lokasi || "";
  kategoriSel.value = rab.kategori || KATEGORI_PEKERJAAN[0];
  document.getElementById("rab_tanggal").value = rab.tanggal || new Date().toISOString().slice(0, 10);
  document.getElementById("rab_ppn").value = rab.ppn ?? 0;
  document.getElementById("rab_pph").value = rab.pph ?? 0;
  const biayaLainInput = document.getElementById("rab_biayaLain");
  if (document.activeElement !== biayaLainInput) biayaLainInput.value = formatNumberInput(rab.biayaLain || 0);

  const tbody = document.querySelector("#rab_itemsTable tbody");
  tbody.innerHTML = "";
  if (!rab.items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Belum ada item pekerjaan</td></tr>';
  } else {
    rab.items.forEach(it => {
      const jumlah = (it.volume || 0) * (it.hargaSatuan || 0);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(it.uraian)}</td>
        <td>${escapeHtml(it.satuan)}</td>
        <td class="num">${it.volume}</td>
        <td class="num">${rupiah(it.hargaSatuan)}</td>
        <td class="num">${rupiah(jumlah)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-edit-item="${it.id}" title="Edit">✏️</button>
            <button class="icon-btn" data-delete-item="${it.id}" title="Hapus">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  refreshRabTotals();
}
function refreshRabTotals() {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (!rab) return;
  const { subtotal, ppnValue, pphValue, total } = rabTotals(rab);
  document.getElementById("rab_subtotal").textContent = rupiah(subtotal);
  document.getElementById("rab_ppnValue").textContent = rupiah(ppnValue);
  document.getElementById("rab_pphValue").textContent = rupiah(pphValue);
  document.getElementById("rab_total").textContent = rupiah(total);
}
document.getElementById("rab_addBtn").addEventListener("click", () => {
  const rab = { id: uid(), nama: "", klien: "", lokasi: "", kategori: KATEGORI_PEKERJAAN[0], tanggal: new Date().toISOString().slice(0, 10), ppn: 0, pph: 0.5, biayaLain: 0, items: [] };
  state.proyekRab.push(rab);
  saveState();
  showRabEditor(rab.id);
});
document.getElementById("rab_backBtn").addEventListener("click", showRabList);
document.getElementById("rab_table").addEventListener("click", e => {
  const openBtn = e.target.closest("[data-open-rab]");
  const delBtn = e.target.closest("[data-delete-rab]");
  if (openBtn) showRabEditor(openBtn.dataset.openRab);
  else if (delBtn) {
    if (confirm("Hapus RAB ini?")) {
      state.proyekRab = state.proyekRab.filter(r => r.id !== delBtn.dataset.deleteRab);
      saveState();
      renderRabList();
    }
  }
});
["rab_nama", "rab_klien", "rab_lokasi"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    const rab = state.proyekRab.find(r => r.id === currentRabId);
    if (!rab) return;
    rab[id.replace("rab_", "")] = document.getElementById(id).value;
    saveState();
  });
});
document.getElementById("rab_kategori").addEventListener("change", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.kategori = document.getElementById("rab_kategori").value; saveState(); }
});
document.getElementById("rab_tanggal").addEventListener("change", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.tanggal = document.getElementById("rab_tanggal").value; saveState(); }
});
document.getElementById("rab_ppn").addEventListener("input", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.ppn = parseFloat(document.getElementById("rab_ppn").value) || 0; saveState(); refreshRabTotals(); }
});
document.getElementById("rab_pph").addEventListener("input", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.pph = parseFloat(document.getElementById("rab_pph").value) || 0; saveState(); refreshRabTotals(); }
});
attachNumberFormatting(document.getElementById("rab_biayaLain"));
document.getElementById("rab_biayaLain").addEventListener("input", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.biayaLain = parseNumberInput(document.getElementById("rab_biayaLain").value); saveState(); refreshRabTotals(); }
});
document.getElementById("rab_addItemBtn").addEventListener("click", () => openItemModal({ kind: "rab", docId: currentRabId }, null));
document.getElementById("rab_itemsTable").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-item]");
  const delBtn = e.target.closest("[data-delete-item]");
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (!rab) return;
  if (editBtn) {
    const it = rab.items.find(x => x.id === editBtn.dataset.editItem);
    if (it) openItemModal({ kind: "rab", docId: currentRabId }, it);
  } else if (delBtn) {
    if (confirm("Hapus item ini?")) {
      rab.items = rab.items.filter(x => x.id !== delBtn.dataset.deleteItem);
      saveState();
      renderRabEditor();
    }
  }
});
function createPenawaranFromRab(rab) {
  return {
    id: uid(), nomor: nextPenawaranNomor(), tanggal: new Date().toISOString().slice(0, 10),
    kepada: rab.klien || "", alamatKlien: "", perihal: rab.nama || "", kategori: rab.kategori || KATEGORI_PEKERJAAN[0],
    status: "draft", diskon: 0, ppn: rab.ppn || 0, pph: typeof rab.pph === "number" ? rab.pph : 0.5,
    items: rab.items.map(it => ({ id: uid(), uraian: it.uraian, satuan: it.satuan, volume: it.volume, hargaSatuan: it.hargaSatuan })),
    syarat: defaultSyarat(), penutup: defaultPenutup(), ttdNama: state.ownerNama, ttdJabatan: state.ownerJabatan
  };
}
document.getElementById("rab_toPenawaranBtn").addEventListener("click", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (!rab) return;
  const pw = createPenawaranFromRab(rab);
  state.penawaran.push(pw);
  saveState();
  showPage("penawaran");
  showPwEditor(pw.id);
});

// ===== Rendering: Penawaran Harga =====
let currentPwId = null;
function pwStatusLabel(s) {
  return { draft: "Draft", terkirim: "Terkirim", disetujui: "Disetujui", ditolak: "Ditolak" }[s] || s;
}
function renderPwList() {
  const tbody = document.querySelector("#pw_table tbody");
  tbody.innerHTML = "";
  const rows = state.penawaran.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Belum ada penawaran</td></tr>';
    return;
  }
  rows.forEach(p => {
    const { total } = penawaranTotals(p);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.nomor)}</td>
      <td>${escapeHtml(p.kepada || "-")}</td>
      <td>${escapeHtml(p.perihal || "-")}</td>
      <td>${formatTanggal(p.tanggal)}</td>
      <td class="num">${rupiah(total)}</td>
      <td><span class="badge status-${p.status}">${pwStatusLabel(p.status)}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-open-pw="${p.id}" title="Buka">📂</button>
          <button class="icon-btn" data-delete-pw="${p.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function showPwList() {
  currentPwId = null;
  document.getElementById("pw_listView").style.display = "block";
  document.getElementById("pw_editorView").style.display = "none";
  renderPwList();
}
function showPwEditor(id) {
  currentPwId = id;
  document.getElementById("pw_listView").style.display = "none";
  document.getElementById("pw_editorView").style.display = "block";
  renderPwEditor();
}
function renderPwEditor() {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (!pw) { showPwList(); return; }
  const kategoriSel = document.getElementById("pw_kategori");
  if (kategoriSel.options.length === 0) kategoriSel.innerHTML = KATEGORI_PEKERJAAN.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("");

  const focusedId = document.activeElement.id;
  if (focusedId !== "pw_nomor") document.getElementById("pw_nomor").value = pw.nomor || "";
  document.getElementById("pw_tanggal").value = pw.tanggal || "";
  if (focusedId !== "pw_kepada") document.getElementById("pw_kepada").value = pw.kepada || "";
  if (focusedId !== "pw_alamatKlien") document.getElementById("pw_alamatKlien").value = pw.alamatKlien || "";
  if (focusedId !== "pw_perihal") document.getElementById("pw_perihal").value = pw.perihal || "";
  kategoriSel.value = pw.kategori || KATEGORI_PEKERJAAN[0];
  document.getElementById("pw_status").value = pw.status || "draft";
  document.getElementById("pw_diskon").value = pw.diskon ?? 0;
  document.getElementById("pw_ppn").value = pw.ppn ?? 0;
  document.getElementById("pw_pph").value = pw.pph ?? 0;
  if (focusedId !== "pw_syarat") document.getElementById("pw_syarat").value = pw.syarat || "";
  if (focusedId !== "pw_penutup") document.getElementById("pw_penutup").value = pw.penutup || "";
  if (focusedId !== "pw_ttdNama") document.getElementById("pw_ttdNama").value = pw.ttdNama || state.ownerNama;
  if (focusedId !== "pw_ttdJabatan") document.getElementById("pw_ttdJabatan").value = pw.ttdJabatan || state.ownerJabatan;

  const importSel = document.getElementById("pw_importRab");
  importSel.innerHTML = '<option value="">— Pilih RAB untuk mengisi item otomatis —</option>' +
    state.proyekRab.map(r => `<option value="${r.id}">${escapeHtml(r.nama || "(Tanpa nama)")}</option>`).join("");

  const tbody = document.querySelector("#pw_itemsTable tbody");
  tbody.innerHTML = "";
  if (!pw.items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Belum ada item</td></tr>';
  } else {
    pw.items.forEach(it => {
      const jumlah = (it.volume || 0) * (it.hargaSatuan || 0);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(it.uraian)}</td>
        <td>${escapeHtml(it.satuan)}</td>
        <td class="num">${it.volume}</td>
        <td class="num">${rupiah(it.hargaSatuan)}</td>
        <td class="num">${rupiah(jumlah)}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-edit-item="${it.id}" title="Edit">✏️</button>
            <button class="icon-btn" data-delete-item="${it.id}" title="Hapus">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  refreshPwTotals();
}
function refreshPwTotals() {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (!pw) return;
  const { subtotal, total } = penawaranTotals(pw);
  document.getElementById("pw_subtotal").textContent = rupiah(subtotal);
  document.getElementById("pw_total").textContent = rupiah(total);
}
document.getElementById("pw_addBtn").addEventListener("click", () => {
  const pw = {
    id: uid(), nomor: nextPenawaranNomor(), tanggal: new Date().toISOString().slice(0, 10),
    kepada: "", alamatKlien: "", perihal: "", kategori: KATEGORI_PEKERJAAN[0], status: "draft",
    diskon: 0, ppn: 11, pph: 0.5, items: [], syarat: defaultSyarat(), penutup: defaultPenutup(),
    ttdNama: state.ownerNama, ttdJabatan: state.ownerJabatan
  };
  state.penawaran.push(pw);
  saveState();
  showPwEditor(pw.id);
});
document.getElementById("pw_backBtn").addEventListener("click", showPwList);
document.getElementById("pw_table").addEventListener("click", e => {
  const openBtn = e.target.closest("[data-open-pw]");
  const delBtn = e.target.closest("[data-delete-pw]");
  if (openBtn) showPwEditor(openBtn.dataset.openPw);
  else if (delBtn) {
    if (confirm("Hapus penawaran ini?")) {
      state.penawaran = state.penawaran.filter(p => p.id !== delBtn.dataset.deletePw);
      saveState();
      renderPwList();
    }
  }
});
["pw_nomor", "pw_kepada", "pw_alamatKlien", "pw_perihal", "pw_syarat", "pw_penutup", "pw_ttdNama", "pw_ttdJabatan"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    const pw = state.penawaran.find(p => p.id === currentPwId);
    if (!pw) return;
    pw[id.replace("pw_", "")] = document.getElementById(id).value;
    saveState();
  });
});
document.getElementById("pw_tanggal").addEventListener("change", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.tanggal = document.getElementById("pw_tanggal").value; saveState(); }
});
document.getElementById("pw_kategori").addEventListener("change", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.kategori = document.getElementById("pw_kategori").value; saveState(); }
});
document.getElementById("pw_status").addEventListener("change", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.status = document.getElementById("pw_status").value; saveState(); }
});
document.getElementById("pw_diskon").addEventListener("input", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.diskon = parseFloat(document.getElementById("pw_diskon").value) || 0; saveState(); refreshPwTotals(); }
});
document.getElementById("pw_ppn").addEventListener("input", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.ppn = parseFloat(document.getElementById("pw_ppn").value) || 0; saveState(); refreshPwTotals(); }
});
document.getElementById("pw_pph").addEventListener("input", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.pph = parseFloat(document.getElementById("pw_pph").value) || 0; saveState(); refreshPwTotals(); }
});
document.getElementById("pw_importRab").addEventListener("change", () => {
  const sel = document.getElementById("pw_importRab");
  const rab = state.proyekRab.find(r => r.id === sel.value);
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (!rab || !pw) { sel.value = ""; return; }
  if (!confirm(`Impor ${rab.items.length} item dari RAB "${rab.nama || "(Tanpa nama)"}"? Item akan ditambahkan ke daftar item penawaran ini.`)) { sel.value = ""; return; }
  rab.items.forEach(it => pw.items.push({ id: uid(), uraian: it.uraian, satuan: it.satuan, volume: it.volume, hargaSatuan: it.hargaSatuan }));
  if (!pw.perihal) pw.perihal = rab.nama;
  if (!pw.kepada) pw.kepada = rab.klien;
  saveState();
  renderPwEditor();
  sel.value = "";
});
document.getElementById("pw_addItemBtn").addEventListener("click", () => openItemModal({ kind: "pw", docId: currentPwId }, null));
document.getElementById("pw_itemsTable").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-item]");
  const delBtn = e.target.closest("[data-delete-item]");
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (!pw) return;
  if (editBtn) {
    const it = pw.items.find(x => x.id === editBtn.dataset.editItem);
    if (it) openItemModal({ kind: "pw", docId: currentPwId }, it);
  } else if (delBtn) {
    if (confirm("Hapus item ini?")) {
      pw.items = pw.items.filter(x => x.id !== delBtn.dataset.deleteItem);
      saveState();
      renderPwEditor();
    }
  }
});

// ===== Cetak Penawaran (letterhead print) =====
function buildPenawaranPrintHtml(pw) {
  const { subtotal, diskonValue, ppnValue, pphValue, total } = penawaranTotals(pw);
  const itemsRows = pw.items.map((it, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${escapeHtml(it.uraian)}</td>
      <td class="c">${escapeHtml(it.satuan)}</td>
      <td class="r">${it.volume}</td>
      <td class="r">${rupiah(it.hargaSatuan)}</td>
      <td class="r">${rupiah((it.volume || 0) * (it.hargaSatuan || 0))}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="c">Belum ada item</td></tr>`;

  return `
    <div class="letterhead">
      <div class="letterhead-logo">${LOGO_SVG}</div>
      <div class="letterhead-text">
        <div class="lh-name">${escapeHtml(state.company || "CV. Mitra Creative")}</div>
        <div class="lh-tagline">CONTRACTOR SIPIL - ADVERTISING - KONTRUKSI - PENGADAAN BARANG DAN JASA</div>
        <div class="lh-address">${escapeHtml(state.alamat || COMPANY_ADDRESS)} - ${escapeHtml(state.telepon || COMPANY_PHONE)}</div>
      </div>
    </div>
    <div class="letterhead-rule"></div>

    <div class="doc-meta">
      <table class="meta-table">
        <tr><td>Nomor</td><td>:</td><td>${escapeHtml(pw.nomor)}</td></tr>
        <tr><td>Lampiran</td><td>:</td><td>1 (satu) berkas</td></tr>
        <tr><td>Perihal</td><td>:</td><td>${escapeHtml(pw.perihal || "Penawaran Harga")}</td></tr>
      </table>
      <div class="doc-date">Semarang, ${formatTanggal(pw.tanggal)}</div>
    </div>

    <div class="doc-kepada">
      Kepada Yth,<br>
      <strong>${escapeHtml(pw.kepada || "-")}</strong><br>
      ${escapeHtml(pw.alamatKlien || "")}
    </div>

    <p class="doc-p">Dengan hormat,<br>
    Bersama ini kami sampaikan penawaran harga untuk pekerjaan <strong>${escapeHtml(pw.perihal || "-")}</strong> dengan rincian sebagai berikut:</p>

    <table class="doc-items">
      <thead><tr><th>No</th><th>Uraian Pekerjaan</th><th class="c">Satuan</th><th class="r">Volume</th><th class="r">Harga Satuan</th><th class="r">Jumlah</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <table class="doc-summary-table">
      <tr><td>Subtotal</td><td class="r">${rupiah(subtotal)}</td></tr>
      ${pw.diskon ? `<tr><td>Diskon (${pw.diskon}%)</td><td class="r">- ${rupiah(diskonValue)}</td></tr>` : ""}
      ${pw.ppn ? `<tr><td>PPN (${pw.ppn}%)</td><td class="r">${rupiah(ppnValue)}</td></tr>` : ""}
      ${pw.pph ? `<tr><td>PPh (${pw.pph}%)</td><td class="r">${rupiah(pphValue)}</td></tr>` : ""}
      <tr class="total-row"><td>Total Penawaran</td><td class="r">${rupiah(total)}</td></tr>
    </table>

    <div class="doc-syarat">
      <strong>Syarat &amp; Ketentuan:</strong>
      <div class="syarat-text">${(pw.syarat || "").split("\n").map(l => `<div>${escapeHtml(l)}</div>`).join("")}</div>
    </div>

    <p class="doc-p">${escapeHtml(pw.penutup || "")}</p>

    <div class="doc-signature">
      Hormat kami,<br>${escapeHtml(state.company || "CV. Mitra Creative")}
      <div class="sign-space"></div>
      <strong>${escapeHtml(pw.ttdNama || state.ownerNama)}</strong><br>
      ${escapeHtml(pw.ttdJabatan || state.ownerJabatan)}
    </div>
  `;
}
document.getElementById("pw_printBtn").addEventListener("click", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (!pw) return;
  document.getElementById("printArea").innerHTML = buildPenawaranPrintHtml(pw);
  document.body.classList.add("printing-quote");
  window.print();
});
window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-quote");
});

function renderAll() {
  renderDashboard();
  renderKasBook("kasUsaha");
  renderKasBook("kasPribadi");
  renderProyek();
  renderKaryawanList();
  { const activeSubtab = document.querySelector(".subtab-item.active");
    if (activeSubtab && activeSubtab.dataset.subtab === "absensi") renderAbsensiPanel();
    if (activeSubtab && activeSubtab.dataset.subtab === "penggajian") renderPenggajianPanel(); }
  document.getElementById("stok_listView").style.display = currentStokId ? "none" : "block";
  document.getElementById("stok_riwayatView").style.display = currentStokId ? "block" : "none";
  if (currentStokId) renderStokRiwayat(); else renderStokList();
  renderAhsp();
  document.getElementById("rab_listView").style.display = currentRabId ? "none" : "block";
  document.getElementById("rab_editorView").style.display = currentRabId ? "block" : "none";
  if (currentRabId) renderRabEditor(); else renderRabList();
  document.getElementById("pw_listView").style.display = currentPwId ? "none" : "block";
  document.getElementById("pw_editorView").style.display = currentPwId ? "block" : "none";
  if (currentPwId) renderPwEditor(); else renderPwList();
  document.getElementById("companyNameLabel").textContent = state.company || "Perusahaan Saya";
  document.getElementById("settingsCompanyName").value = state.company || "";
  document.getElementById("settingsAlamat").value = state.alamat || "";
  document.getElementById("settingsTelepon").value = state.telepon || "";
  document.getElementById("settingsOwnerNama").value = state.ownerNama || "";
  document.getElementById("settingsOwnerJabatan").value = state.ownerJabatan || "";
  document.title = `${state.company || "Laporan Keuangan"} — Laporan Keuangan`;
}

// ===== Navigation =====
function showPage(name) {
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  document.getElementById(`page-${name}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === name));
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarBackdrop").classList.remove("open");
  location.hash = name;
}
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});
document.getElementById("mobileToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarBackdrop").classList.toggle("open");
});
document.getElementById("sidebarBackdrop").addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarBackdrop").classList.remove("open");
});

// ===== Modal: transaction =====
const txnModal = document.getElementById("txnModal");
function openTxnModal(book, existing) {
  const cfg = bookConfig[book];
  document.getElementById("txn_book").value = book;
  document.getElementById("txn_id").value = existing ? existing.id : "";
  document.getElementById("txnModalTitle").textContent = existing ? "Edit Transaksi" : "Tambah Transaksi";
  document.getElementById("txn_tipe").value = existing ? existing.tipe : "Masuk";
  document.getElementById("txn_status").value = existing ? (existing.status || "lunas") : "lunas";
  document.getElementById("txn_tanggal").value = existing ? existing.tanggal : new Date().toISOString().slice(0, 10);
  document.getElementById("txn_jumlah").value = existing ? formatNumberInput(existing.jumlah) : "";
  document.getElementById("txn_keterangan").value = existing ? existing.keterangan : "";
  document.getElementById("txn_kategori").value = existing ? (existing.kategori || "") : "";
  document.getElementById("txn_extra").value = existing ? (existing.extra || "") : "";
  document.getElementById("txn_catatan").value = existing ? (existing.catatan || "") : "";
  document.getElementById("txn_extraLabel").textContent = cfg.extraLabel;

  const kategoriList = document.getElementById("kategoriList");
  kategoriList.innerHTML = cfg.kategoriList.map(k => `<option value="${escapeHtml(k)}">`).join("");
  const extraList = document.getElementById("extraList");
  extraList.innerHTML = (cfg.extraList || []).map(k => `<option value="${escapeHtml(k)}">`).join("");

  document.getElementById("txn_statusField").style.display = cfg.hasStatus ? "flex" : "none";

  txnModal.classList.add("open");
}
function closeModals() {
  document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("open"));
}
document.querySelectorAll("[data-close-modal]").forEach(el => el.addEventListener("click", closeModals));
document.querySelectorAll(".modal-backdrop").forEach(m => {
  m.addEventListener("click", e => { if (e.target === m) closeModals(); });
});
document.querySelectorAll("[data-open-modal='txn']").forEach(btn => {
  btn.addEventListener("click", () => openTxnModal(btn.dataset.book, null));
});

document.getElementById("txn_jumlah").addEventListener("input", () => {}); // placeholder, formatting attached below
attachNumberFormatting(document.getElementById("txn_jumlah"));

document.getElementById("txnForm").addEventListener("submit", e => {
  e.preventDefault();
  const book = document.getElementById("txn_book").value;
  const id = document.getElementById("txn_id").value;
  const txn = {
    id: id || uid(),
    tipe: document.getElementById("txn_tipe").value,
    status: document.getElementById("txn_status").value,
    tanggal: document.getElementById("txn_tanggal").value,
    jumlah: parseNumberInput(document.getElementById("txn_jumlah").value),
    keterangan: document.getElementById("txn_keterangan").value.trim(),
    kategori: document.getElementById("txn_kategori").value.trim(),
    extra: document.getElementById("txn_extra").value.trim(),
    catatan: document.getElementById("txn_catatan").value.trim()
  };
  const arr = state[book].transactions;
  const idx = arr.findIndex(t => t.id === id);
  if (idx >= 0) arr[idx] = txn; else arr.push(txn);
  saveState();
  renderAll();
  closeModals();
});

// Edit / delete delegation for kas tables
["ku_table", "kp_table"].forEach(tableId => {
  document.getElementById(tableId).addEventListener("click", e => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-delete]");
    if (editBtn) {
      const book = editBtn.dataset.book;
      const t = state[book].transactions.find(x => x.id === editBtn.dataset.edit);
      if (t) openTxnModal(book, t);
    } else if (delBtn) {
      const book = delBtn.dataset.book;
      if (confirm("Hapus transaksi ini?")) {
        state[book].transactions = state[book].transactions.filter(x => x.id !== delBtn.dataset.delete);
        saveState();
        renderAll();
      }
    }
  });
});

// ===== Modal: proyek =====
const proyekModal = document.getElementById("proyekModal");
function openProyekModal(existing) {
  document.getElementById("pj_id").value = existing ? existing.id : "";
  document.getElementById("proyekModalTitle").textContent = existing ? "Edit Proyek" : "Tambah Proyek";
  document.getElementById("pj_nama").value = existing ? existing.nama : "";
  document.getElementById("pj_nilai").value = existing ? formatNumberInput(existing.nilaiKontrak) : "";
  document.getElementById("pj_bahan").value = existing ? formatNumberInput(existing.biayaBahan) : "";
  document.getElementById("pj_upah").value = existing ? formatNumberInput(existing.biayaUpah) : "";
  document.getElementById("pj_lain").value = existing ? formatNumberInput(existing.biayaLain) : "";
  proyekModal.classList.add("open");
}
["pj_nilai", "pj_bahan", "pj_upah", "pj_lain"].forEach(id => attachNumberFormatting(document.getElementById(id)));

document.querySelectorAll("[data-open-modal='proyek']").forEach(btn => {
  btn.addEventListener("click", () => openProyekModal(null));
});
document.getElementById("proyekForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("pj_id").value;
  const proj = {
    id: id || uid(),
    nama: document.getElementById("pj_nama").value.trim(),
    nilaiKontrak: parseNumberInput(document.getElementById("pj_nilai").value),
    biayaBahan: parseNumberInput(document.getElementById("pj_bahan").value),
    biayaUpah: parseNumberInput(document.getElementById("pj_upah").value),
    biayaLain: parseNumberInput(document.getElementById("pj_lain").value)
  };
  const idx = state.proyek.findIndex(p => p.id === id);
  if (idx >= 0) state.proyek[idx] = proj; else state.proyek.push(proj);
  saveState();
  renderAll();
  closeModals();
});
document.getElementById("pr_table").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-proyek]");
  const delBtn = e.target.closest("[data-delete-proyek]");
  if (editBtn) {
    const p = state.proyek.find(x => x.id === editBtn.dataset.editProyek);
    if (p) openProyekModal(p);
  } else if (delBtn) {
    if (confirm("Hapus proyek ini?")) {
      state.proyek = state.proyek.filter(x => x.id !== delBtn.dataset.deleteProyek);
      saveState();
      renderAll();
    }
  }
});

// ===== Saldo awal inputs =====
["ku_saldoAwal", "kp_saldoAwal"].forEach(id => {
  const input = document.getElementById(id);
  attachNumberFormatting(input);
  input.addEventListener("change", () => {
    const book = input.dataset.book;
    state[book].saldoAwal = parseNumberInput(input.value);
    saveState();
    renderAll();
  });
});

// ===== Filters =====
["ku_search", "ku_filterTipe", "ku_filterStatus"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => renderKasBook("kasUsaha"));
});
["kp_search", "kp_filterTipe"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => renderKasBook("kasPribadi"));
});

// ===== CSV export =====
function exportCsv(book) {
  const cfg = bookConfig[book];
  const extraHeader = cfg.extraLabel;
  const headers = book === "kasUsaha"
    ? ["Tanggal", "Tipe", "Status", "Keterangan", "Kategori", extraHeader, "Jumlah", "Catatan"]
    : ["Tanggal", "Tipe", "Keterangan", "Kategori", extraHeader, "Jumlah", "Catatan"];
  const rows = state[book].transactions.slice().sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  const lines = [headers.join(",")];
  rows.forEach(t => {
    const cells = book === "kasUsaha"
      ? [t.tanggal, t.tipe, (t.status || "lunas"), t.keterangan, t.kategori, t.extra, t.jumlah, t.catatan]
      : [t.tanggal, t.tipe, t.keterangan, t.kategori, t.extra, t.jumlah, t.catatan];
    lines.push(cells.map(csvEscape).join(","));
  });
  downloadFile(`${book}_${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"), "text/csv");
}
function csvEscape(v) {
  const s = (v ?? "").toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
document.getElementById("ku_exportCsv").addEventListener("click", () => exportCsv("kasUsaha"));
document.getElementById("kp_exportCsv").addEventListener("click", () => exportCsv("kasPribadi"));

// ===== Settings =====
document.getElementById("settingsCompanyName").addEventListener("input", e => {
  state.company = e.target.value;
  saveState();
  document.getElementById("companyNameLabel").textContent = state.company || "Perusahaan Saya";
  document.title = `${state.company || "Laporan Keuangan"} — Laporan Keuangan`;
});
document.getElementById("settingsAlamat").addEventListener("input", e => { state.alamat = e.target.value; saveState(); });
document.getElementById("settingsTelepon").addEventListener("input", e => { state.telepon = e.target.value; saveState(); });
document.getElementById("settingsOwnerNama").addEventListener("input", e => { state.ownerNama = e.target.value; saveState(); });
document.getElementById("settingsOwnerJabatan").addEventListener("input", e => { state.ownerJabatan = e.target.value; saveState(); });
document.getElementById("exportJsonBtn").addEventListener("click", () => {
  downloadFile(`backup-keuangan-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(state, null, 2), "application/json");
});
document.getElementById("importJsonInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.kasUsaha || !imported.kasPribadi || !imported.proyek) throw new Error("format tidak sesuai");
      state = withDefaults(imported);
      currentRabId = null;
      currentPwId = null;
      currentStokId = null;
      saveState();
      renderAll();
      alert("Data berhasil diimpor.");
    } catch (err) {
      alert("Gagal mengimpor file: " + err.message);
    }
    e.target.value = "";
  };
  reader.readAsText(file);
});
document.getElementById("resetDataBtn").addEventListener("click", () => {
  if (confirm("Yakin ingin menghapus SEMUA data dan mengembalikan ke data awal? Tindakan ini tidak bisa dibatalkan. Sebaiknya Export Backup dulu.")) {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    saveState();
    renderAll();
    alert("Data telah direset.");
  }
});

// ===== Print =====
document.getElementById("printBtn").addEventListener("click", () => window.print());

// ===== Init =====
function init() {
  const todayEl = document.getElementById("todayLabel");
  const now = new Date();
  todayEl.textContent = formatTanggal(now.toISOString().slice(0, 10));

  const initialPage = (location.hash || "#dashboard").slice(1);
  showPage(document.getElementById(`page-${initialPage}`) ? initialPage : "dashboard");

  renderAll();
}
init();
