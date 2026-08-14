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
  if (typeof s.rabCounter !== "number") s.rabCounter = 0;
  if (!s.alamat) s.alamat = COMPANY_ADDRESS;
  if (!s.telepon) s.telepon = COMPANY_PHONE;
  if (!s.ownerNama) s.ownerNama = OWNER_INFO.nama;
  if (!s.ownerJabatan) s.ownerJabatan = OWNER_INFO.jabatan;
  if (!s.stok) s.stok = [];
  if (!s.karyawan) s.karyawan = [];
  if (!s.klien) s.klien = [];
  if (!s.pemasok) s.pemasok = [];
  if (!s.gudang) s.gudang = [];
  if (typeof s.approvalThreshold !== "number") s.approvalThreshold = 0;
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
function addDaysIso(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
  let masukLunas = 0, keluarLunas = 0, pending = 0, menungguPersetujuan = 0;
  b.transactions.forEach(t => {
    const status = t.status || "lunas";
    if (t.tipe === "Masuk") {
      if (status === "pending") pending += t.jumlah;
      else masukLunas += t.jumlah;
    } else if (t.tipe === "Keluar") {
      if (status === "menunggu_persetujuan") menungguPersetujuan += t.jumlah;
      else keluarLunas += t.jumlah;
    }
  });
  const saldoAkhir = (b.saldoAwal || 0) + masukLunas - keluarLunas;
  return { masukLunas, keluarLunas, pending, menungguPersetujuan, saldoAkhir, saldoAwal: b.saldoAwal || 0 };
}
function expenseApprovalStatus(jumlah) {
  const threshold = state.approvalThreshold || 0;
  return threshold > 0 && jumlah >= threshold ? "menunggu_persetujuan" : "lunas";
}
function proyekKasTxns(p) {
  return state.kasUsaha.transactions.filter(t => t.proyekId === p.id);
}
function sumTxns(txns, tipe, kategoris, status) {
  return txns
    .filter(t => t.tipe === tipe && kategoris.includes(t.kategori))
    .filter(t => status ? (t.status || "lunas") === status : (t.status || "lunas") !== "menunggu_persetujuan")
    .reduce((s, t) => s + (t.jumlah || 0), 0);
}
function subkonDibayar(p, subkonId) {
  return proyekKasTxns(p)
    .filter(t => t.tipe === "Keluar" && t.kategori === "Biaya Subkontraktor" && t.subkonId === subkonId && (t.status || "lunas") !== "menunggu_persetujuan")
    .reduce((s, t) => s + (t.jumlah || 0), 0);
}
function projectCalc(p) {
  const txns = proyekKasTxns(p);
  const realisasiBahan = sumTxns(txns, "Keluar", ["Biaya Bahan"]);
  const realisasiUpah = sumTxns(txns, "Keluar", ["Biaya Upah/Tenaga"]);
  const realisasiSubkon = sumTxns(txns, "Keluar", ["Biaya Subkontraktor"]);
  const realisasiLain = sumTxns(txns, "Keluar", ["Biaya Operasional", "Biaya Transport", "Biaya Alat", "Biaya Lain-lain"]);
  const totalBiaya = realisasiBahan + realisasiUpah + realisasiSubkon + realisasiLain;

  const terminDiterima = sumTxns(txns, "Masuk", ["Pendapatan Jasa", "Pendapatan Lain-lain"], "lunas");
  const terminPiutang = sumTxns(txns, "Masuk", ["Pendapatan Jasa", "Pendapatan Lain-lain"], "pending");

  const anggaranBahan = p.biayaBahan || 0;
  const anggaranUpah = p.biayaUpah || 0;
  const anggaranLain = p.biayaLain || 0;
  const anggaranSubkon = (p.subkontraktor || []).reduce((s, sk) => s + (sk.nilaiKontrak || 0), 0);

  const margin = (p.nilaiKontrak || 0) - totalBiaya;
  const marginPct = p.nilaiKontrak ? margin / p.nilaiKontrak : 0;
  let marginStatus = "critical";
  if (marginPct > 0.30) marginStatus = "good";
  else if (marginPct >= 0.15) marginStatus = "warning";

  return {
    totalBiaya, margin, marginPct, marginStatus,
    realisasiBahan, realisasiUpah, realisasiSubkon, realisasiLain,
    anggaranBahan, anggaranUpah, anggaranLain, anggaranSubkon,
    varianceBahan: anggaranBahan - realisasiBahan,
    varianceUpah: anggaranUpah - realisasiUpah,
    varianceLain: anggaranLain - realisasiLain,
    varianceSubkon: anggaranSubkon - realisasiSubkon,
    terminDiterima, terminPiutang
  };
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
      color: p.marginStatus === "good" ? "var(--good)" : p.marginStatus === "warning" ? "var(--warning)" : "var(--critical)",
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
    document.getElementById("ku_menungguPersetujuan").textContent = rupiah(sum.menungguPersetujuan);
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
  const statusLabel = { lunas: "Lunas", pending: "Piutang", menunggu_persetujuan: "Menunggu Persetujuan" };
  const statusBadgeClass = { lunas: "badge-lunas", pending: "badge-pending", menunggu_persetujuan: "badge-pending" };
  rows.forEach(t => {
    const tr = document.createElement("tr");
    const status = t.status || "lunas";
    const statusCell = book === "kasUsaha"
      ? `<td><span class="badge ${statusBadgeClass[status]}">${statusLabel[status]}</span></td>`
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
          ${status === "menunggu_persetujuan" ? `<button class="icon-btn" data-approve="${t.id}" data-book="${book}" title="Setujui">✅</button>` : ""}
          <button class="icon-btn" data-edit="${t.id}" data-book="${book}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete="${t.id}" data-book="${book}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Rendering: Proyek =====
let currentProyekId = null;
function proyekStatusLabel(status) {
  return status === "selesai" ? "Selesai" : status === "batal" ? "Batal" : "Berjalan";
}
function showProyekList() {
  currentProyekId = null;
  document.getElementById("pr_listView").style.display = "block";
  document.getElementById("pr_detailView").style.display = "none";
  renderProyekList();
}
function showProyekDetail(id) {
  currentProyekId = id;
  document.getElementById("pr_listView").style.display = "none";
  document.getElementById("pr_detailView").style.display = "block";
  renderProyekDetail();
}
function renderProyekList() {
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Belum ada proyek</td></tr>';
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  projects.forEach(p => {
    const tr = document.createElement("tr");
    const overdue = p.status === "berjalan" && p.tanggalSelesai && p.tanggalSelesai < today;
    tr.innerHTML = `
      <td>${escapeHtml(p.nama)}${p.klien ? `<div class="muted" style="font-size:12px;">${escapeHtml(p.klien)}</div>` : ""}</td>
      <td>${proyekStatusLabel(p.status)}</td>
      <td class="${overdue ? "bad" : ""}">${p.tanggalSelesai ? formatTanggal(p.tanggalSelesai) : "-"}${overdue ? " ⚠️" : ""}</td>
      <td class="num">${rupiah(p.nilaiKontrak)}</td>
      <td class="num">${rupiah(p.totalBiaya)}</td>
      <td class="num">${rupiah(p.margin)}</td>
      <td class="num"><span class="badge-margin ${p.marginStatus}">${(p.marginPct * 100).toFixed(1)}% · ${marginStatusLabel(p.marginStatus)}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-open-proyek="${p.id}" title="Buka Detail">📂</button>
          <button class="icon-btn" data-edit-proyek="${p.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-proyek="${p.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function renderProyekDetail() {
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) { showProyekList(); return; }
  if (!p.belanjaMaterial) p.belanjaMaterial = [];
  if (!p.subkontraktor) p.subkontraktor = [];
  const calc = projectCalc(p);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = p.status === "berjalan" && p.tanggalSelesai && p.tanggalSelesai < today;

  document.getElementById("pd_nama").textContent = p.nama || "(Tanpa nama)";
  document.getElementById("pd_sub").textContent = [p.klien, p.lokasi].filter(Boolean).join(" · ") || "-";
  document.getElementById("pd_nilaiKontrak").textContent = rupiah(p.nilaiKontrak);
  document.getElementById("pd_termin").textContent = rupiah(calc.terminDiterima) + (calc.terminPiutang ? ` (Piutang ${rupiah(calc.terminPiutang)})` : "");
  document.getElementById("pd_realisasi").textContent = rupiah(calc.totalBiaya);
  document.getElementById("pd_margin").textContent = rupiah(calc.margin);

  const karyawanNama = (p.karyawanIds || [])
    .map(id => state.karyawan.find(k => k.id === id))
    .filter(Boolean).map(k => k.nama);

  const sumberRab = p.sumberRabId ? state.proyekRab.find(r => r.id === p.sumberRabId) : null;
  const sumberPw = p.sumberPenawaranId ? state.penawaran.find(pw => pw.id === p.sumberPenawaranId) : null;
  document.getElementById("pd_infoRows").innerHTML = `
    <div class="summary-row"><span>Status</span><strong>${proyekStatusLabel(p.status)}</strong></div>
    <div class="summary-row"><span>Tanggal Mulai</span><strong>${p.tanggalMulai ? formatTanggal(p.tanggalMulai) : "-"}</strong></div>
    <div class="summary-row"><span>Rencana Selesai</span><strong class="${overdue ? "bad" : ""}">${p.tanggalSelesai ? formatTanggal(p.tanggalSelesai) : "-"}${overdue ? " ⚠️ Lewat deadline" : ""}</strong></div>
    <div class="summary-row"><span>Pekerja Inti</span><strong>${karyawanNama.length ? escapeHtml(karyawanNama.join(", ")) : "-"}</strong></div>
    ${sumberRab ? `<div class="summary-row"><span>Sumber</span><strong><a href="#" data-open-sumber-rab="${sumberRab.id}">RAB: ${escapeHtml(sumberRab.nama || "(Tanpa nama)")}</a></strong></div>` : ""}
    ${sumberPw ? `<div class="summary-row"><span>Sumber</span><strong><a href="#" data-open-sumber-pw="${sumberPw.id}">Penawaran: ${escapeHtml(sumberPw.nomor)}</a></strong></div>` : ""}
  `;

  const rows = [
    ["Bahan", calc.anggaranBahan, calc.realisasiBahan, calc.varianceBahan],
    ["Upah/Tenaga", calc.anggaranUpah, calc.realisasiUpah, calc.varianceUpah],
    ["Subkontraktor", calc.anggaranSubkon, calc.realisasiSubkon, calc.varianceSubkon],
    ["Lain-lain", calc.anggaranLain, calc.realisasiLain, calc.varianceLain]
  ];
  document.querySelector("#pd_anggaranTable tbody").innerHTML = rows.map(([label, anggaran, realisasi, variance]) => `
    <tr>
      <td>${label}</td>
      <td class="num">${rupiah(anggaran)}</td>
      <td class="num">${rupiah(realisasi)}</td>
      <td class="num">${rupiah(variance)}</td>
      <td>${anggaran ? `<span class="badge-margin ${variance >= 0 ? "good" : "critical"}">${variance >= 0 ? "Sesuai Anggaran" : "Lebih Anggaran"}</span>` : ""}</td>
    </tr>
  `).join("") + `
    <tr style="font-weight:700;">
      <td>Total</td>
      <td class="num">${rupiah(calc.anggaranBahan + calc.anggaranUpah + calc.anggaranSubkon + calc.anggaranLain)}</td>
      <td class="num">${rupiah(calc.totalBiaya)}</td>
      <td class="num">${rupiah((calc.anggaranBahan + calc.anggaranUpah + calc.anggaranSubkon + calc.anggaranLain) - calc.totalBiaya)}</td>
      <td></td>
    </tr>
  `;

  const terminRows = proyekKasTxns(p)
    .filter(t => t.tipe === "Masuk" && ["Pendapatan Jasa", "Pendapatan Lain-lain"].includes(t.kategori))
    .sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  const terminTbody = document.querySelector("#pd_terminTable tbody");
  terminTbody.innerHTML = terminRows.length ? terminRows.map(t => `
    <tr>
      <td>${formatTanggal(t.tanggal)}</td>
      <td>${escapeHtml(t.keterangan)}</td>
      <td><span class="badge ${(t.status || "lunas") === "lunas" ? "badge-lunas" : "badge-pending"}">${(t.status || "lunas") === "lunas" ? "Lunas" : "Piutang"}</span></td>
      <td class="num">${rupiah(t.jumlah)}</td>
      <td><div class="row-actions"><button class="icon-btn" data-delete-termin="${t.id}" title="Hapus">🗑️</button></div></td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="5">Belum ada termin pembayaran</td></tr>';

  const belanjaTbody = document.querySelector("#pd_belanjaTable tbody");
  belanjaTbody.innerHTML = p.belanjaMaterial.length ? p.belanjaMaterial.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "")).map(b => `
    <tr>
      <td>${escapeHtml(b.nama)}</td>
      <td class="num">${b.qty}</td>
      <td>${escapeHtml(b.satuan || "-")}</td>
      <td class="num">${rupiah(b.hargaSatuan)}</td>
      <td class="num">${rupiah((b.qty || 0) * (b.hargaSatuan || 0))}</td>
      <td>${b.tanggal ? formatTanggal(b.tanggal) : "-"}</td>
      <td><span class="badge ${b.status === "Dibeli" ? "badge-lunas" : "badge-pending"}">${b.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit-belanja="${b.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-belanja="${b.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="8">Belum ada belanja material</td></tr>';

  const subkonTbody = document.querySelector("#pd_subkonTable tbody");
  subkonTbody.innerHTML = p.subkontraktor.length ? p.subkontraktor.map(sk => {
    const dibayar = subkonDibayar(p, sk.id);
    return `
    <tr>
      <td>${escapeHtml(sk.nama)}</td>
      <td>${escapeHtml(sk.pekerjaan || "-")}</td>
      <td class="num">${rupiah(sk.nilaiKontrak)}</td>
      <td class="num">${rupiah(dibayar)}</td>
      <td class="num">${rupiah((sk.nilaiKontrak || 0) - dibayar)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-bayar-subkon="${sk.id}" title="Catat Pembayaran">💰</button>
          <button class="icon-btn" data-edit-subkon="${sk.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-subkon="${sk.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    </tr>
  `; }).join("") : '<tr class="empty-row"><td colspan="6">Belum ada subkontraktor</td></tr>';

  if (!p.progressRencana) p.progressRencana = [];
  if (!p.progressRealisasi) p.progressRealisasi = [];
  if (!p.dokumen) p.dokumen = [];

  const rencanaSorted = p.progressRencana.slice().sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  const realisasiSorted = p.progressRealisasi.slice().sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  const realisasiTerakhir = realisasiSorted.length ? realisasiSorted[realisasiSorted.length - 1] : null;
  const targetTerdekat = rencanaSorted.find(r => r.tanggal >= today) || rencanaSorted[rencanaSorted.length - 1] || null;

  document.getElementById("pf_realisasiTerakhir").textContent = realisasiTerakhir ? `${realisasiTerakhir.persen}%` : "0%";
  document.getElementById("pf_targetTerdekat").textContent = targetTerdekat ? `${targetTerdekat.persen}% (${formatTanggal(targetTerdekat.tanggal)})` : "-";
  const statusEl = document.getElementById("pf_statusProgress");
  if (!targetTerdekat || !realisasiTerakhir) {
    statusEl.textContent = "-";
    statusEl.className = "stat-value";
  } else {
    const telat = targetTerdekat.tanggal <= today && realisasiTerakhir.persen < targetTerdekat.persen;
    statusEl.textContent = telat ? "Telat dari Rencana" : "Sesuai/Lebih Cepat";
    statusEl.className = "stat-value " + (telat ? "bad" : "good");
  }

  document.querySelector("#pf_rencanaTable tbody").innerHTML = rencanaSorted.length ? rencanaSorted.map(r => `
    <tr>
      <td>${formatTanggal(r.tanggal)}</td>
      <td class="num">${r.persen}%</td>
      <td>${escapeHtml(r.keterangan || "-")}</td>
      <td><div class="row-actions"><button class="icon-btn" data-delete-rencana="${r.id}" title="Hapus">🗑️</button></div></td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="4">Belum ada target</td></tr>';

  document.querySelector("#pf_realisasiTable tbody").innerHTML = realisasiSorted.length ? realisasiSorted.map(r => `
    <tr>
      <td>${formatTanggal(r.tanggal)}</td>
      <td class="num">${r.persen}%</td>
      <td>${escapeHtml(r.catatan || "-")}</td>
      <td><div class="row-actions"><button class="icon-btn" data-delete-realisasi="${r.id}" title="Hapus">🗑️</button></div></td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="4">Belum ada laporan progress</td></tr>';

  const dokRows = p.dokumen.slice().sort((a, b) => (b.tanggalTerbit || "").localeCompare(a.tanggalTerbit || ""));
  document.querySelector("#pd_dokumenTable tbody").innerHTML = dokRows.length ? dokRows.map(d => {
    const garansiSoon = d.garansiSampai && d.garansiSampai >= today && d.garansiSampai <= addDaysIso(today, 30);
    const garansiHabis = d.garansiSampai && d.garansiSampai < today;
    const garansiClass = garansiHabis ? "bad" : (garansiSoon ? "warn" : "");
    return `
    <tr>
      <td>${escapeHtml(d.jenis)}</td>
      <td>${escapeHtml(d.nomor || "-")}</td>
      <td>${d.tanggalTerbit ? formatTanggal(d.tanggalTerbit) : "-"}</td>
      <td class="${garansiClass}">${d.garansiSampai ? formatTanggal(d.garansiSampai) : "-"}${garansiHabis ? " (habis)" : garansiSoon ? " ⚠️ segera habis" : ""}</td>
      <td>${escapeHtml(d.catatan || "-")}</td>
      <td><div class="row-actions"><button class="icon-btn" data-edit-dokumen="${d.id}" title="Edit">✏️</button><button class="icon-btn" data-delete-dokumen="${d.id}" title="Hapus">🗑️</button></div></td>
    </tr>
  `; }).join("") : '<tr class="empty-row"><td colspan="6">Belum ada dokumen</td></tr>';
}

// ===== Klien (CRM/Pipeline) =====
function klienDerived(k) {
  const proyekTerkait = state.proyek.filter(p => p.klienId === k.id);
  const penawaranTerkait = state.penawaran.filter(p => p.klienId === k.id);
  const totalNilai = proyekTerkait.reduce((s, p) => s + (p.nilaiKontrak || 0), 0);
  const totalMargin = proyekTerkait.reduce((s, p) => s + projectCalc(p).margin, 0);
  return { proyekTerkait, penawaranTerkait, totalNilai, totalMargin };
}
function klienTahapBadge(tahap) {
  if (tahap === "Deal/SPK" || tahap === "Selesai") return "good";
  if (tahap === "Hilang") return "critical";
  return "warning";
}
let currentKlienId = null;
function showKlienList() {
  currentKlienId = null;
  document.getElementById("kl_listView").style.display = "block";
  document.getElementById("kl_detailView").style.display = "none";
  renderKlienList();
}
function showKlienDetail(id) {
  currentKlienId = id;
  document.getElementById("kl_listView").style.display = "none";
  document.getElementById("kl_detailView").style.display = "block";
  renderKlienDetail();
}
function renderKlienList() {
  const filterSel = document.getElementById("kl_filterTahap");
  if (filterSel.options.length <= 1) filterSel.innerHTML = '<option value="">Semua Tahap</option>' + KLIEN_TAHAP.map(t => `<option value="${t}">${t}</option>`).join("");

  const today = new Date().toISOString().slice(0, 10);
  const finalTahap = ["Selesai", "Hilang"];
  const rowsAll = state.klien.map(k => ({ ...k, ...klienDerived(k) }));

  document.getElementById("kl_totalKlien").textContent = rowsAll.length;
  document.getElementById("kl_totalAktif").textContent = rowsAll.filter(k => !finalTahap.includes(k.tahap)).length;
  document.getElementById("kl_totalFollowUp").textContent = rowsAll.filter(k => !finalTahap.includes(k.tahap) && k.followUpTanggal && k.followUpTanggal <= today).length;
  document.getElementById("kl_totalNilai").textContent = rupiah(rowsAll.reduce((s, k) => s + k.totalNilai, 0));

  const search = (document.getElementById("kl_search").value || "").toLowerCase();
  const filterTahap = document.getElementById("kl_filterTahap").value;
  let rows = rowsAll;
  if (search) rows = rows.filter(k => k.nama.toLowerCase().includes(search));
  if (filterTahap) rows = rows.filter(k => k.tahap === filterTahap);
  rows = rows.slice().sort((a, b) => a.nama.localeCompare(b.nama));

  const tbody = document.querySelector("#kl_table tbody");
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Belum ada klien</td></tr>';
    return;
  }
  rows.forEach(k => {
    const overdue = !finalTahap.includes(k.tahap) && k.followUpTanggal && k.followUpTanggal <= today;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(k.nama)}</td>
      <td><span class="badge-margin ${klienTahapBadge(k.tahap)}">${escapeHtml(k.tahap || "Leads")}</span></td>
      <td>${escapeHtml(k.kontakNama || "-")}${k.telepon ? ` · ${escapeHtml(k.telepon)}` : ""}</td>
      <td class="${overdue ? "bad" : ""}">${k.followUpTanggal ? formatTanggal(k.followUpTanggal) : "-"}${overdue ? " ⚠️" : ""}</td>
      <td class="num">${k.proyekTerkait.length}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-open-klien="${k.id}" title="Buka Detail">📂</button>
          <button class="icon-btn" data-edit-klien="${k.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-klien="${k.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function renderKlienDetail() {
  const k = state.klien.find(x => x.id === currentKlienId);
  if (!k) { showKlienList(); return; }
  if (!k.riwayatKontak) k.riwayatKontak = [];
  const derived = klienDerived(k);

  document.getElementById("kld_nama").textContent = k.nama;
  document.getElementById("kld_sub").textContent = [k.kontakNama, k.telepon].filter(Boolean).join(" · ") || "-";
  document.getElementById("kld_tahap").textContent = k.tahap || "Leads";
  document.getElementById("kld_totalProyek").textContent = derived.proyekTerkait.length;
  document.getElementById("kld_totalNilai").textContent = rupiah(derived.totalNilai);
  document.getElementById("kld_totalMargin").textContent = rupiah(derived.totalMargin);

  document.getElementById("kld_infoRows").innerHTML = `
    <div class="summary-row"><span>Telepon</span><strong>${escapeHtml(k.telepon || "-")}</strong></div>
    <div class="summary-row"><span>Email</span><strong>${escapeHtml(k.email || "-")}</strong></div>
    <div class="summary-row"><span>Alamat</span><strong>${escapeHtml(k.alamat || "-")}</strong></div>
    <div class="summary-row"><span>Sumber</span><strong>${escapeHtml(k.sumber || "-")}</strong></div>
    <div class="summary-row"><span>Follow-up Berikutnya</span><strong>${k.followUpTanggal ? formatTanggal(k.followUpTanggal) : "-"}</strong></div>
    <div class="summary-row"><span>Catatan</span><strong>${escapeHtml(k.catatan || "-")}</strong></div>
  `;

  const kontakRows = k.riwayatKontak.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  document.querySelector("#kld_kontakTable tbody").innerHTML = kontakRows.length ? kontakRows.map(r => `
    <tr>
      <td>${formatTanggal(r.tanggal)}</td>
      <td>${escapeHtml(r.catatan)}</td>
      <td><div class="row-actions"><button class="icon-btn" data-delete-kontak="${r.id}" title="Hapus">🗑️</button></div></td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="3">Belum ada riwayat kontak</td></tr>';

  document.querySelector("#kld_penawaranTable tbody").innerHTML = derived.penawaranTerkait.length ? derived.penawaranTerkait.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "")).map(pw => {
    const { total } = penawaranTotals(pw);
    return `<tr><td>${escapeHtml(pw.nomor || "-")}</td><td>${escapeHtml(pw.perihal || "-")}</td><td>${formatTanggal(pw.tanggal)}</td><td class="num">${rupiah(total)}</td><td>${pwStatusLabel(pw.status)}</td></tr>`;
  }).join("") : '<tr class="empty-row"><td colspan="5">Belum ada penawaran terkait</td></tr>';

  document.querySelector("#kld_proyekTable tbody").innerHTML = derived.proyekTerkait.length ? derived.proyekTerkait.map(p => {
    const calc = projectCalc(p);
    return `<tr>
      <td>${escapeHtml(p.nama)}</td>
      <td>${proyekStatusLabel(p.status)}</td>
      <td class="num">${rupiah(p.nilaiKontrak)}</td>
      <td class="num">${rupiah(calc.margin)}</td>
      <td><button class="icon-btn" data-goto-proyek="${p.id}" title="Buka Proyek">📂</button></td>
    </tr>`;
  }).join("") : '<tr class="empty-row"><td colspan="5">Belum ada proyek terkait</td></tr>';
}
const klienModal = document.getElementById("klienModal");
function openKlienModal(existing) {
  const sumberSel = document.getElementById("kl_sumber");
  if (sumberSel.options.length === 0) sumberSel.innerHTML = KLIEN_SUMBER.map(s => `<option value="${s}">${s}</option>`).join("");
  const tahapSel = document.getElementById("kl_tahap");
  if (tahapSel.options.length === 0) tahapSel.innerHTML = KLIEN_TAHAP.map(t => `<option value="${t}">${t}</option>`).join("");

  document.getElementById("kl_id").value = existing ? existing.id : "";
  document.getElementById("klienModalTitle").textContent = existing ? "Edit Klien" : "Tambah Klien";
  document.getElementById("kl_nama").value = existing ? existing.nama : "";
  document.getElementById("kl_kontakNama").value = existing ? (existing.kontakNama || "") : "";
  document.getElementById("kl_telepon").value = existing ? (existing.telepon || "") : "";
  document.getElementById("kl_email").value = existing ? (existing.email || "") : "";
  sumberSel.value = existing ? (existing.sumber || KLIEN_SUMBER[0]) : KLIEN_SUMBER[0];
  document.getElementById("kl_alamat").value = existing ? (existing.alamat || "") : "";
  tahapSel.value = existing ? (existing.tahap || "Leads") : "Leads";
  document.getElementById("kl_followUpTanggal").value = existing ? (existing.followUpTanggal || "") : "";
  document.getElementById("kl_catatan").value = existing ? (existing.catatan || "") : "";
  klienModal.classList.add("open");
}
document.getElementById("kl_addBtn").addEventListener("click", () => openKlienModal(null));
document.getElementById("klienForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("kl_id").value;
  const idx = state.klien.findIndex(k => k.id === id);
  const existing = idx >= 0 ? state.klien[idx] : null;
  const k = {
    ...existing,
    id: id || uid(),
    nama: document.getElementById("kl_nama").value.trim(),
    kontakNama: document.getElementById("kl_kontakNama").value.trim(),
    telepon: document.getElementById("kl_telepon").value.trim(),
    email: document.getElementById("kl_email").value.trim(),
    sumber: document.getElementById("kl_sumber").value,
    alamat: document.getElementById("kl_alamat").value.trim(),
    tahap: document.getElementById("kl_tahap").value,
    followUpTanggal: document.getElementById("kl_followUpTanggal").value,
    catatan: document.getElementById("kl_catatan").value.trim(),
    riwayatKontak: existing ? (existing.riwayatKontak || []) : []
  };
  if (idx >= 0) state.klien[idx] = k; else state.klien.push(k);
  saveState();
  renderAll();
  closeModals();
});
document.getElementById("kl_table").addEventListener("click", e => {
  const openBtn = e.target.closest("[data-open-klien]");
  const editBtn = e.target.closest("[data-edit-klien]");
  const delBtn = e.target.closest("[data-delete-klien]");
  if (openBtn) showKlienDetail(openBtn.dataset.openKlien);
  else if (editBtn) {
    const k = state.klien.find(x => x.id === editBtn.dataset.editKlien);
    if (k) openKlienModal(k);
  } else if (delBtn) {
    if (confirm("Hapus klien ini? Proyek/Penawaran yang sudah dikaitkan tidak akan ikut terhapus, hanya kaitannya yang hilang.")) {
      state.klien = state.klien.filter(x => x.id !== delBtn.dataset.deleteKlien);
      if (currentKlienId === delBtn.dataset.deleteKlien) currentKlienId = null;
      saveState();
      renderAll();
    }
  }
});
document.getElementById("kl_search").addEventListener("input", renderKlienList);
document.getElementById("kl_filterTahap").addEventListener("change", renderKlienList);
document.getElementById("kld_backBtn").addEventListener("click", showKlienList);
document.getElementById("kld_editBtn").addEventListener("click", () => {
  const k = state.klien.find(x => x.id === currentKlienId);
  if (k) openKlienModal(k);
});
document.getElementById("rk_addBtn").addEventListener("click", () => {
  const k = state.klien.find(x => x.id === currentKlienId);
  if (!k) return;
  const tanggal = document.getElementById("rk_tanggal").value;
  const catatan = document.getElementById("rk_catatan").value.trim();
  if (!tanggal || !catatan) { alert("Isi tanggal dan catatan terlebih dahulu."); return; }
  if (!k.riwayatKontak) k.riwayatKontak = [];
  k.riwayatKontak.push({ id: uid(), tanggal, catatan });
  saveState();
  document.getElementById("rk_tanggal").value = "";
  document.getElementById("rk_catatan").value = "";
  renderKlienDetail();
});
document.getElementById("kld_kontakTable").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-kontak]");
  const k = state.klien.find(x => x.id === currentKlienId);
  if (delBtn && k) {
    k.riwayatKontak = (k.riwayatKontak || []).filter(r => r.id !== delBtn.dataset.deleteKontak);
    saveState();
    renderKlienDetail();
  }
});
document.getElementById("kld_proyekTable").addEventListener("click", e => {
  const gotoBtn = e.target.closest("[data-goto-proyek]");
  if (gotoBtn) {
    showPage("proyek");
    showProyekDetail(gotoBtn.dataset.gotoProyek);
  }
});

// ===== Laporan Keuangan =====
function computeLabaRugi(mulai, selesai) {
  const txns = state.kasUsaha.transactions.filter(t => (t.status || "lunas") === "lunas" && t.tanggal >= mulai && t.tanggal <= selesai);
  const byKategori = {};
  txns.forEach(t => {
    const key = t.kategori || "(Tanpa Kategori)";
    if (!byKategori[key]) byKategori[key] = { tipe: t.tipe, jumlah: 0 };
    byKategori[key].jumlah += t.jumlah || 0;
  });
  const rows = Object.entries(byKategori)
    .map(([kategori, v]) => ({ kategori, kelompok: v.tipe === "Masuk" ? "Pendapatan" : "Beban", jumlah: v.jumlah }))
    .sort((a, b) => (a.kelompok === b.kelompok ? b.jumlah - a.jumlah : (a.kelompok === "Pendapatan" ? -1 : 1)));
  const pendapatan = rows.filter(r => r.kelompok === "Pendapatan").reduce((s, r) => s + r.jumlah, 0);
  const beban = rows.filter(r => r.kelompok === "Beban").reduce((s, r) => s + r.jumlah, 0);
  return { rows, pendapatan, beban, labaBersih: pendapatan - beban };
}
function computeNeraca(tanggal) {
  const txnsUpTo = state.kasUsaha.transactions.filter(t => t.tanggal <= tanggal);
  const masukLunas = txnsUpTo.filter(t => t.tipe === "Masuk" && (t.status || "lunas") === "lunas").reduce((s, t) => s + (t.jumlah || 0), 0);
  const keluar = txnsUpTo.filter(t => t.tipe === "Keluar" && (t.status || "lunas") !== "menunggu_persetujuan").reduce((s, t) => s + (t.jumlah || 0), 0);
  const saldoKas = (state.kasUsaha.saldoAwal || 0) + masukLunas - keluar;
  const piutangUsaha = txnsUpTo.filter(t => t.tipe === "Masuk" && (t.status || "lunas") === "pending").reduce((s, t) => s + (t.jumlah || 0), 0);
  const nilaiStok = state.stok.reduce((s, item) => s + stokValue(item), 0);
  const piutangKaryawan = state.karyawan.reduce((s, k) => s + Math.max(0, sisaPinjaman(k)), 0);
  const totalAset = saldoKas + piutangUsaha + nilaiStok + piutangKaryawan;
  return { saldoKas, piutangUsaha, nilaiStok, piutangKaryawan, totalAset };
}
function renderLabaRugi() {
  const mulaiInput = document.getElementById("lr_mulai");
  const selesaiInput = document.getElementById("lr_selesai");
  if (!mulaiInput.value) {
    const now = new Date();
    mulaiInput.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }
  if (!selesaiInput.value) selesaiInput.value = new Date().toISOString().slice(0, 10);
  const { rows, pendapatan, beban, labaBersih } = computeLabaRugi(mulaiInput.value, selesaiInput.value);
  document.getElementById("lr_pendapatan").textContent = rupiah(pendapatan);
  document.getElementById("lr_beban").textContent = rupiah(beban);
  const labaEl = document.getElementById("lr_labaBersih");
  labaEl.textContent = rupiah(labaBersih);
  labaEl.className = "stat-value " + (labaBersih >= 0 ? "good" : "bad");
  document.querySelector("#lr_table tbody").innerHTML = rows.length ? rows.map(r => `
    <tr><td>${escapeHtml(r.kategori)}</td><td>${r.kelompok}</td><td class="num">${rupiah(r.jumlah)}</td></tr>
  `).join("") : '<tr class="empty-row"><td colspan="3">Belum ada transaksi di periode ini</td></tr>';
}
function renderNeraca() {
  const tanggalInput = document.getElementById("nr_tanggal");
  if (!tanggalInput.value) tanggalInput.value = new Date().toISOString().slice(0, 10);
  const n = computeNeraca(tanggalInput.value);
  document.getElementById("nr_asetRows").innerHTML = `
    <div class="summary-row"><span>Saldo Kas Perusahaan</span><strong>${rupiah(n.saldoKas)}</strong></div>
    <div class="summary-row"><span>Piutang Usaha (belum cair)</span><strong>${rupiah(n.piutangUsaha)}</strong></div>
    <div class="summary-row"><span>Nilai Stok Material &amp; Alat</span><strong>${rupiah(n.nilaiStok)}</strong></div>
    <div class="summary-row"><span>Piutang Karyawan (pinjaman belum lunas)</span><strong>${rupiah(n.piutangKaryawan)}</strong></div>
    <div class="summary-row total"><span>Total Aset</span><strong>${rupiah(n.totalAset)}</strong></div>
  `;
  document.getElementById("nr_modal").textContent = rupiah(n.totalAset);
}
document.getElementById("lr_mulai").addEventListener("change", renderLabaRugi);
document.getElementById("lr_selesai").addEventListener("change", renderLabaRugi);
document.getElementById("nr_tanggal").addEventListener("change", renderNeraca);
function buildLaporanKeuanganPrintHtml() {
  const mulai = document.getElementById("lr_mulai").value;
  const selesai = document.getElementById("lr_selesai").value;
  const tanggalNeraca = document.getElementById("nr_tanggal").value;
  const lr = computeLabaRugi(mulai, selesai);
  const nr = computeNeraca(tanggalNeraca);
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
    <h3 style="text-align:center; margin:6px 0 16px; letter-spacing:.5px;">LAPORAN KEUANGAN</h3>
    <p class="doc-p" style="font-weight:700; margin-bottom:6px;">Laba Rugi Periode ${formatTanggal(mulai)} — ${formatTanggal(selesai)}</p>
    <table class="doc-items" style="margin-bottom:10px;">
      <thead><tr><th>Kategori</th><th>Kelompok</th><th class="r">Jumlah</th></tr></thead>
      <tbody>${lr.rows.length ? lr.rows.map(r => `<tr><td>${escapeHtml(r.kategori)}</td><td>${r.kelompok}</td><td class="r">${rupiah(r.jumlah)}</td></tr>`).join("") : `<tr><td colspan="3" class="c">Tidak ada data</td></tr>`}</tbody>
    </table>
    <table class="doc-summary-table" style="margin-bottom:14px;">
      <tr><td>Total Pendapatan</td><td class="r">${rupiah(lr.pendapatan)}</td></tr>
      <tr><td>Total Beban</td><td class="r">- ${rupiah(lr.beban)}</td></tr>
      <tr class="total-row"><td>Laba Bersih</td><td class="r">${rupiah(lr.labaBersih)}</td></tr>
    </table>
    <p class="doc-p" style="font-weight:700; margin-bottom:6px;">Neraca (Ringkasan) per ${formatTanggal(tanggalNeraca)}</p>
    <table class="doc-summary-table">
      <tr><td>Saldo Kas Perusahaan</td><td class="r">${rupiah(nr.saldoKas)}</td></tr>
      <tr><td>Piutang Usaha</td><td class="r">${rupiah(nr.piutangUsaha)}</td></tr>
      <tr><td>Nilai Stok Material &amp; Alat</td><td class="r">${rupiah(nr.nilaiStok)}</td></tr>
      <tr><td>Piutang Karyawan</td><td class="r">${rupiah(nr.piutangKaryawan)}</td></tr>
      <tr class="total-row"><td>Total Aset = Total Modal Pemilik</td><td class="r">${rupiah(nr.totalAset)}</td></tr>
    </table>
    <p style="font-size:11px; color:#777; margin-top:6px;">Ringkasan sederhana berbasis kas — belum mencatat utang usaha/aset tetap seperti neraca akuntansi penuh.</p>
    <div style="display:flex; justify-content:flex-end; margin-top:30px; font-size:12.5px;">
      <div style="text-align:right;">
        Dibuat oleh,<br>${escapeHtml(state.company || "CV. Mitra Creative")}
        <div class="sign-space"></div>
        <strong>${escapeHtml(state.ownerNama)}</strong><br>${escapeHtml(state.ownerJabatan)}
      </div>
    </div>
  `;
}
document.getElementById("lk_printBtn").addEventListener("click", () => {
  document.getElementById("printArea").innerHTML = buildLaporanKeuanganPrintHtml();
  document.body.classList.add("printing-quote");
  window.print();
});

// ===== Gudang / Lokasi Stok =====
const gudangManagerModal = document.getElementById("gudangManagerModal");
function renderGudangManagerTable() {
  document.querySelector("#gd_table tbody").innerHTML = state.gudang.length ? state.gudang.slice().sort((a, b) => a.nama.localeCompare(b.nama)).map(g => `
    <tr><td>${escapeHtml(g.nama)}</td><td><button class="icon-btn" data-delete-gudang="${g.id}" title="Hapus">🗑️</button></td></tr>
  `).join("") : '<tr class="empty-row"><td colspan="2">Belum ada gudang/lokasi</td></tr>';
}
document.getElementById("gudang_manageBtn").addEventListener("click", () => {
  renderGudangManagerTable();
  gudangManagerModal.classList.add("open");
});
document.getElementById("gd_addBtn").addEventListener("click", () => {
  const nama = document.getElementById("gd_nama").value.trim();
  if (!nama) { alert("Isi nama gudang/lokasi terlebih dahulu."); return; }
  state.gudang.push({ id: uid(), nama });
  saveState();
  document.getElementById("gd_nama").value = "";
  renderGudangManagerTable();
  renderAll();
});
document.getElementById("gd_table").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-gudang]");
  if (delBtn) {
    if (confirm("Hapus gudang/lokasi ini? Transaksi stok yang sudah tercatat tidak ikut terhapus, hanya kaitannya yang hilang.")) {
      state.gudang = state.gudang.filter(g => g.id !== delBtn.dataset.deleteGudang);
      saveState();
      renderGudangManagerTable();
      renderAll();
    }
  }
});

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
function stokQtyByGudang(item) {
  const byId = {};
  (item.transactions || []).forEach(t => {
    if (!t.gudangId) return;
    byId[t.gudangId] = (byId[t.gudangId] || 0) + (t.tipe === "Masuk" ? (t.qty || 0) : -(t.qty || 0));
  });
  const result = {};
  Object.entries(byId).forEach(([gudangId, qty]) => {
    const g = state.gudang.find(x => x.id === gudangId);
    result[g ? g.nama : "(Gudang Dihapus)"] = qty;
  });
  return result;
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
function renderStokPendingApproval() {
  const panel = document.getElementById("stok_pendingPanel");
  const pending = state.kasUsaha.transactions
    .filter(t => t.sumberBelanjaId && (t.status || "lunas") === "menunggu_persetujuan")
    .sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  if (!pending.length) { panel.style.display = "none"; return; }
  panel.style.display = "block";
  document.getElementById("stok_pendingCount").textContent = pending.length;
  document.querySelector("#stok_pendingTable tbody").innerHTML = pending.map(t => {
    const proyek = state.proyek.find(p => p.id === t.proyekId);
    return `
      <tr>
        <td>${formatTanggal(t.tanggal)}</td>
        <td>${escapeHtml(t.keterangan)}</td>
        <td>${proyek ? `<a href="#" data-open-proyek-pending="${proyek.id}">${escapeHtml(proyek.nama)}</a>` : escapeHtml(t.extra || "-")}</td>
        <td class="num">${rupiah(t.jumlah)}</td>
        <td><button type="button" class="icon-btn" data-approve-pending="${t.id}" title="Setujui">✅ Setujui</button></td>
      </tr>
    `;
  }).join("");
}
document.getElementById("stok_pendingTable").addEventListener("click", e => {
  const openBtn = e.target.closest("[data-open-proyek-pending]");
  const approveBtn = e.target.closest("[data-approve-pending]");
  if (openBtn) {
    e.preventDefault();
    showPage("proyek");
    showProyekDetail(openBtn.dataset.openProyekPending);
  } else if (approveBtn) {
    const t = state.kasUsaha.transactions.find(x => x.id === approveBtn.dataset.approvePending);
    if (t && confirm(`Setujui pengeluaran ${rupiah(t.jumlah)} ini? Saldo Kas Perusahaan akan langsung berkurang.`)) {
      t.status = "lunas";
      saveState();
      renderAll();
    }
  }
});
function renderStokList() {
  renderStokPendingApproval();
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

  const byGudang = stokQtyByGudang(item);
  document.getElementById("stok_gudangRows").innerHTML = Object.keys(byGudang).length
    ? Object.entries(byGudang).map(([label, q]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><strong>${q} ${escapeHtml(item.satuan)}</strong></div>`).join("")
    : '<div class="checklist-empty">Belum ada transaksi dengan gudang/lokasi ditentukan</div>';

  const tbody = document.querySelector("#stok_txnTable tbody");
  tbody.innerHTML = "";
  const rows = (item.transactions || []).slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Belum ada riwayat transaksi</td></tr>';
    return;
  }
  rows.forEach(t => {
    const gudang = t.gudangId ? state.gudang.find(g => g.id === t.gudangId) : null;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatTanggal(t.tanggal)}</td>
      <td><span class="badge ${t.tipe === "Masuk" ? "badge-masuk" : "badge-keluar"}">${t.tipe}</span></td>
      <td class="num">${t.qty}</td>
      <td>${gudang ? escapeHtml(gudang.nama) : "-"}</td>
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
  const pemasokSel = document.getElementById("st_pemasokId");
  pemasokSel.innerHTML = '<option value="">Tidak dikaitkan</option>' + state.pemasok.map(pm => `<option value="${pm.id}">${escapeHtml(pm.nama)}</option>`).join("");
  pemasokSel.value = existing ? (existing.pemasokId || "") : "";
  document.getElementById("st_harga").value = existing ? formatNumberInput(existing.hargaSatuan) : "";
  const gudangSel = document.getElementById("st_gudangId");
  gudangSel.innerHTML = '<option value="">Tidak ditentukan</option>' + state.gudang.map(g => `<option value="${g.id}">${escapeHtml(g.nama)}</option>`).join("");
  gudangSel.value = existing ? (existing.gudangId || "") : "";
  document.getElementById("st_keterangan").value = existing ? (existing.keterangan || "") : "";
  stokTxnModal.classList.add("open");
}
attachNumberFormatting(document.getElementById("st_harga"));
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
    pemasokId: document.getElementById("st_pemasokId").value || "",
    hargaSatuan: parseNumberInput(document.getElementById("st_harga").value),
    gudangId: document.getElementById("st_gudangId").value || "",
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

// ----- Subtab switching (scoped by data-subtab-page so different pages don't clash) -----
const SUBTAB_PANEL_PREFIX = { ky: "ky_", lk: "lk_" };
document.querySelectorAll(".subtab-item").forEach(btn => {
  btn.addEventListener("click", () => showSubtab(btn.dataset.subtabPage, btn.dataset.subtab));
});
function showSubtab(pagePrefix, name) {
  document.querySelectorAll(`.subtab-item[data-subtab-page="${pagePrefix}"]`).forEach(b => b.classList.toggle("active", b.dataset.subtab === name));
  document.querySelectorAll(`.subtab-item[data-subtab-page="${pagePrefix}"]`).forEach(b => {
    document.getElementById(`${SUBTAB_PANEL_PREFIX[pagePrefix]}${b.dataset.subtab}Panel`).classList.toggle("active", b.dataset.subtab === name);
  });
  if (pagePrefix === "ky") {
    if (name === "absensi") renderAbsensiPanel();
    if (name === "penggajian") renderPenggajianPanel();
  }
  if (pagePrefix === "lk") {
    if (name === "labarugi") renderLabaRugi();
    if (name === "neraca") renderNeraca();
  }
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
function recalcTarifLemburOtomatis() {
  const upahHarian = parseNumberInput(document.getElementById("kym_upahHarian").value);
  const uangMakan = parseNumberInput(document.getElementById("kym_uangMakanHarian").value);
  const tarifLembur = Math.max(0, Math.round((upahHarian - uangMakan) / 6));
  document.getElementById("kym_tarifLembur").value = formatNumberInput(tarifLembur);
}
["kym_upahHarian", "kym_uangMakanHarian"].forEach(id => document.getElementById(id).addEventListener("input", recalcTarifLemburOtomatis));
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Belum ada karyawan aktif</td></tr>';
    return;
  }
  aktif.forEach(k => {
    const existing = (k.absensi || []).find(a => a.tanggal === tanggal);
    const hadir = existing ? existing.hadir : true;
    const jamLembur = existing ? existing.jamLembur : 0;
    const lokasi = existing ? existing.lokasi : null;
    const tr = document.createElement("tr");
    tr.dataset.karyawanId = k.id;
    tr.innerHTML = `
      <td>${escapeHtml(k.nama)}</td>
      <td>${escapeHtml(k.jabatan || "-")}</td>
      <td><input type="checkbox" class="att-check ab-hadir" ${hadir ? "checked" : ""}></td>
      <td class="num"><input type="text" inputmode="decimal" class="ab-lembur" value="${jamLembur || ""}" style="width:80px; text-align:right"></td>
      <td>${lokasi
        ? `<a href="https://www.google.com/maps?q=${lokasi.lat},${lokasi.lng}" target="_blank" rel="noopener">📍 ${new Date(lokasi.waktu).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</a> <button type="button" class="icon-btn" data-catat-lokasi="${k.id}" title="Catat Ulang">🔄</button>`
        : `<button type="button" class="btn-ghost" data-catat-lokasi="${k.id}" style="padding:4px 10px; font-size:12px;">📍 Catat Lokasi</button>`}</td>
    `;
    tbody.appendChild(tr);
  });
}
document.getElementById("ab_loadBtn").addEventListener("click", renderAbsensiPanel);
document.getElementById("ab_tanggal").addEventListener("change", renderAbsensiPanel);
document.getElementById("ab_table").addEventListener("click", e => {
  const btn = e.target.closest("[data-catat-lokasi]");
  if (!btn) return;
  const tanggal = document.getElementById("ab_tanggal").value;
  const k = state.karyawan.find(x => x.id === btn.dataset.catatLokasi);
  if (!k || !tanggal) return;
  if (!navigator.geolocation) { alert("Perangkat/browser ini tidak mendukung pencatatan lokasi GPS."); return; }
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    pos => {
      if (!k.absensi) k.absensi = [];
      let rec = k.absensi.find(a => a.tanggal === tanggal);
      if (!rec) { rec = { id: uid(), tanggal, hadir: true, jamLembur: 0 }; k.absensi.push(rec); }
      rec.lokasi = { lat: pos.coords.latitude, lng: pos.coords.longitude, akurasi: pos.coords.accuracy, waktu: new Date().toISOString() };
      saveState();
      renderAbsensiPanel();
    },
    err => {
      btn.disabled = false;
      alert("Gagal mengambil lokasi: " + (err.message || "izin lokasi ditolak atau tidak tersedia.") + " Pastikan izin lokasi browser/aplikasi diaktifkan.");
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
});
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
    const rec = { ...(idx >= 0 ? k.absensi[idx] : {}), id: idx >= 0 ? k.absensi[idx].id : uid(), tanggal, hadir, jamLembur };
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
    // Lembur dihitung untuk semua hari dalam periode, bukan cuma hari yang ditandai
    // "Hadir" — karyawan bisa lembur di hari libur (mis. Minggu) tanpa masuk sebagai
    // hari kerja reguler, dan jam itu tetap harus terhitung.
    const jamLembur = inRange.reduce((s, a) => s + (a.jamLembur || 0), 0);
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
    if (confirm("Hapus slip gaji ini? Sisa pinjaman akan otomatis dihitung ulang tanpa potongan dari slip ini, dan transaksi Kas Perusahaan yang tercatat otomatis dari slip ini akan ikut terhapus.")) {
      k.slipGaji = k.slipGaji.filter(s => s.id !== delBtn.dataset.deleteSlip);
      state.kasUsaha.transactions = state.kasUsaha.transactions.filter(t => t.sumberSlipId !== delBtn.dataset.deleteSlip);
      saveState();
      renderAll();
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
  state.kasUsaha.transactions.push({
    id: uid(),
    sumberSlipId: slip.id,
    tipe: "Keluar",
    status: expenseApprovalStatus(slipGajiBersih(slip)),
    tanggal: slip.selesai,
    jumlah: slipGajiBersih(slip),
    keterangan: `Gaji ${k.nama} (${formatTanggal(slip.mulai)} - ${formatTanggal(slip.selesai)})`,
    kategori: "Biaya Upah/Tenaga",
    extra: k.nama,
    catatan: "Otomatis dari slip gaji"
  });
  saveState();
  renderAll();
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

function buildProyekPrintHtml(p) {
  const calc = projectCalc(p);
  const karyawanNama = (p.karyawanIds || []).map(id => state.karyawan.find(k => k.id === id)).filter(Boolean).map(k => k.nama);
  const belanja = p.belanjaMaterial || [];
  const subkon = p.subkontraktor || [];
  const termin = proyekKasTxns(p).filter(t => t.tipe === "Masuk" && ["Pendapatan Jasa", "Pendapatan Lain-lain"].includes(t.kategori))
    .sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));

  const anggaranRows = [
    ["Bahan", calc.anggaranBahan, calc.realisasiBahan],
    ["Upah/Tenaga", calc.anggaranUpah, calc.realisasiUpah],
    ["Subkontraktor", calc.anggaranSubkon, calc.realisasiSubkon],
    ["Lain-lain", calc.anggaranLain, calc.realisasiLain]
  ].map(([label, anggaran, realisasi]) => `
    <tr><td>${label}</td><td class="r">${rupiah(anggaran)}</td><td class="r">${rupiah(realisasi)}</td><td class="r">${rupiah(anggaran - realisasi)}</td></tr>
  `).join("");

  const belanjaRows = belanja.length ? belanja.map(b => `
    <tr><td>${escapeHtml(b.nama)}</td><td class="r">${b.qty} ${escapeHtml(b.satuan || "")}</td><td class="r">${rupiah(b.hargaSatuan)}</td><td class="r">${rupiah((b.qty || 0) * (b.hargaSatuan || 0))}</td><td>${b.status}</td></tr>
  `).join("") : `<tr><td colspan="5" class="c">Belum ada belanja material</td></tr>`;

  const terminRows = termin.length ? termin.map(t => `
    <tr><td>${formatTanggal(t.tanggal)}</td><td>${escapeHtml(t.keterangan)}</td><td>${(t.status || "lunas") === "lunas" ? "Lunas" : "Piutang"}</td><td class="r">${rupiah(t.jumlah)}</td></tr>
  `).join("") : `<tr><td colspan="4" class="c">Belum ada termin pembayaran</td></tr>`;

  const subkonRows = subkon.length ? subkon.map(sk => {
    const dibayar = subkonDibayar(p, sk.id);
    return `<tr><td>${escapeHtml(sk.nama)}</td><td>${escapeHtml(sk.pekerjaan || "-")}</td><td class="r">${rupiah(sk.nilaiKontrak)}</td><td class="r">${rupiah(dibayar)}</td><td class="r">${rupiah((sk.nilaiKontrak || 0) - dibayar)}</td></tr>`;
  }).join("") : `<tr><td colspan="5" class="c">Belum ada subkontraktor</td></tr>`;

  const progressRealisasi = (p.progressRealisasi || []).slice().sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  const progressTerakhir = progressRealisasi.length ? progressRealisasi[progressRealisasi.length - 1] : null;
  const dokumenRows = (p.dokumen || []).length ? p.dokumen.map(d => `
    <tr><td>${escapeHtml(d.jenis)}</td><td>${escapeHtml(d.nomor || "-")}</td><td>${d.tanggalTerbit ? formatTanggal(d.tanggalTerbit) : "-"}</td><td>${d.garansiSampai ? formatTanggal(d.garansiSampai) : "-"}</td></tr>
  `).join("") : `<tr><td colspan="4" class="c">Belum ada dokumen</td></tr>`;

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
    <h3 style="text-align:center; margin:6px 0 16px; letter-spacing:.5px;">LAPORAN PROYEK</h3>
    <table class="meta-table" style="margin-bottom:14px;">
      <tr><td>Nama Proyek</td><td>:</td><td><strong>${escapeHtml(p.nama)}</strong></td></tr>
      <tr><td>Klien</td><td>:</td><td>${escapeHtml(p.klien || "-")}</td></tr>
      <tr><td>Lokasi</td><td>:</td><td>${escapeHtml(p.lokasi || "-")}</td></tr>
      <tr><td>Status</td><td>:</td><td>${proyekStatusLabel(p.status)}</td></tr>
      <tr><td>Periode</td><td>:</td><td>${p.tanggalMulai ? formatTanggal(p.tanggalMulai) : "-"} — ${p.tanggalSelesai ? formatTanggal(p.tanggalSelesai) : "-"}</td></tr>
      <tr><td>Pekerja Inti</td><td>:</td><td>${karyawanNama.length ? escapeHtml(karyawanNama.join(", ")) : "-"}</td></tr>
    </table>

    <p class="doc-p" style="font-weight:700; margin-bottom:6px;">Anggaran vs Realisasi</p>
    <table class="doc-items" style="margin-bottom:14px;">
      <thead><tr><th>Komponen</th><th class="r">Anggaran</th><th class="r">Realisasi</th><th class="r">Selisih</th></tr></thead>
      <tbody>${anggaranRows}</tbody>
    </table>

    <p class="doc-p" style="font-weight:700; margin-bottom:6px;">Daftar Belanja Material</p>
    <table class="doc-items" style="margin-bottom:14px;">
      <thead><tr><th>Material</th><th class="r">Qty</th><th class="r">Harga Satuan</th><th class="r">Total</th><th>Status</th></tr></thead>
      <tbody>${belanjaRows}</tbody>
    </table>

    <p class="doc-p" style="font-weight:700; margin-bottom:6px;">Termin Pembayaran</p>
    <table class="doc-items" style="margin-bottom:14px;">
      <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Status</th><th class="r">Jumlah</th></tr></thead>
      <tbody>${terminRows}</tbody>
    </table>

    <p class="doc-p" style="font-weight:700; margin-bottom:6px;">Subkontraktor</p>
    <table class="doc-items" style="margin-bottom:14px;">
      <thead><tr><th>Nama</th><th>Pekerjaan</th><th class="r">Nilai Kontrak</th><th class="r">Dibayar</th><th class="r">Sisa</th></tr></thead>
      <tbody>${subkonRows}</tbody>
    </table>

    <p class="doc-p" style="font-weight:700; margin-bottom:6px;">Progress Fisik: ${progressTerakhir ? `${progressTerakhir.persen}% per ${formatTanggal(progressTerakhir.tanggal)}` : "Belum ada laporan"}</p>

    <p class="doc-p" style="font-weight:700; margin-bottom:6px;">Dokumen Proyek</p>
    <table class="doc-items" style="margin-bottom:14px;">
      <thead><tr><th>Jenis</th><th>Nomor</th><th>Tanggal Terbit</th><th>Garansi Sampai</th></tr></thead>
      <tbody>${dokumenRows}</tbody>
    </table>

    <table class="doc-summary-table">
      <tr class="total-row"><td>Nilai Kontrak</td><td class="r">${rupiah(p.nilaiKontrak)}</td></tr>
      <tr><td>Total Realisasi Biaya</td><td class="r">- ${rupiah(calc.totalBiaya)}</td></tr>
      <tr class="total-row"><td>Margin</td><td class="r">${rupiah(calc.margin)} (${(calc.marginPct * 100).toFixed(1)}%)</td></tr>
    </table>
    <div style="display:flex; justify-content:flex-end; margin-top:30px; font-size:12.5px;">
      <div style="text-align:right;">
        Dibuat oleh,<br>${escapeHtml(state.company || "CV. Mitra Creative")}
        <div class="sign-space"></div>
        <strong>${escapeHtml(state.ownerNama)}</strong><br>${escapeHtml(state.ownerJabatan)}
      </div>
    </div>
  `;
}
function printProyekLaporan(p) {
  document.getElementById("printArea").innerHTML = buildProyekPrintHtml(p);
  document.body.classList.add("printing-quote");
  window.print();
}
document.getElementById("pd_printBtn").addEventListener("click", () => {
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (p) printProyekLaporan(p);
});

// ===== Pemasok =====
function pemasokRiwayat(pm) {
  const rows = [];
  state.stok.forEach(item => {
    (item.transactions || []).forEach(t => {
      if (t.tipe === "Masuk" && t.pemasokId === pm.id) {
        rows.push({ tanggal: t.tanggal, material: item.nama, qty: t.qty || 0, harga: t.hargaSatuan || 0, sumber: "Stok Material" });
      }
    });
  });
  state.proyek.forEach(p => {
    (p.belanjaMaterial || []).forEach(b => {
      if (b.pemasokId === pm.id) {
        rows.push({ tanggal: b.tanggal, material: b.nama, qty: b.qty || 0, harga: b.hargaSatuan || 0, sumber: `Proyek: ${p.nama}` });
      }
    });
  });
  return rows.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
}
function pemasokTotal(pm) {
  return pemasokRiwayat(pm).reduce((s, r) => s + r.qty * r.harga, 0);
}
let currentPemasokId = null;
function showPemasokList() {
  currentPemasokId = null;
  document.getElementById("pm_listView").style.display = "block";
  document.getElementById("pm_detailView").style.display = "none";
  renderPemasokList();
}
function showPemasokDetail(id) {
  currentPemasokId = id;
  document.getElementById("pm_listView").style.display = "none";
  document.getElementById("pm_detailView").style.display = "block";
  renderPemasokDetail();
}
function renderPemasokList() {
  const tbody = document.querySelector("#pm_table tbody");
  tbody.innerHTML = "";
  if (!state.pemasok.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Belum ada pemasok</td></tr>';
    return;
  }
  state.pemasok.slice().sort((a, b) => a.nama.localeCompare(b.nama)).forEach(pm => {
    const total = pemasokTotal(pm);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(pm.nama)}</td>
      <td>${escapeHtml(pm.kategori || "-")}</td>
      <td>${escapeHtml(pm.telepon || "-")}</td>
      <td class="num">${rupiah(total)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-open-pemasok="${pm.id}" title="Buka Detail">📂</button>
          <button class="icon-btn" data-edit-pemasok="${pm.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-pemasok="${pm.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function renderPemasokDetail() {
  const pm = state.pemasok.find(x => x.id === currentPemasokId);
  if (!pm) { showPemasokList(); return; }
  document.getElementById("pmd_nama").textContent = pm.nama;
  document.getElementById("pmd_sub").textContent = pm.kategori || "-";
  document.getElementById("pmd_infoRows").innerHTML = `
    <div class="summary-row"><span>Kategori</span><strong>${escapeHtml(pm.kategori || "-")}</strong></div>
    <div class="summary-row"><span>Telepon</span><strong>${escapeHtml(pm.telepon || "-")}</strong></div>
    <div class="summary-row"><span>Alamat</span><strong>${escapeHtml(pm.alamat || "-")}</strong></div>
    <div class="summary-row"><span>Catatan</span><strong>${escapeHtml(pm.catatan || "-")}</strong></div>
  `;
  const rows = pemasokRiwayat(pm);
  document.querySelector("#pmd_riwayatTable tbody").innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${r.tanggal ? formatTanggal(r.tanggal) : "-"}</td>
      <td>${escapeHtml(r.material)}</td>
      <td class="num">${r.qty}</td>
      <td class="num">${rupiah(r.harga)}</td>
      <td>${escapeHtml(r.sumber)}</td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="5">Belum ada riwayat pembelian</td></tr>';
}
const pemasokModal = document.getElementById("pemasokModal");
function openPemasokModal(existing) {
  document.getElementById("pm_id").value = existing ? existing.id : "";
  document.getElementById("pemasokModalTitle").textContent = existing ? "Edit Pemasok" : "Tambah Pemasok";
  document.getElementById("pm_nama").value = existing ? existing.nama : "";
  document.getElementById("pm_kategori").value = existing ? (existing.kategori || "") : "";
  document.getElementById("pm_telepon").value = existing ? (existing.telepon || "") : "";
  document.getElementById("pm_alamat").value = existing ? (existing.alamat || "") : "";
  document.getElementById("pm_catatan").value = existing ? (existing.catatan || "") : "";
  pemasokModal.classList.add("open");
}
document.getElementById("pm_addBtn").addEventListener("click", () => openPemasokModal(null));
document.getElementById("pemasokForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("pm_id").value;
  const idx = state.pemasok.findIndex(x => x.id === id);
  const pm = {
    id: id || uid(),
    nama: document.getElementById("pm_nama").value.trim(),
    kategori: document.getElementById("pm_kategori").value.trim(),
    telepon: document.getElementById("pm_telepon").value.trim(),
    alamat: document.getElementById("pm_alamat").value.trim(),
    catatan: document.getElementById("pm_catatan").value.trim()
  };
  if (idx >= 0) state.pemasok[idx] = pm; else state.pemasok.push(pm);
  saveState();
  renderAll();
  closeModals();
});
document.getElementById("pm_table").addEventListener("click", e => {
  const openBtn = e.target.closest("[data-open-pemasok]");
  const editBtn = e.target.closest("[data-edit-pemasok]");
  const delBtn = e.target.closest("[data-delete-pemasok]");
  if (openBtn) showPemasokDetail(openBtn.dataset.openPemasok);
  else if (editBtn) {
    const pm = state.pemasok.find(x => x.id === editBtn.dataset.editPemasok);
    if (pm) openPemasokModal(pm);
  } else if (delBtn) {
    if (confirm("Hapus pemasok ini? Riwayat pembelian yang sudah tercatat di Stok/Proyek tidak ikut terhapus, hanya kaitannya yang hilang.")) {
      state.pemasok = state.pemasok.filter(x => x.id !== delBtn.dataset.deletePemasok);
      if (currentPemasokId === delBtn.dataset.deletePemasok) currentPemasokId = null;
      saveState();
      renderAll();
    }
  }
});
document.getElementById("pmd_backBtn").addEventListener("click", showPemasokList);

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
  // PPh Final sudah termasuk dalam harga satuan (sesuai Syarat & Ketentuan), jadi TIDAK
  // ditambahkan lagi ke Total — hanya ditampilkan sebagai info berapa yang perlu disetor pajak.
  const pphValue = subtotal * (rab.pph || 0) / 100;
  const total = subtotal + ppnValue + (rab.biayaLain || 0);
  return { subtotal, ppnValue, pphValue, total };
}
function penawaranTotals(pw) {
  const subtotal = itemsSubtotal(pw.items);
  const diskonValue = subtotal * (pw.diskon || 0) / 100;
  const dpp = subtotal - diskonValue;
  const ppnValue = dpp * (pw.ppn || 0) / 100;
  // PPh Final sudah termasuk dalam harga satuan (sesuai Syarat & Ketentuan), jadi TIDAK
  // ditambahkan lagi ke Total — hanya ditampilkan sebagai info berapa yang perlu disetor pajak.
  const pphValue = dpp * (pw.pph || 0) / 100;
  const total = dpp + ppnValue;
  return { subtotal, diskonValue, dpp, ppnValue, pphValue, total };
}
const ROMAWI_BULAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
function nextPenawaranNomor() {
  state.penawaranCounter = (state.penawaranCounter || 0) + 1;
  const n = String(state.penawaranCounter).padStart(3, "0");
  const d = new Date();
  return `${n}/MC-PH/${ROMAWI_BULAN[d.getMonth()]}/${d.getFullYear()}`;
}
function nextRabNomor() {
  state.rabCounter = (state.rabCounter || 0) + 1;
  const n = String(state.rabCounter).padStart(3, "0");
  const d = new Date();
  return `${n}/MC-RAB/${ROMAWI_BULAN[d.getMonth()]}/${d.getFullYear()}`;
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
          <button class="icon-btn" data-riwayat-ahsp="${a.id}" title="Riwayat Harga">👁️</button>
          <button class="icon-btn" data-edit-ahsp="${a.id}" title="Edit">✏️</button>
          <button class="icon-btn" data-delete-ahsp="${a.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
function buildAhspListPrintHtml() {
  const filterSel = document.getElementById("ah_filterKategori");
  const search = (document.getElementById("ah_search").value || "").toLowerCase();
  const filterKategori = filterSel.value;
  let rows = state.ahsp.slice().sort((a, b) => a.kategori.localeCompare(b.kategori) || a.uraian.localeCompare(b.uraian));
  if (filterKategori) rows = rows.filter(a => a.kategori === filterKategori);
  if (search) rows = rows.filter(a => (a.uraian || "").toLowerCase().includes(search) || (a.kode || "").toLowerCase().includes(search));

  const bodyRows = rows.length ? rows.map(a => `
    <tr><td>${escapeHtml(a.kategori)}</td><td>${escapeHtml(a.kode || "-")}</td><td>${escapeHtml(a.uraian)}</td><td class="c">${escapeHtml(a.satuan)}</td><td class="r">${rupiah(ahspHarga(a))}</td><td>${escapeHtml(a.referensi || "-")}</td></tr>
  `).join("") : `<tr><td colspan="6" class="c">Tidak ada item</td></tr>`;

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
    <h3 style="text-align:center; margin:6px 0 16px; letter-spacing:.5px;">DAFTAR HARGA SATUAN PEKERJAAN (AHSP)</h3>
    ${filterKategori ? `<p class="doc-p">Kategori: <strong>${escapeHtml(filterKategori)}</strong></p>` : ""}
    <table class="doc-items">
      <thead><tr><th>Kategori</th><th>Kode</th><th>Uraian Pekerjaan</th><th>Satuan</th><th class="r">Harga Satuan</th><th>Referensi</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p style="font-size:11px; color:#777; margin-top:10px;">Dicetak ${formatTanggal(new Date().toISOString().slice(0, 10))} — ${rows.length} item.</p>
  `;
}
document.getElementById("ah_printBtn").addEventListener("click", () => {
  document.getElementById("printArea").innerHTML = buildAhspListPrintHtml();
  document.body.classList.add("printing-quote");
  window.print();
});

// ===== Modal: AHSP item =====
const ahspModal = document.getElementById("ahspModal");
let ahspKomponenRows = [];

function maxUpahHarianMitra() {
  const aktif = state.karyawan.filter(k => k.aktif !== false);
  const list = aktif.length ? aktif : state.karyawan;
  return list.reduce((max, k) => Math.max(max, k.upahHarian || 0), 0);
}
function sumberOptionsForJenis(jenis) {
  if (jenis === "Upah") {
    const opts = [{ value: "maxupah|auto", label: "⭐ Upah Tertinggi Mitra +20% (otomatis)" }];
    return opts.concat(state.karyawan.filter(k => k.aktif !== false).map(k => ({ value: `karyawan|${k.id}`, label: k.nama })));
  }
  const kategoriStok = jenis === "Alat" ? "Alat" : "Material";
  return state.stok.filter(s => s.kategori === kategoriStok).map(s => ({ value: `stok|${s.id}`, label: s.nama }));
}
function sumberHargaLookup(tipe, id) {
  if (tipe === "stok") {
    const s = state.stok.find(x => x.id === id);
    return s ? { harga: s.hargaSatuan || 0, satuan: s.satuan, uraian: s.nama } : null;
  }
  if (tipe === "karyawan") {
    const k = state.karyawan.find(x => x.id === id);
    return k ? { harga: k.upahHarian || 0, satuan: "OH", uraian: k.nama } : null;
  }
  if (tipe === "maxupah") {
    return { harga: Math.round(maxUpahHarianMitra() * 1.2), satuan: "OH", uraian: "Upah Tenaga Kerja (tertinggi mitra +20%)" };
  }
  return null;
}

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
  document.getElementById("ah_referensi").value = existing ? (existing.referensi || "") : "";

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
    const sumberOpts = sumberOptionsForJenis(k.jenis);
    const currentVal = k.sumberTipe && k.sumberId ? `${k.sumberTipe}|${k.sumberId}` : "";
    tr.innerHTML = `
      <td><select class="komp-jenis">${JENIS_KOMPONEN.map(j => `<option value="${j}" ${k.jenis === j ? "selected" : ""}>${j}</option>`).join("")}</select></td>
      <td><select class="komp-sumber">
        <option value="">Manual</option>
        ${sumberOpts.map(o => `<option value="${o.value}" ${o.value === currentVal ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
      </select></td>
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
document.querySelector("#ah_komponenTable tbody").addEventListener("change", e => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const idx = Number(tr.dataset.idx);
  const row = ahspKomponenRows[idx];
  if (!row) return;
  if (e.target.classList.contains("komp-jenis")) {
    row.jenis = e.target.value;
    row.sumberTipe = "";
    row.sumberId = "";
    renderKomponenRows();
  } else if (e.target.classList.contains("komp-sumber")) {
    const val = e.target.value;
    if (!val) {
      row.sumberTipe = "";
      row.sumberId = "";
    } else {
      const [tipe, id] = val.split("|");
      const src = sumberHargaLookup(tipe, id);
      if (src) {
        row.sumberTipe = tipe;
        row.sumberId = id;
        row.uraian = src.uraian;
        row.satuan = src.satuan;
        row.harga = src.harga;
      }
    }
    renderKomponenRows();
  }
});
document.querySelector("#ah_komponenTable tbody").addEventListener("click", e => {
  const btn = e.target.closest("[data-remove-komponen]");
  if (btn) {
    ahspKomponenRows.splice(Number(btn.dataset.removeKomponen), 1);
    renderKomponenRows();
  }
});
document.getElementById("ah_addKomponenBtn").addEventListener("click", () => {
  ahspKomponenRows.push({ jenis: "Bahan", uraian: "", satuan: "", koefisien: 0, harga: 0, sumberTipe: "", sumberId: "" });
  renderKomponenRows();
});
document.getElementById("ah_refreshHargaBtn").addEventListener("click", () => {
  let updated = 0;
  ahspKomponenRows.forEach(row => {
    if (row.sumberTipe && row.sumberId) {
      const src = sumberHargaLookup(row.sumberTipe, row.sumberId);
      if (src) { row.harga = src.harga; updated++; }
    }
  });
  renderKomponenRows();
  alert(updated ? `${updated} komponen diperbarui ke harga terbaru dari Stok Material/Karyawan.` : "Tidak ada komponen yang terhubung ke Stok Material/Karyawan. Pilih sumber harga di kolom \"Sumber Harga\" dulu.");
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
  const idx = state.ahsp.findIndex(a => a.id === id);
  const existing = idx >= 0 ? state.ahsp[idx] : null;
  const item = {
    id: id || uid(),
    kategori: document.getElementById("ah_kategori").value,
    kode: document.getElementById("ah_kode").value.trim(),
    uraian: document.getElementById("ah_uraian").value.trim(),
    satuan: document.getElementById("ah_satuan").value.trim(),
    mode: document.getElementById("ah_mode").value,
    hargaManual: parseNumberInput(document.getElementById("ah_hargaManual").value),
    overhead: parseFloat(document.getElementById("ah_overhead").value) || 0,
    referensi: document.getElementById("ah_referensi").value.trim(),
    komponen: JSON.parse(JSON.stringify(ahspKomponenRows)),
    riwayatHarga: existing ? (existing.riwayatHarga || []) : []
  };
  const hargaBaru = ahspHarga(item);
  if (existing) {
    const hargaLama = ahspHarga(existing);
    if (hargaBaru !== hargaLama) {
      item.riwayatHarga.push({ id: uid(), tanggal: new Date().toISOString().slice(0, 10), hargaLama, hargaBaru });
    }
  }
  if (idx >= 0) state.ahsp[idx] = item; else state.ahsp.push(item);
  saveState();
  renderAll();
  closeModals();
});
const ahspRiwayatModal = document.getElementById("ahspRiwayatModal");
function openAhspRiwayat(item) {
  document.getElementById("ahspRiwayatTitle").textContent = `Riwayat Harga: ${item.uraian}`;
  const rows = (item.riwayatHarga || []).slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  document.querySelector("#ahspRiwayatTable tbody").innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${formatTanggal(r.tanggal)}</td>
      <td class="num">${rupiah(r.hargaLama)}</td>
      <td class="num">${rupiah(r.hargaBaru)}</td>
      <td class="num ${r.hargaBaru >= r.hargaLama ? "bad" : "good"}">${r.hargaBaru >= r.hargaLama ? "+" : ""}${rupiah(r.hargaBaru - r.hargaLama)}</td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="4">Belum ada perubahan harga tercatat</td></tr>';
  ahspRiwayatModal.classList.add("open");
}
document.getElementById("ah_table").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-ahsp]");
  const delBtn = e.target.closest("[data-delete-ahsp]");
  const riwayatBtn = e.target.closest("[data-riwayat-ahsp]");
  if (editBtn) {
    const a = state.ahsp.find(x => x.id === editBtn.dataset.editAhsp);
    if (a) openAhspModal(a);
  } else if (delBtn) {
    if (confirm("Hapus item AHSP ini?")) {
      state.ahsp = state.ahsp.filter(x => x.id !== delBtn.dataset.deleteAhsp);
      saveState();
      renderAll();
    }
  } else if (riwayatBtn) {
    const a = state.ahsp.find(x => x.id === riwayatBtn.dataset.riwayatAhsp);
    if (a) openAhspRiwayat(a);
  }
});

// ===== Import AHSP (.xlsx) =====
async function parseAhspXlsx(arrayBuffer) {
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
  if (sharedStringsDoc) sharedStringsDoc.querySelectorAll("si").forEach(si => sharedStrings.push(si.textContent || ""));
  const relsDoc = await readXml("xl/_rels/workbook.xml.rels");
  const relMap = {};
  if (relsDoc) relsDoc.querySelectorAll("Relationship").forEach(rel => { relMap[rel.getAttribute("Id")] = rel.getAttribute("Target"); });
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

  let headerRow = -1, kategoriCol = -1, kodeCol = -1, uraianCol = -1, satuanCol = -1, hargaCol = -1;
  for (let r = 1; r <= maxRow && headerRow === -1; r++) {
    let kc = -1, kdc = -1, uc = -1, sc = -1, hc = -1;
    for (let c = 1; c <= maxCol; c++) {
      const txt = cellText(r, c).toLowerCase();
      if (!txt) continue;
      if (/kategori/.test(txt)) kc = c;
      else if (/^kode/.test(txt)) kdc = c;
      else if (/uraian/.test(txt)) uc = c;
      else if (/^sat/.test(txt)) sc = c;
      else if (/harga/.test(txt)) hc = c;
    }
    if (uc > -1 && (sc > -1 || hc > -1)) { headerRow = r; kategoriCol = kc; kodeCol = kdc; uraianCol = uc; satuanCol = sc; hargaCol = hc; }
  }
  if (headerRow === -1) return [];

  const results = [];
  for (let r = headerRow + 1; r <= maxRow; r++) {
    const uraian = uraianCol > -1 ? cellText(r, uraianCol) : "";
    if (!uraian) continue;
    results.push({
      kategori: kategoriCol > -1 ? cellText(r, kategoriCol) : "",
      kode: kodeCol > -1 ? cellText(r, kodeCol) : "",
      uraian,
      satuan: satuanCol > -1 ? cellText(r, satuanCol) : "",
      harga: hargaCol > -1 ? (cellNumber(r, hargaCol) || 0) : 0
    });
  }
  return results;
}
let ahImportRows = [];
const ahspImportModal = document.getElementById("ahspImportModal");
function renderAhImportRows() {
  document.querySelector("#ahi_table tbody").innerHTML = ahImportRows.map((r, idx) => `
    <tr data-idx="${idx}">
      <td><input type="checkbox" class="ahi-checked" ${r.checked ? "checked" : ""}></td>
      <td><input type="text" class="ahi-kategori" value="${escapeHtml(r.kategori || "")}" style="width:130px"></td>
      <td><input type="text" class="ahi-kode" value="${escapeHtml(r.kode || "")}" style="width:90px"></td>
      <td><input type="text" class="ahi-uraian" value="${escapeHtml(r.uraian || "")}"></td>
      <td><input type="text" class="ahi-satuan" value="${escapeHtml(r.satuan || "")}" style="width:70px"></td>
      <td class="num"><input type="text" inputmode="numeric" class="ahi-harga" value="${formatNumberInput(r.harga || 0)}" style="width:110px; text-align:right"></td>
    </tr>
  `).join("");
  document.querySelectorAll("#ahi_table .ahi-harga").forEach(attachNumberFormatting);
}
document.querySelector("#ahi_table tbody").addEventListener("input", e => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const idx = Number(tr.dataset.idx);
  const row = ahImportRows[idx];
  if (!row) return;
  row.checked = tr.querySelector(".ahi-checked").checked;
  row.kategori = tr.querySelector(".ahi-kategori").value;
  row.kode = tr.querySelector(".ahi-kode").value;
  row.uraian = tr.querySelector(".ahi-uraian").value;
  row.satuan = tr.querySelector(".ahi-satuan").value;
  row.harga = parseNumberInput(tr.querySelector(".ahi-harga").value);
});
document.getElementById("ah_importBtn").addEventListener("click", () => document.getElementById("ah_importInput").click());
document.getElementById("ah_importInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (typeof JSZip === "undefined") {
    alert("Gagal memuat pembaca file Excel (JSZip). Pastikan koneksi internet aktif saat pertama kali memakai fitur ini.");
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const rows = await parseAhspXlsx(buf);
    if (!rows.length) {
      alert("Tidak ditemukan baris item. Pastikan file punya header kolom Kategori/Kode/Uraian/Satuan/Harga.");
      return;
    }
    ahImportRows = rows.map(r => ({ checked: true, ...r }));
    document.getElementById("ahi_count").textContent = ahImportRows.length;
    renderAhImportRows();
    ahspImportModal.classList.add("open");
  } catch (err) {
    alert("Gagal membaca file: " + err.message);
  }
});
document.getElementById("ahi_confirmBtn").addEventListener("click", () => {
  const toImport = ahImportRows.filter(r => r.checked && (r.uraian || "").trim());
  if (!toImport.length) { alert("Tidak ada baris yang dicentang untuk diimpor."); return; }
  toImport.forEach(r => {
    state.ahsp.push({
      id: uid(),
      kategori: r.kategori || KATEGORI_PEKERJAAN[0],
      kode: r.kode || "",
      uraian: r.uraian.trim(),
      satuan: r.satuan || "",
      mode: "manual",
      hargaManual: r.harga || 0,
      overhead: 0,
      referensi: "",
      komponen: [],
      riwayatHarga: []
    });
  });
  saveState();
  renderAll();
  closeModals();
  alert(`${toImport.length} item AHSP berhasil diimpor.`);
});

// ===== Template AHSP standar (per kategori: advertising, konstruksi, sipil, interior, eksterior, CCTV, AC, dst) =====
function resolveTemplateKomponen(tpl) {
  return tpl.komponen.map(k => {
    if (k.jenis === "Upah") {
      const src = sumberHargaLookup("maxupah", "auto");
      return { jenis: "Upah", uraian: k.uraian, satuan: k.satuan, koefisien: k.koefisien, harga: src.harga, sumberTipe: "maxupah", sumberId: "auto" };
    }
    const kategoriStok = k.jenis === "Alat" ? "Alat" : "Material";
    const kUraianLower = k.uraian.toLowerCase();
    const match = state.stok.find(s => s.kategori === kategoriStok &&
      (s.nama.toLowerCase().includes(kUraianLower) || kUraianLower.includes(s.nama.toLowerCase())));
    if (match) {
      return { jenis: k.jenis, uraian: match.nama, satuan: match.satuan, koefisien: k.koefisien, harga: match.hargaSatuan || 0, sumberTipe: "stok", sumberId: match.id };
    }
    return { jenis: k.jenis, uraian: k.uraian, satuan: k.satuan, koefisien: k.koefisien, harga: k.harga || 0, sumberTipe: "", sumberId: "" };
  });
}
const ahspTemplateModal = document.getElementById("ahspTemplateModal");
function renderAhTemplateList() {
  const byKategori = {};
  AHSP_TEMPLATES.forEach(tpl => {
    if (!byKategori[tpl.kategori]) byKategori[tpl.kategori] = [];
    byKategori[tpl.kategori].push(tpl);
  });
  const sudahAda = new Set(state.ahsp.map(a => a.kode).filter(Boolean));
  const html = Object.keys(byKategori).sort().map(kategori => `
    <div style="margin-bottom:14px;">
      <div class="muted" style="font-weight:600; margin-bottom:6px;">${escapeHtml(kategori)}</div>
      <div class="checklist" style="flex-direction:column; align-items:stretch; max-height:none;">
        ${byKategori[kategori].map(tpl => {
          const resolved = resolveTemplateKomponen(tpl);
          const estHarga = ahspHarga({ mode: "detail", komponen: resolved, overhead: tpl.overhead });
          const sudah = sudahAda.has(tpl.kode);
          return `
            <label style="align-items:flex-start; padding:6px 0; border-bottom:1px solid var(--border);">
              <input type="checkbox" class="ahtpl-check" value="${escapeHtml(tpl.kode)}" ${sudah ? "disabled" : ""} style="margin-top:3px;">
              <span>
                <strong>${escapeHtml(tpl.uraian)}</strong> (${escapeHtml(tpl.satuan)}) — est. ${rupiah(estHarga)}${sudah ? ' <em>(sudah ada di daftar AHSP)</em>' : ""}<br>
                <span class="muted" style="font-size:11px;">${escapeHtml(tpl.referensi)}</span>
              </span>
            </label>
          `;
        }).join("")}
      </div>
    </div>
  `).join("");
  document.getElementById("ahtpl_list").innerHTML = html || '<p class="muted">Tidak ada template tersedia.</p>';
}
document.getElementById("ah_templateBtn").addEventListener("click", () => {
  renderAhTemplateList();
  ahspTemplateModal.classList.add("open");
});
document.getElementById("ahtpl_confirmBtn").addEventListener("click", () => {
  const checked = Array.from(document.querySelectorAll(".ahtpl-check:checked")).map(el => el.value);
  if (!checked.length) { alert("Pilih minimal satu item template untuk ditambahkan."); return; }
  let added = 0;
  checked.forEach(kode => {
    const tpl = AHSP_TEMPLATES.find(t => t.kode === kode);
    if (!tpl || state.ahsp.some(a => a.kode === tpl.kode)) return;
    state.ahsp.push({
      id: uid(),
      kategori: tpl.kategori,
      kode: tpl.kode,
      uraian: tpl.uraian,
      satuan: tpl.satuan,
      mode: "detail",
      hargaManual: 0,
      overhead: tpl.overhead,
      referensi: tpl.referensi,
      komponen: resolveTemplateKomponen(tpl),
      riwayatHarga: []
    });
    added++;
  });
  saveState();
  renderAll();
  closeModals();
  alert(added ? `${added} item AHSP dari template berhasil ditambahkan. Silakan cek & koreksi harga/koefisien sesuai kondisi Anda.` : "Tidak ada item baru yang ditambahkan (mungkin sudah ada).");
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
  itemModalCtx.ahspId = existing ? (existing.ahspId || "") : "";
  updateItemJumlahPreview();
  itemModal.classList.add("open");
}
document.getElementById("it_ahspPick").addEventListener("change", () => {
  const a = state.ahsp.find(x => x.id === document.getElementById("it_ahspPick").value);
  if (a) {
    document.getElementById("it_uraian").value = a.uraian;
    document.getElementById("it_satuan").value = a.satuan;
    document.getElementById("it_harga").value = formatNumberInput(ahspHarga(a));
    itemModalCtx.ahspId = a.id;
    updateItemJumlahPreview();
  } else {
    itemModalCtx.ahspId = "";
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
    hargaSatuan: parseNumberInput(document.getElementById("it_harga").value),
    ahspId: itemModalCtx.ahspId || ""
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
      return { uraian: r.uraian, satuan: r.satuan, volume: r.volume, hargaSatuan: match ? ahspHarga(match) : 0, ahspId: match ? match.id : "" };
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
      results.push({ uraian, satuan, volume, hargaSatuan: match ? ahspHarga(match) : 0, ahspId: match ? match.id : "" });
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
  importPreviewRows = rows.map(r => ({ checked: true, uraian: r.uraian, satuan: r.satuan, volume: r.volume, hargaSatuan: r.hargaSatuan || 0, ahspId: r.ahspId || "" }));
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
    doc.items.push({ id: uid(), uraian: (r.uraian || "").trim() || "Item", satuan: (r.satuan || "").trim() || "-", volume: r.volume || 0, hargaSatuan: r.hargaSatuan || 0, ahspId: r.ahspId || "" });
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
  const filterSel = document.getElementById("rab_filterKategori");
  if (filterSel.options.length <= 1) {
    KATEGORI_PEKERJAAN.forEach(k => filterSel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`));
  }
  document.getElementById("rab_totalCount").textContent = state.proyekRab.length;
  document.getElementById("rab_totalNilai").textContent = rupiah(state.proyekRab.reduce((s, r) => s + rabTotals(r).total, 0));
  document.getElementById("rab_totalJadiProyek").textContent = state.proyekRab.filter(r => r.proyekId && state.proyek.some(p => p.id === r.proyekId)).length;

  const search = (document.getElementById("rab_search").value || "").toLowerCase();
  const filterKategori = filterSel.value;
  const tbody = document.querySelector("#rab_table tbody");
  tbody.innerHTML = "";
  let rows = state.proyekRab.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  if (search) rows = rows.filter(r => (r.nama || "").toLowerCase().includes(search) || (r.klien || "").toLowerCase().includes(search) || (r.nomor || "").toLowerCase().includes(search));
  if (filterKategori) rows = rows.filter(r => r.kategori === filterKategori);
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Belum ada RAB</td></tr>';
    return;
  }
  rows.forEach(r => {
    const { total } = rabTotals(r);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.nomor || "-")}</td>
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

  if (document.activeElement.id !== "rab_nomor") document.getElementById("rab_nomor").value = rab.nomor || "";
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
function buildRabPrintHtml(rab) {
  const { subtotal, ppnValue, pphValue, total } = rabTotals(rab);
  const itemsRows = rab.items.map((it, i) => `
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
    <h3 style="text-align:center; margin:6px 0 4px; letter-spacing:.5px;">RENCANA ANGGARAN BIAYA (RAB)</h3>
    <p class="doc-p" style="text-align:center; margin:0 0 16px;">Dokumen internal — bukan dokumen resmi untuk klien</p>

    <table class="meta-table">
      <tr><td>No. RAB</td><td>:</td><td>${escapeHtml(rab.nomor || "-")}</td></tr>
      <tr><td>Nama Proyek</td><td>:</td><td>${escapeHtml(rab.nama || "-")}</td></tr>
      <tr><td>Klien</td><td>:</td><td>${escapeHtml(rab.klien || "-")}</td></tr>
      <tr><td>Lokasi</td><td>:</td><td>${escapeHtml(rab.lokasi || "-")}</td></tr>
      <tr><td>Kategori</td><td>:</td><td>${escapeHtml(rab.kategori || "-")}</td></tr>
      <tr><td>Tanggal</td><td>:</td><td>${formatTanggal(rab.tanggal)}</td></tr>
    </table>

    <table class="doc-items" style="margin-top:16px;">
      <thead><tr><th>No</th><th>Uraian Pekerjaan</th><th class="c">Satuan</th><th class="r">Volume</th><th class="r">Harga Satuan</th><th class="r">Jumlah</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <table class="doc-summary-table">
      <tr><td>Subtotal</td><td class="r">${rupiah(subtotal)}</td></tr>
      ${rab.ppn ? `<tr><td>PPN (${rab.ppn}%)</td><td class="r">${rupiah(ppnValue)}</td></tr>` : ""}
      ${rab.biayaLain ? `<tr><td>Biaya Lain-lain</td><td class="r">${rupiah(rab.biayaLain)}</td></tr>` : ""}
      <tr class="total-row"><td>Total RAB</td><td class="r">${rupiah(total)}</td></tr>
    </table>
    ${rab.pph ? `<p class="doc-p" style="font-size:11px; color:#777;">*Sudah termasuk PPh Final (${rab.pph}%) sebesar ${rupiah(pphValue)}.</p>` : ""}

    <p style="font-size:11px; color:#777; margin-top:10px;">Dicetak ${formatTanggal(new Date().toISOString().slice(0, 10))}.</p>
  `;
}
document.getElementById("rab_printBtn").addEventListener("click", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (!rab) return;
  document.getElementById("printArea").innerHTML = buildRabPrintHtml(rab);
  document.body.classList.add("printing-quote");
  window.print();
});
document.getElementById("rab_addBtn").addEventListener("click", () => {
  const rab = { id: uid(), nomor: nextRabNomor(), nama: "", klien: "", lokasi: "", kategori: KATEGORI_PEKERJAAN[0], tanggal: new Date().toISOString().slice(0, 10), ppn: 0, pph: 0.5, biayaLain: 0, items: [] };
  state.proyekRab.push(rab);
  saveState();
  showRabEditor(rab.id);
});
document.getElementById("rab_backBtn").addEventListener("click", showRabList);
document.getElementById("rab_search").addEventListener("input", renderRabList);
document.getElementById("rab_filterKategori").addEventListener("change", renderRabList);
document.getElementById("rab_table").addEventListener("click", e => {
  const openBtn = e.target.closest("[data-open-rab]");
  const delBtn = e.target.closest("[data-delete-rab]");
  if (openBtn) showRabEditor(openBtn.dataset.openRab);
  else if (delBtn) {
    const rab = state.proyekRab.find(r => r.id === delBtn.dataset.deleteRab);
    const linkedProyek = rab && rab.proyekId ? state.proyek.find(p => p.id === rab.proyekId) : null;
    const msg = linkedProyek
      ? `RAB ini sudah punya Proyek terkait ("${linkedProyek.nama}"). Proyek itu TIDAK akan ikut terhapus, tapi tautannya akan terputus. Yakin hapus RAB ini?`
      : "Hapus RAB ini?";
    if (confirm(msg)) {
      state.proyekRab = state.proyekRab.filter(r => r.id !== delBtn.dataset.deleteRab);
      saveState();
      renderRabList();
    }
  }
});
["rab_nomor", "rab_nama", "rab_klien", "rab_lokasi"].forEach(id => {
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
    items: rab.items.map(it => ({ id: uid(), uraian: it.uraian, satuan: it.satuan, volume: it.volume, hargaSatuan: it.hargaSatuan, ahspId: it.ahspId || "" })),
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
document.getElementById("rab_toProyekBtn").addEventListener("click", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) offerCreateProyekFromDoc("rab", rab);
});

// ===== RAB/Penawaran -> Proyek (anggaran otomatis dari komponen AHSP) =====
function anggaranFromItems(items) {
  let bahan = 0, upah = 0, lain = 0, allocated = 0, unallocated = 0;
  (items || []).forEach(it => {
    const jumlah = (it.volume || 0) * (it.hargaSatuan || 0);
    const ahsp = it.ahspId ? state.ahsp.find(a => a.id === it.ahspId) : null;
    const komponen = ahsp && ahsp.mode === "detail" ? (ahsp.komponen || []) : [];
    const subtotal = komponen.reduce((s, k) => s + (k.koefisien || 0) * (k.harga || 0), 0);
    if (subtotal > 0) {
      const bahanSub = komponen.filter(k => k.jenis === "Bahan").reduce((s, k) => s + (k.koefisien || 0) * (k.harga || 0), 0);
      const upahSub = komponen.filter(k => k.jenis === "Upah").reduce((s, k) => s + (k.koefisien || 0) * (k.harga || 0), 0);
      const alatSub = subtotal - bahanSub - upahSub;
      bahan += jumlah * (bahanSub / subtotal);
      upah += jumlah * (upahSub / subtotal);
      lain += jumlah * (alatSub / subtotal);
      allocated++;
    } else {
      lain += jumlah;
      unallocated++;
    }
  });
  return { anggaranBahan: Math.round(bahan), anggaranUpah: Math.round(upah), anggaranLain: Math.round(lain), allocated, unallocated };
}
function createProyekFromDoc(kind, doc) {
  const totals = kind === "rab" ? rabTotals(doc) : penawaranTotals(doc);
  const alokasi = anggaranFromItems(doc.items);
  const proj = {
    id: uid(),
    nama: kind === "rab" ? (doc.nama || "(Tanpa nama)") : (doc.perihal || doc.nomor || "(Tanpa nama)"),
    klien: kind === "rab" ? (doc.klien || "") : (doc.kepada || ""),
    klienId: kind === "pw" ? (doc.klienId || "") : "",
    lokasi: kind === "rab" ? (doc.lokasi || "") : "",
    nilaiKontrak: totals.total,
    status: "berjalan",
    tanggalMulai: new Date().toISOString().slice(0, 10),
    tanggalSelesai: "",
    biayaBahan: alokasi.anggaranBahan,
    biayaUpah: alokasi.anggaranUpah,
    biayaLain: alokasi.anggaranLain,
    karyawanIds: [],
    subkontraktor: [],
    belanjaMaterial: [],
    sumberRabId: kind === "rab" ? doc.id : "",
    sumberPenawaranId: kind === "pw" ? doc.id : ""
  };
  state.proyek.push(proj);
  doc.proyekId = proj.id;
  saveState();
  return { proj, alokasi };
}
function goToDoc(kind, id) {
  if (kind === "rab") { showPage("rab"); showRabEditor(id); }
  else { showPage("penawaran"); showPwEditor(id); }
}
function offerCreateProyekFromDoc(kind, doc) {
  if (doc.proyekId && state.proyek.some(p => p.id === doc.proyekId)) {
    showPage("proyek");
    showProyekDetail(doc.proyekId);
    return;
  }
  if (!doc.items.length) { alert("Belum ada item pekerjaan — tambah item dulu sebelum membuat Proyek."); return; }
  const { proj, alokasi } = createProyekFromDoc(kind, doc);
  renderAll();
  showPage("proyek");
  showProyekDetail(proj.id);
  const pesan = alokasi.unallocated
    ? `Proyek "${proj.nama}" berhasil dibuat. ${alokasi.allocated} item berhasil dipilah otomatis ke Bahan/Upah dari AHSP, ${alokasi.unallocated} item belum bisa dipilah (masuk ke Lain-lain) — silakan koreksi anggarannya di sini.`
    : `Proyek "${proj.nama}" berhasil dibuat, dengan anggaran Bahan/Upah/Lain terisi otomatis dari rincian AHSP. Silakan cek & koreksi kalau perlu.`;
  alert(pesan);
}

// ===== Rendering: Penawaran Harga =====
let currentPwId = null;
function pwStatusLabel(s) {
  return { draft: "Draft", terkirim: "Terkirim", disetujui: "Disetujui", ditolak: "Ditolak" }[s] || s;
}
function pwIsKadaluarsa(p, today) {
  return ["draft", "terkirim"].includes(p.status) && p.tanggal && addDaysIso(p.tanggal, 14) < today;
}
function renderPwList() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("pw_totalCount").textContent = state.penawaran.length;
  document.getElementById("pw_totalMenunggu").textContent = state.penawaran.filter(p => ["draft", "terkirim"].includes(p.status)).length;
  document.getElementById("pw_totalDisetujui").textContent = state.penawaran.filter(p => p.status === "disetujui").length;
  document.getElementById("pw_totalKadaluarsa").textContent = state.penawaran.filter(p => pwIsKadaluarsa(p, today)).length;

  const search = (document.getElementById("pw_search").value || "").toLowerCase();
  const filterStatus = document.getElementById("pw_filterStatus").value;
  const tbody = document.querySelector("#pw_table tbody");
  tbody.innerHTML = "";
  let rows = state.penawaran.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  if (search) rows = rows.filter(p => (p.nomor || "").toLowerCase().includes(search) || (p.kepada || "").toLowerCase().includes(search) || (p.perihal || "").toLowerCase().includes(search));
  if (filterStatus) rows = rows.filter(p => p.status === filterStatus);
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Belum ada penawaran</td></tr>';
    return;
  }
  rows.forEach(p => {
    const { total } = penawaranTotals(p);
    const kadaluarsa = pwIsKadaluarsa(p, today);
    const tr = document.createElement("tr");
    if (kadaluarsa) tr.classList.add("pw-row-kadaluarsa");
    tr.innerHTML = `
      <td>${escapeHtml(p.nomor)}${p.revisiDariId ? ` <span class="muted" style="font-size:11px;">(Revisi ${p.revisiKe || 1})</span>` : ""}</td>
      <td>${escapeHtml(p.kepada || "-")}</td>
      <td>${escapeHtml(p.perihal || "-")}</td>
      <td>${formatTanggal(p.tanggal)}</td>
      <td class="num">${rupiah(total)}</td>
      <td><span class="badge status-${p.status}">${pwStatusLabel(p.status)}</span>${kadaluarsa ? ' <span class="bad" style="font-size:11px;">⚠️ Kadaluarsa</span>' : ""}</td>
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

  const revisiNote = document.getElementById("pw_revisiNote");
  const asal = pw.revisiDariId ? state.penawaran.find(p => p.id === pw.revisiDariId) : null;
  if (asal) {
    revisiNote.style.display = "block";
    revisiNote.innerHTML = `🔁 Revisi ke-${pw.revisiKe || 1} dari <a href="#" data-open-pw-asal="${asal.id}">${escapeHtml(asal.nomor)}</a>`;
  } else {
    revisiNote.style.display = "none";
    revisiNote.innerHTML = "";
  }

  const focusedId = document.activeElement.id;
  if (focusedId !== "pw_nomor") document.getElementById("pw_nomor").value = pw.nomor || "";
  document.getElementById("pw_tanggal").value = pw.tanggal || "";
  if (focusedId !== "pw_kepada") document.getElementById("pw_kepada").value = pw.kepada || "";
  const pwKlienSel = document.getElementById("pw_klienId");
  pwKlienSel.innerHTML = '<option value="">Tidak dikaitkan</option>' + state.klien.map(k => `<option value="${k.id}">${escapeHtml(k.nama)}</option>`).join("");
  pwKlienSel.value = pw.klienId || "";
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
  const { subtotal, pphValue, total } = penawaranTotals(pw);
  document.getElementById("pw_subtotal").textContent = rupiah(subtotal);
  document.getElementById("pw_pphValue").textContent = rupiah(pphValue);
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
document.getElementById("pw_search").addEventListener("input", renderPwList);
document.getElementById("pw_filterStatus").addEventListener("change", renderPwList);
document.getElementById("pw_table").addEventListener("click", e => {
  const openBtn = e.target.closest("[data-open-pw]");
  const delBtn = e.target.closest("[data-delete-pw]");
  if (openBtn) showPwEditor(openBtn.dataset.openPw);
  else if (delBtn) {
    const pw = state.penawaran.find(p => p.id === delBtn.dataset.deletePw);
    const linkedProyek = pw && pw.proyekId ? state.proyek.find(p => p.id === pw.proyekId) : null;
    const msg = linkedProyek
      ? `Penawaran ini sudah punya Proyek terkait ("${linkedProyek.nama}"). Proyek itu TIDAK akan ikut terhapus, tapi tautannya akan terputus. Yakin hapus penawaran ini?`
      : "Hapus penawaran ini?";
    if (confirm(msg)) {
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
document.getElementById("pw_klienId").addEventListener("change", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.klienId = document.getElementById("pw_klienId").value || ""; saveState(); }
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
  if (!pw) return;
  const newStatus = document.getElementById("pw_status").value;
  const prevStatus = pw.status;
  pw.status = newStatus;
  if (newStatus === "disetujui" && prevStatus !== "disetujui") {
    const klien = pw.klienId ? state.klien.find(k => k.id === pw.klienId) : null;
    const needKlienUpdate = !!(klien && !["Deal/SPK", "Selesai"].includes(klien.tahap));
    const needProyek = !(pw.proyekId && state.proyek.some(p => p.id === pw.proyekId)) && pw.items.length > 0;
    if (needKlienUpdate || needProyek) {
      const parts = [];
      if (needKlienUpdate) parts.push(`ubah tahap Klien "${klien.nama}" jadi "Deal/SPK"`);
      if (needProyek) parts.push("buat Proyek baru dari penawaran ini");
      if (confirm(`Penawaran ini disetujui klien. Sekalian ${parts.join(" dan ")}?`)) {
        if (needKlienUpdate) {
          klien.tahap = "Deal/SPK";
          if (!klien.riwayatKontak) klien.riwayatKontak = [];
          klien.riwayatKontak.push({ id: uid(), tanggal: new Date().toISOString().slice(0, 10), catatan: `Penawaran ${pw.nomor} disetujui — tahap otomatis diubah ke Deal/SPK` });
        }
        if (needProyek) {
          const { proj } = createProyekFromDoc("pw", pw);
          saveState();
          renderAll();
          showPage("proyek");
          showProyekDetail(proj.id);
          alert(`Proyek "${proj.nama}" berhasil dibuat dari penawaran ini. Silakan cek & koreksi anggarannya.`);
          return;
        }
      }
    }
  }
  saveState();
  renderAll();
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
  rab.items.forEach(it => pw.items.push({ id: uid(), uraian: it.uraian, satuan: it.satuan, volume: it.volume, hargaSatuan: it.hargaSatuan, ahspId: it.ahspId || "" }));
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
      <tr class="total-row"><td>Total Penawaran</td><td class="r">${rupiah(total)}</td></tr>
    </table>
    ${pw.pph ? `<p class="doc-p" style="font-size:11px; color:#777;">*Sudah termasuk PPh Final (${pw.pph}%) sebesar ${rupiah(pphValue)} sesuai Syarat &amp; Ketentuan di bawah.</p>` : ""}

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
document.getElementById("pw_toProyekBtn").addEventListener("click", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) offerCreateProyekFromDoc("pw", pw);
});
document.getElementById("pw_duplicateBtn").addEventListener("click", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (!pw) return;
  if (!confirm(`Buat revisi baru dari penawaran "${pw.nomor}"? Item, syarat, dan data lain akan disalin — penawaran asli tidak berubah.`)) return;
  const revisi = {
    ...pw,
    id: uid(),
    nomor: nextPenawaranNomor(),
    tanggal: new Date().toISOString().slice(0, 10),
    status: "draft",
    proyekId: "",
    revisiDariId: pw.id,
    revisiKe: (pw.revisiKe || 0) + 1,
    items: pw.items.map(it => ({ ...it, id: uid() }))
  };
  state.penawaran.push(revisi);
  saveState();
  showPwEditor(revisi.id);
});
document.getElementById("pw_revisiNote").addEventListener("click", e => {
  const link = e.target.closest("[data-open-pw-asal]");
  if (link) { e.preventDefault(); showPwEditor(link.dataset.openPwAsal); }
});
window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-quote");
});

function renderAll() {
  renderDashboard();
  renderKasBook("kasUsaha");
  renderKasBook("kasPribadi");
  document.getElementById("kl_listView").style.display = currentKlienId ? "none" : "block";
  document.getElementById("kl_detailView").style.display = currentKlienId ? "block" : "none";
  if (currentKlienId) renderKlienDetail(); else renderKlienList();
  document.getElementById("pr_listView").style.display = currentProyekId ? "none" : "block";
  document.getElementById("pr_detailView").style.display = currentProyekId ? "block" : "none";
  if (currentProyekId) renderProyekDetail(); else renderProyekList();
  renderKaryawanList();
  { const activeSubtab = document.querySelector('.subtab-item[data-subtab-page="ky"].active');
    if (activeSubtab && activeSubtab.dataset.subtab === "absensi") renderAbsensiPanel();
    if (activeSubtab && activeSubtab.dataset.subtab === "penggajian") renderPenggajianPanel(); }
  { const activeLkSubtab = document.querySelector('.subtab-item[data-subtab-page="lk"].active');
    if (!activeLkSubtab || activeLkSubtab.dataset.subtab === "labarugi") renderLabaRugi(); else renderNeraca(); }
  document.getElementById("stok_listView").style.display = currentStokId ? "none" : "block";
  document.getElementById("stok_riwayatView").style.display = currentStokId ? "block" : "none";
  if (currentStokId) renderStokRiwayat(); else renderStokList();
  document.getElementById("pm_listView").style.display = currentPemasokId ? "none" : "block";
  document.getElementById("pm_detailView").style.display = currentPemasokId ? "block" : "none";
  if (currentPemasokId) renderPemasokDetail(); else renderPemasokList();
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
  const approvalInput = document.getElementById("settingsApprovalThreshold");
  if (document.activeElement !== approvalInput) approvalInput.value = formatNumberInput(state.approvalThreshold || 0);
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

  const proyekField = document.getElementById("txn_proyekField");
  proyekField.style.display = book === "kasUsaha" ? "flex" : "none";
  if (book === "kasUsaha") {
    const proyekSelect = document.getElementById("txn_proyekId");
    proyekSelect.innerHTML = '<option value="">Tidak dikaitkan</option>' +
      state.proyek.map(p => `<option value="${p.id}">${escapeHtml(p.nama)}</option>`).join("");
    proyekSelect.value = existing ? (existing.proyekId || "") : "";
  }

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

function maybeSuggestApprovalStatus() {
  const book = document.getElementById("txn_book").value;
  const tipe = document.getElementById("txn_tipe").value;
  const statusSel = document.getElementById("txn_status");
  const threshold = state.approvalThreshold || 0;
  const jumlah = parseNumberInput(document.getElementById("txn_jumlah").value);
  if (book === "kasUsaha" && tipe === "Keluar" && threshold > 0 && jumlah >= threshold && statusSel.value === "lunas") {
    statusSel.value = "menunggu_persetujuan";
  }
}
document.getElementById("txn_jumlah").addEventListener("input", maybeSuggestApprovalStatus);
document.getElementById("txn_tipe").addEventListener("change", maybeSuggestApprovalStatus);
attachNumberFormatting(document.getElementById("txn_jumlah"));

document.getElementById("txnForm").addEventListener("submit", e => {
  e.preventDefault();
  const book = document.getElementById("txn_book").value;
  const id = document.getElementById("txn_id").value;
  const arr = state[book].transactions;
  const existing = id ? arr.find(t => t.id === id) : null;
  const txn = {
    ...existing,
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
  if (book === "kasUsaha") txn.proyekId = document.getElementById("txn_proyekId").value || "";
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
    const approveBtn = e.target.closest("[data-approve]");
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
    } else if (approveBtn) {
      const book = approveBtn.dataset.book;
      const t = state[book].transactions.find(x => x.id === approveBtn.dataset.approve);
      if (t && confirm(`Setujui pengeluaran ${rupiah(t.jumlah)} ini? Saldo Kas Perusahaan akan langsung berkurang.`)) {
        t.status = "lunas";
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
  document.getElementById("pj_klien").value = existing ? (existing.klien || "") : "";
  const pjKlienSel = document.getElementById("pj_klienId");
  pjKlienSel.innerHTML = '<option value="">Tidak dikaitkan</option>' + state.klien.map(k => `<option value="${k.id}">${escapeHtml(k.nama)}</option>`).join("");
  pjKlienSel.value = existing ? (existing.klienId || "") : "";
  document.getElementById("pj_lokasi").value = existing ? (existing.lokasi || "") : "";
  document.getElementById("pj_nilai").value = existing ? formatNumberInput(existing.nilaiKontrak) : "";
  document.getElementById("pj_status").value = existing ? (existing.status || "berjalan") : "berjalan";
  document.getElementById("pj_tanggalMulai").value = existing ? (existing.tanggalMulai || "") : "";
  document.getElementById("pj_tanggalSelesai").value = existing ? (existing.tanggalSelesai || "") : "";
  document.getElementById("pj_bahan").value = existing ? formatNumberInput(existing.biayaBahan) : "";
  document.getElementById("pj_upah").value = existing ? formatNumberInput(existing.biayaUpah) : "";
  document.getElementById("pj_lain").value = existing ? formatNumberInput(existing.biayaLain) : "";

  const karyawanIds = new Set(existing ? (existing.karyawanIds || []) : []);
  const aktif = state.karyawan.filter(k => k.aktif !== false).slice().sort((a, b) => a.nama.localeCompare(b.nama));
  const checklist = document.getElementById("pj_karyawanChecklist");
  checklist.innerHTML = aktif.length
    ? aktif.map(k => `
      <label><input type="checkbox" value="${k.id}" ${karyawanIds.has(k.id) ? "checked" : ""}> ${escapeHtml(k.nama)}</label>
    `).join("")
    : '<span class="checklist-empty">Belum ada karyawan aktif</span>';

  proyekModal.classList.add("open");
}
["pj_nilai", "pj_bahan", "pj_upah", "pj_lain"].forEach(id => attachNumberFormatting(document.getElementById(id)));

document.querySelectorAll("[data-open-modal='proyek']").forEach(btn => {
  btn.addEventListener("click", () => openProyekModal(null));
});
document.getElementById("proyekForm").addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("pj_id").value;
  const idx = state.proyek.findIndex(p => p.id === id);
  const existing = idx >= 0 ? state.proyek[idx] : null;
  const karyawanIds = Array.from(document.querySelectorAll("#pj_karyawanChecklist input:checked")).map(el => el.value);
  const proj = {
    ...existing,
    id: id || uid(),
    nama: document.getElementById("pj_nama").value.trim(),
    klien: document.getElementById("pj_klien").value.trim(),
    klienId: document.getElementById("pj_klienId").value || "",
    lokasi: document.getElementById("pj_lokasi").value.trim(),
    nilaiKontrak: parseNumberInput(document.getElementById("pj_nilai").value),
    status: document.getElementById("pj_status").value,
    tanggalMulai: document.getElementById("pj_tanggalMulai").value,
    tanggalSelesai: document.getElementById("pj_tanggalSelesai").value,
    biayaBahan: parseNumberInput(document.getElementById("pj_bahan").value),
    biayaUpah: parseNumberInput(document.getElementById("pj_upah").value),
    biayaLain: parseNumberInput(document.getElementById("pj_lain").value),
    karyawanIds,
    subkontraktor: existing ? (existing.subkontraktor || []) : [],
    belanjaMaterial: existing ? (existing.belanjaMaterial || []) : []
  };
  if (idx >= 0) state.proyek[idx] = proj; else state.proyek.push(proj);
  saveState();
  renderAll();
  closeModals();
});
document.getElementById("pr_table").addEventListener("click", e => {
  const openBtn = e.target.closest("[data-open-proyek]");
  const editBtn = e.target.closest("[data-edit-proyek]");
  const delBtn = e.target.closest("[data-delete-proyek]");
  if (openBtn) {
    showProyekDetail(openBtn.dataset.openProyek);
  } else if (editBtn) {
    const p = state.proyek.find(x => x.id === editBtn.dataset.editProyek);
    if (p) openProyekModal(p);
  } else if (delBtn) {
    if (confirm("Hapus proyek ini? Transaksi Kas Perusahaan yang sudah terkait proyek ini tidak akan ikut terhapus.")) {
      state.proyek = state.proyek.filter(x => x.id !== delBtn.dataset.deleteProyek);
      if (currentProyekId === delBtn.dataset.deleteProyek) currentProyekId = null;
      saveState();
      renderAll();
    }
  }
});
document.getElementById("pd_editBtn").addEventListener("click", () => {
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (p) openProyekModal(p);
});
document.getElementById("pd_backBtn").addEventListener("click", showProyekList);
document.getElementById("pd_infoRows").addEventListener("click", e => {
  const rabLink = e.target.closest("[data-open-sumber-rab]");
  const pwLink = e.target.closest("[data-open-sumber-pw]");
  if (rabLink) { e.preventDefault(); goToDoc("rab", rabLink.dataset.openSumberRab); }
  else if (pwLink) { e.preventDefault(); goToDoc("pw", pwLink.dataset.openSumberPw); }
});

// ----- Termin Pembayaran (derived from + written back to Kas Perusahaan) -----
attachNumberFormatting(document.getElementById("tm_jumlah"));
document.getElementById("tm_addBtn").addEventListener("click", () => {
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) return;
  const tanggal = document.getElementById("tm_tanggal").value;
  const keterangan = document.getElementById("tm_keterangan").value.trim();
  const jumlah = parseNumberInput(document.getElementById("tm_jumlah").value);
  if (!tanggal || !keterangan || !jumlah) { alert("Isi tanggal, keterangan, dan jumlah terlebih dahulu."); return; }
  state.kasUsaha.transactions.push({
    id: uid(),
    proyekId: p.id,
    tipe: "Masuk",
    status: document.getElementById("tm_status").value,
    tanggal, jumlah, keterangan,
    kategori: "Pendapatan Jasa",
    extra: p.nama,
    catatan: "Termin dicatat dari Margin Proyek"
  });
  saveState();
  document.getElementById("tm_tanggal").value = "";
  document.getElementById("tm_keterangan").value = "";
  document.getElementById("tm_jumlah").value = "";
  renderAll();
});
document.getElementById("pd_terminTable").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-termin]");
  if (delBtn && confirm("Hapus termin pembayaran ini? Transaksi ini juga akan terhapus dari Kas Perusahaan.")) {
    state.kasUsaha.transactions = state.kasUsaha.transactions.filter(t => t.id !== delBtn.dataset.deleteTermin);
    saveState();
    renderAll();
  }
});

// ----- Daftar Belanja Material (auto-post ke Kas Perusahaan + Stok) -----
function syncBelanjaMaterial(p, item) {
  state.kasUsaha.transactions = state.kasUsaha.transactions.filter(t => t.sumberBelanjaId !== item.id);
  state.stok.forEach(s => { s.transactions = (s.transactions || []).filter(t => t.sumberBelanjaId !== item.id); });
  if (item.status !== "Dibeli") return;
  const tanggal = item.tanggal || new Date().toISOString().slice(0, 10);
  const jumlahBelanja = (item.qty || 0) * (item.hargaSatuan || 0);
  state.kasUsaha.transactions.push({
    id: uid(),
    sumberBelanjaId: item.id,
    proyekId: p.id,
    tipe: "Keluar",
    status: expenseApprovalStatus(jumlahBelanja),
    tanggal,
    jumlah: jumlahBelanja,
    keterangan: `Belanja material: ${item.nama} (${p.nama})`,
    kategori: "Biaya Bahan",
    extra: p.nama,
    catatan: "Otomatis dari Daftar Belanja Material"
  });
  if (item.stokId) {
    const stokItem = state.stok.find(s => s.id === item.stokId);
    if (stokItem) {
      if (!stokItem.transactions) stokItem.transactions = [];
      stokItem.transactions.push({
        id: uid(),
        sumberBelanjaId: item.id,
        tipe: "Masuk",
        tanggal,
        qty: item.qty || 0,
        gudangId: item.gudangId || "",
        keterangan: `Belanja proyek ${p.nama}`
      });
    }
  }
}
const belanjaModal = document.getElementById("belanjaModal");
function openBelanjaModal(existing) {
  document.getElementById("bm_id").value = existing ? existing.id : "";
  document.getElementById("belanjaModalTitle").textContent = existing ? "Edit Belanja Material" : "Tambah Belanja Material";
  document.getElementById("bm_nama").value = existing ? existing.nama : "";
  document.getElementById("bm_qty").value = existing ? existing.qty : "";
  document.getElementById("bm_satuan").value = existing ? (existing.satuan || "") : "";
  document.getElementById("bm_harga").value = existing ? formatNumberInput(existing.hargaSatuan) : "";
  document.getElementById("bm_tanggal").value = existing ? (existing.tanggal || "") : new Date().toISOString().slice(0, 10);
  document.getElementById("bm_status").value = existing ? existing.status : "Rencana";
  const stokSelect = document.getElementById("bm_stokId");
  stokSelect.innerHTML = '<option value="">Tidak dikaitkan</option>' + state.stok.map(s => `<option value="${s.id}">${escapeHtml(s.nama)}</option>`).join("");
  stokSelect.value = existing ? (existing.stokId || "") : "";
  const pemasokSelect = document.getElementById("bm_pemasokId");
  pemasokSelect.innerHTML = '<option value="">Tidak dikaitkan</option>' + state.pemasok.map(pm => `<option value="${pm.id}">${escapeHtml(pm.nama)}</option>`).join("");
  pemasokSelect.value = existing ? (existing.pemasokId || "") : "";
  const gudangSelect = document.getElementById("bm_gudangId");
  gudangSelect.innerHTML = '<option value="">Tidak ditentukan</option>' + state.gudang.map(g => `<option value="${g.id}">${escapeHtml(g.nama)}</option>`).join("");
  gudangSelect.value = existing ? (existing.gudangId || "") : "";
  belanjaModal.classList.add("open");
}
attachNumberFormatting(document.getElementById("bm_harga"));
document.getElementById("bm_addBtn").addEventListener("click", () => openBelanjaModal(null));
document.getElementById("belanjaForm").addEventListener("submit", e => {
  e.preventDefault();
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) { closeModals(); return; }
  if (!p.belanjaMaterial) p.belanjaMaterial = [];
  const id = document.getElementById("bm_id").value;
  const item = {
    id: id || uid(),
    nama: document.getElementById("bm_nama").value.trim(),
    qty: parseFloat((document.getElementById("bm_qty").value || "").replace(",", ".")) || 0,
    satuan: document.getElementById("bm_satuan").value.trim(),
    hargaSatuan: parseNumberInput(document.getElementById("bm_harga").value),
    tanggal: document.getElementById("bm_tanggal").value,
    status: document.getElementById("bm_status").value,
    stokId: document.getElementById("bm_stokId").value || "",
    pemasokId: document.getElementById("bm_pemasokId").value || "",
    gudangId: document.getElementById("bm_gudangId").value || ""
  };
  const idx = p.belanjaMaterial.findIndex(b => b.id === id);
  if (idx >= 0) p.belanjaMaterial[idx] = item; else p.belanjaMaterial.push(item);
  syncBelanjaMaterial(p, item);
  saveState();
  renderAll();
  closeModals();
});
document.getElementById("pd_belanjaTable").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-belanja]");
  const delBtn = e.target.closest("[data-delete-belanja]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) return;
  if (editBtn) {
    const item = (p.belanjaMaterial || []).find(b => b.id === editBtn.dataset.editBelanja);
    if (item) openBelanjaModal(item);
  } else if (delBtn) {
    if (confirm("Hapus item belanja ini? Transaksi Kas Perusahaan/Stok yang otomatis tercatat dari item ini akan ikut terhapus.")) {
      const bid = delBtn.dataset.deleteBelanja;
      p.belanjaMaterial = (p.belanjaMaterial || []).filter(b => b.id !== bid);
      state.kasUsaha.transactions = state.kasUsaha.transactions.filter(t => t.sumberBelanjaId !== bid);
      state.stok.forEach(s => { s.transactions = (s.transactions || []).filter(t => t.sumberBelanjaId !== bid); });
      saveState();
      renderAll();
    }
  }
});

// ----- Subkontraktor -----
const subkonModal = document.getElementById("subkonModal");
function openSubkonModal(existing) {
  document.getElementById("sk_id").value = existing ? existing.id : "";
  document.getElementById("subkonModalTitle").textContent = existing ? "Edit Subkontraktor" : "Tambah Subkontraktor";
  document.getElementById("sk_nama").value = existing ? existing.nama : "";
  document.getElementById("sk_pekerjaan").value = existing ? (existing.pekerjaan || "") : "";
  document.getElementById("sk_nilai").value = existing ? formatNumberInput(existing.nilaiKontrak) : "";
  document.getElementById("sk_catatan").value = existing ? (existing.catatan || "") : "";
  subkonModal.classList.add("open");
}
attachNumberFormatting(document.getElementById("sk_nilai"));
document.getElementById("sk_addBtn").addEventListener("click", () => openSubkonModal(null));
document.getElementById("subkonForm").addEventListener("submit", e => {
  e.preventDefault();
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) { closeModals(); return; }
  if (!p.subkontraktor) p.subkontraktor = [];
  const id = document.getElementById("sk_id").value;
  const sk = {
    id: id || uid(),
    nama: document.getElementById("sk_nama").value.trim(),
    pekerjaan: document.getElementById("sk_pekerjaan").value.trim(),
    nilaiKontrak: parseNumberInput(document.getElementById("sk_nilai").value),
    catatan: document.getElementById("sk_catatan").value.trim()
  };
  const idx = p.subkontraktor.findIndex(s => s.id === id);
  if (idx >= 0) p.subkontraktor[idx] = sk; else p.subkontraktor.push(sk);
  saveState();
  renderAll();
  closeModals();
});
const subkonBayarModal = document.getElementById("subkonBayarModal");
attachNumberFormatting(document.getElementById("skb_jumlah"));
document.getElementById("subkonBayarForm").addEventListener("submit", e => {
  e.preventDefault();
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) { closeModals(); return; }
  const subkonId = document.getElementById("skb_subkonId").value;
  const sk = (p.subkontraktor || []).find(s => s.id === subkonId);
  if (!sk) { closeModals(); return; }
  const jumlahBayar = parseNumberInput(document.getElementById("skb_jumlah").value);
  state.kasUsaha.transactions.push({
    id: uid(),
    proyekId: p.id,
    subkonId: sk.id,
    tipe: "Keluar",
    status: expenseApprovalStatus(jumlahBayar),
    tanggal: document.getElementById("skb_tanggal").value,
    jumlah: jumlahBayar,
    keterangan: `Pembayaran subkontraktor: ${sk.nama} (${p.nama})`,
    kategori: "Biaya Subkontraktor",
    extra: p.nama,
    catatan: document.getElementById("skb_catatan").value.trim() || "Otomatis dari pembayaran subkontraktor"
  });
  saveState();
  renderAll();
  closeModals();
});
document.getElementById("pd_subkonTable").addEventListener("click", e => {
  const bayarBtn = e.target.closest("[data-bayar-subkon]");
  const editBtn = e.target.closest("[data-edit-subkon]");
  const delBtn = e.target.closest("[data-delete-subkon]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) return;
  if (bayarBtn) {
    document.getElementById("skb_subkonId").value = bayarBtn.dataset.bayarSubkon;
    document.getElementById("skb_tanggal").value = new Date().toISOString().slice(0, 10);
    document.getElementById("skb_jumlah").value = "";
    document.getElementById("skb_catatan").value = "";
    subkonBayarModal.classList.add("open");
  } else if (editBtn) {
    const sk = (p.subkontraktor || []).find(s => s.id === editBtn.dataset.editSubkon);
    if (sk) openSubkonModal(sk);
  } else if (delBtn) {
    if (confirm("Hapus subkontraktor ini? Riwayat pembayaran yang sudah tercatat di Kas Perusahaan tidak ikut terhapus.")) {
      p.subkontraktor = (p.subkontraktor || []).filter(s => s.id !== delBtn.dataset.deleteSubkon);
      saveState();
      renderAll();
    }
  }
});

// ----- Progress Fisik Proyek -----
document.getElementById("pfr_addBtn").addEventListener("click", () => {
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) return;
  const tanggal = document.getElementById("pfr_tanggal").value;
  const persen = parseFloat(document.getElementById("pfr_persen").value);
  if (!tanggal || isNaN(persen)) { alert("Isi tanggal target dan % target terlebih dahulu."); return; }
  if (!p.progressRencana) p.progressRencana = [];
  p.progressRencana.push({ id: uid(), tanggal, persen: Math.max(0, Math.min(100, persen)), keterangan: document.getElementById("pfr_keterangan").value.trim() });
  saveState();
  document.getElementById("pfr_tanggal").value = "";
  document.getElementById("pfr_persen").value = "";
  document.getElementById("pfr_keterangan").value = "";
  renderProyekDetail();
});
document.getElementById("pf_rencanaTable").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-rencana]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (delBtn && p) {
    p.progressRencana = (p.progressRencana || []).filter(r => r.id !== delBtn.dataset.deleteRencana);
    saveState();
    renderProyekDetail();
  }
});
document.getElementById("pfa_addBtn").addEventListener("click", () => {
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) return;
  const tanggal = document.getElementById("pfa_tanggal").value;
  const persen = parseFloat(document.getElementById("pfa_persen").value);
  if (!tanggal || isNaN(persen)) { alert("Isi tanggal dan % realisasi terlebih dahulu."); return; }
  if (!p.progressRealisasi) p.progressRealisasi = [];
  p.progressRealisasi.push({ id: uid(), tanggal, persen: Math.max(0, Math.min(100, persen)), catatan: document.getElementById("pfa_catatan").value.trim() });
  saveState();
  document.getElementById("pfa_tanggal").value = "";
  document.getElementById("pfa_persen").value = "";
  document.getElementById("pfa_catatan").value = "";
  renderProyekDetail();
});
document.getElementById("pf_realisasiTable").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-realisasi]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (delBtn && p) {
    p.progressRealisasi = (p.progressRealisasi || []).filter(r => r.id !== delBtn.dataset.deleteRealisasi);
    saveState();
    renderProyekDetail();
  }
});

// ----- Dokumen Proyek (SPK/BAST) & Garansi -----
const dokumenModal = document.getElementById("dokumenModal");
function openDokumenModal(existing) {
  document.getElementById("dok_id").value = existing ? existing.id : "";
  document.getElementById("dokumenModalTitle").textContent = existing ? "Edit Dokumen" : "Tambah Dokumen";
  document.getElementById("dok_jenis").value = existing ? existing.jenis : "SPK";
  document.getElementById("dok_nomor").value = existing ? (existing.nomor || "") : "";
  document.getElementById("dok_tanggalTerbit").value = existing ? (existing.tanggalTerbit || "") : new Date().toISOString().slice(0, 10);
  document.getElementById("dok_garansiSampai").value = existing ? (existing.garansiSampai || "") : "";
  document.getElementById("dok_catatan").value = existing ? (existing.catatan || "") : "";
  dokumenModal.classList.add("open");
}
document.getElementById("dok_addBtn").addEventListener("click", () => openDokumenModal(null));
document.getElementById("dokumenForm").addEventListener("submit", e => {
  e.preventDefault();
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) { closeModals(); return; }
  if (!p.dokumen) p.dokumen = [];
  const id = document.getElementById("dok_id").value;
  const dok = {
    id: id || uid(),
    jenis: document.getElementById("dok_jenis").value,
    nomor: document.getElementById("dok_nomor").value.trim(),
    tanggalTerbit: document.getElementById("dok_tanggalTerbit").value,
    garansiSampai: document.getElementById("dok_garansiSampai").value,
    catatan: document.getElementById("dok_catatan").value.trim()
  };
  const idx = p.dokumen.findIndex(d => d.id === id);
  if (idx >= 0) p.dokumen[idx] = dok; else p.dokumen.push(dok);
  saveState();
  renderProyekDetail();
  closeModals();
});
document.getElementById("pd_dokumenTable").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-dokumen]");
  const delBtn = e.target.closest("[data-delete-dokumen]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) return;
  if (editBtn) {
    const dok = (p.dokumen || []).find(d => d.id === editBtn.dataset.editDokumen);
    if (dok) openDokumenModal(dok);
  } else if (delBtn) {
    if (confirm("Hapus dokumen ini?")) {
      p.dokumen = (p.dokumen || []).filter(d => d.id !== delBtn.dataset.deleteDokumen);
      saveState();
      renderProyekDetail();
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
attachNumberFormatting(document.getElementById("settingsApprovalThreshold"));
document.getElementById("settingsApprovalThreshold").addEventListener("input", e => { state.approvalThreshold = parseNumberInput(e.target.value); saveState(); });
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
