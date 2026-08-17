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
  s.penawaran.forEach(p => { if (!p.brand) p.brand = "mitra"; if (typeof p.biayaLain !== "number") p.biayaLain = 0; });
  if (typeof s.penawaranCounter !== "number") s.penawaranCounter = 0;
  if (typeof s.rabCounter !== "number") s.rabCounter = 0;
  if (typeof s.mataResolusiMarkupPercent !== "number") s.mataResolusiMarkupPercent = 5;
  if (typeof s.mataResolusiPenawaranCounter !== "number") s.mataResolusiPenawaranCounter = 0;
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
  if (typeof s.targetOmzetBulanan !== "number") s.targetOmzetBulanan = 0;
  if (typeof s.targetLababersihBulanan !== "number") s.targetLababersihBulanan = 0;
  return s;
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Fase 0.4: subscribeRealtime() sekarang mendengarkan SEMUA tabel
  // relasional, yang masing-masing ditulis SEGERA oleh mirrorXUpsert
  // (tidak didebounce seperti pushStateToCloud ke blob) -- tanpa ini,
  // setiap penyimpanan lokal akan memicu event Realtime miliknya sendiri
  // dalam hitungan ratusan milidetik dan menyebabkan reload penuh yang
  // tidak perlu di tengah pengeditan.
  suppressRealtimeUntil = Date.now() + 3000;
  scheduleCloudPush();
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

let state = loadState();

// ===== Cloud sync (Supabase) — optional & opt-in. If the user never logs in,
// or the Supabase client/network is unavailable, the app behaves exactly as
// before (pure localStorage, no behavior change). Nothing here ever blocks
// rendering or normal use of the app. =====
const SUPABASE_URL = "https://iapcwaowvscftjfcdutm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Hlr2FaEP0WH0EWg9ECO2-A_qvAYcoKs";
// Server backend Node.js (lihat server/) yang menangani cetak PDF,
// pengingat WA/email terjadwal, dan payment gateway -- terpisah dari
// GitHub Pages yang cuma bisa menyajikan file statis.
const PDF_SERVER_URL = "https://mitra-creative-app-production.up.railway.app";
let sb = null;
try {
  if (typeof supabase !== "undefined") sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) { sb = null; }
let currentSyncUser = null;
let cloudSyncTimer = null;
let realtimeChannel = null;
let suppressRealtimeUntil = 0;
// Peran & pemilik data perusahaan yang sedang aktif. Owner selalu bekerja di
// datanya sendiri (targetCompanyId === currentSyncUser.id). Anggota tim yang
// diundang (admin/marketing) bekerja di data milik Owner yang mengundangnya
// (targetCompanyId === owner_id dari baris team_members mereka).
let currentTeamRole = "owner";
let targetCompanyId = null;

function scheduleCloudPush() {
  if (!sb || !currentSyncUser) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(pushStateToCloud, 1500);
}
// ===== Fase D: Kas Perusahaan/Kas Pribadi/slip gaji tidak lagi dipercaya
// dari blob app_state itu sendiri, untuk peran APA PUN termasuk Owner =====
// state.kasUsaha.transactions, state.kasPribadi.transactions,
// state.karyawan[].slipGaji, dan state.kasUsaha/kasPribadi.saldoAwal
// sekarang SELALU dibangun ulang segar dari tabel relasional (yang RLS-nya
// benar-benar membatasi) setiap kali data baru dimuat dari cloud (login &
// pembaruan realtime) -- lihat hydrateSensitiveFields(). Dan SELALU
// dikosongkan sebelum blob disimpan -- lihat stripSensitiveForBlob(). Blob
// app_state jadi tidak pernah menyimpan salinan hidup dari data ini untuk
// SIAPA PUN, baik yang diakses lewat aplikasi ini maupun lewat panggilan
// API langsung di luar aplikasi -- jadi TIDAK PERLU mengubah kebijakan
// akses (RLS) app_state itu sendiri sama sekali. RLS masing-masing tabel
// relasional (kas_usaha_transaksi, kas_pribadi_transaksi, karyawan_gaji,
// kas_saldo_awal) sudah secara alami menyaring hasilnya sesuai peran
// pemanggil -- Owner dapat semua baris, Admin cuma baris Kas Perusahaan
// yang dia input sendiri, dan Marketing/kas_pribadi_transaksi/
// karyawan_gaji/kas_saldo_awal kosong untuk siapa pun selain Owner --
// tidak perlu percabangan berdasarkan peran di sisi klien sama sekali.
function stripSensitiveForBlob(data) {
  const copy = Object.assign({}, data);
  copy.kasUsaha = Object.assign({}, copy.kasUsaha, { transactions: [], saldoAwal: 0 });
  copy.kasPribadi = Object.assign({}, copy.kasPribadi, { transactions: [], saldoAwal: 0 });
  copy.karyawan = (copy.karyawan || []).map(k => Object.assign({}, k, { slipGaji: [] }));
  return copy;
}
async function hydrateSensitiveFields(data) {
  if (!sb || !targetCompanyId) return data;
  try {
    const [kasRes, kpRes, gajiRes, saldoRes] = await Promise.all([
      sb.from("kas_usaha_transaksi").select("*").eq("company_id", targetCompanyId),
      sb.from("kas_pribadi_transaksi").select("*").eq("company_id", targetCompanyId),
      sb.from("karyawan_gaji").select("*").eq("company_id", targetCompanyId),
      sb.from("kas_saldo_awal").select("*").eq("company_id", targetCompanyId)
    ]);
    if (!kasRes.error) {
      data.kasUsaha = Object.assign({}, data.kasUsaha, {
        transactions: (kasRes.data || []).map(t => ({
          id: t.id, proyekId: t.proyek_id || "", subkonId: t.subkon_id || "",
          sumberSlipId: t.sumber_slip_id || "", sumberBelanjaId: t.sumber_belanja_id || "",
          tipe: t.tipe, status: t.status, tanggal: t.tanggal, jumlah: t.jumlah,
          keterangan: t.keterangan || "", kategori: t.kategori || "", extra: t.extra || "", catatan: t.catatan || ""
        }))
      });
    }
    if (!kpRes.error) {
      data.kasPribadi = Object.assign({}, data.kasPribadi, {
        transactions: (kpRes.data || []).map(t => ({
          id: t.id, tipe: t.tipe, tanggal: t.tanggal, jumlah: t.jumlah,
          keterangan: t.keterangan || "", kategori: t.kategori || "", extra: t.extra || "", catatan: t.catatan || ""
        }))
      });
    }
    if (!gajiRes.error) {
      const gajiMap = {};
      (gajiRes.data || []).forEach(g => { gajiMap[g.karyawan_id] = g.slip_gaji || []; });
      data.karyawan = (data.karyawan || []).map(k => Object.assign({}, k, { slipGaji: gajiMap[k.id] || [] }));
    }
    // Kalau query-nya sendiri GAGAL (bukan cuma hasilnya kosong), jangan
    // sentuh slipGaji sama sekali -- lebih aman membiarkan apa adanya
    // daripada beresiko menganggap "gagal ambil data" sama dengan
    // "karyawan ini memang tidak punya riwayat gaji" dan mengosongkannya.
    if (!saldoRes.error) {
      const saldoMap = {};
      (saldoRes.data || []).forEach(s => { saldoMap[s.buku] = s.nilai; });
      data.kasUsaha = Object.assign({}, data.kasUsaha, { saldoAwal: saldoMap.kasUsaha || 0 });
      data.kasPribadi = Object.assign({}, data.kasPribadi, { saldoAwal: saldoMap.kasPribadi || 0 });
    }
  } catch (e) {
    // best-effort -- kalau gagal, biarkan apa adanya (sudah kosong dari
    // stripSensitiveForBlob sejak penyimpanan sebelumnya)
  }
  return data;
}
async function pushStateToCloud() {
  if (!sb || !currentSyncUser || !targetCompanyId) return;
  try {
    const payload = stripSensitiveForBlob(state);
    const { error } = await sb.from("app_state").upsert({ user_id: targetCompanyId, data: payload, updated_at: new Date().toISOString() });
    if (error) throw error;
    suppressRealtimeUntil = Date.now() + 3000;
    setSyncStatus(`Tersinkron ${new Date().toLocaleTimeString("id-ID")}`);
  } catch (err) {
    setSyncStatus("Gagal sinkron ke cloud: " + err.message);
  }
}
async function mirrorSaldoAwalUpsert(book, nilai) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("kas_saldo_awal").upsert({ company_id: targetCompanyId, buku: book, nilai, updated_at: new Date().toISOString() }, { onConflict: "company_id,buku" });
    if (error) throw error;
  } catch (err) {
    setSyncStatus("Gagal menyimpan saldo awal ke tabel relasional: " + err.message);
  }
}
async function resolveTeamMembership(user) {
  try {
    const { data, error } = await sb.from("team_members").select("*").or(`member_id.eq.${user.id},member_email.eq.${user.email}`);
    if (error) throw error;
    const rows = data || [];
    let membership = rows.find(r => r.member_id === user.id && r.status === "active");
    if (!membership) {
      const pending = rows.find(r => r.status === "pending" && r.member_email && r.member_email.toLowerCase() === (user.email || "").toLowerCase());
      if (pending) {
        const { data: claimed, error: claimErr } = await sb.from("team_members").update({ member_id: user.id, status: "active" }).eq("id", pending.id).select().maybeSingle();
        if (!claimErr && claimed) membership = claimed;
      }
    }
    if (membership) {
      currentTeamRole = membership.role;
      targetCompanyId = membership.owner_id;
    } else {
      currentTeamRole = "owner";
      targetCompanyId = user.id;
    }
  } catch (e) {
    currentTeamRole = "owner";
    targetCompanyId = user.id;
  }
}
// Fase 0.4: dengarkan SEMUA tabel relasional (bukan lagi cuma app_state)
// -- masing-masing dari 9 modul non-sensitif + company_profile + 4 tabel
// sensitif sekarang jadi sumber kebenaran untuk jalur baca, jadi
// perubahan di tabel manapun harus memicu pemuatan ulang. Alih-alih
// mempercayai payload mentah tiap event (rawan, dan beresiko kalau RLS
// Realtime entah bagaimana tidak seketat RLS query biasa), tiap event
// cuma jadi sinyal "ada yang berubah" yang di-debounce lalu memanggil
// ulang buildStateFromRelational() -- sederhana, aman, dan skala data/
// pengguna aplikasi ini kecil sehingga reload penuh yang didebounce
// jauh lebih dari cukup dibanding reducer per-tabel yang rumit.
const REALTIME_RELATIONAL_TABLES = [
  "company_profile", "klien", "ahsp", "rab", "penawaran", "proyek", "karyawan",
  "stok_material", "gudang", "pemasok",
  "kas_usaha_transaksi", "kas_pribadi_transaksi", "karyawan_gaji", "kas_saldo_awal"
];
let realtimeReloadTimer = null;
function subscribeRealtime(companyId) {
  if (!sb || realtimeChannel || typeof sb.channel !== "function") return;
  try {
    let channel = sb.channel("app_state_" + companyId);
    const onTableChange = () => {
      if (Date.now() < suppressRealtimeUntil) return;
      if (cloudSyncTimer) return;
      if (document.querySelector(".modal-backdrop.open")) return;
      clearTimeout(realtimeReloadTimer);
      realtimeReloadTimer = setTimeout(async () => {
        try {
          state = await buildStateFromRelational(companyId);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          renderAll();
          setSyncStatus(`Diperbarui otomatis dari perangkat lain, ${new Date().toLocaleTimeString("id-ID")}`);
        } catch (e) { /* best-effort -- biarkan state apa adanya kalau gagal */ }
      }, 800);
    };
    REALTIME_RELATIONAL_TABLES.forEach(table => {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `company_id=eq.${companyId}` }, onTableChange);
    });
    realtimeChannel = channel.subscribe();
  } catch (e) { realtimeChannel = null; }
}
function unsubscribeRealtime() {
  if (sb && realtimeChannel && typeof sb.removeChannel === "function") {
    try { sb.removeChannel(realtimeChannel); } catch (e) {}
  }
  realtimeChannel = null;
}

// ===== Fase 0.5: Log Aktivitas Tim -- jejak audit append-only untuk semua
// modul, supaya Owner selalu tahu siapa mengubah/menghapus apa dan nilai
// sebelum/sesudahnya. Ditulis best-effort (fire-and-forget) seperti mirror
// lain -- gagal menulis log TIDAK PERNAH memblokir penyimpanan data utama.
// Sengaja di luar REALTIME_RELATIONAL_TABLES: tabel ini murni tempat
// menulis, dibaca terpisah oleh halaman Aktivitas Tim, bukan bagian dari
// state yang disinkronkan real-time.
//
// RAB & Penawaran (satu-satunya modul dengan autosave per-keystroke di
// tiap field) TIDAK mencatat log di setiap ketikan -- itu akan
// menghasilkan ratusan baris per sesi edit. Sebagai gantinya: snapshot
// "sebelum" diambil sekali saat editornya dibuka (openEditSnapshot),
// tiap panggilan mirror berikutnya cuma memperbarui "sesudah" &
// menunda tulis (queueActivityEdit, debounce ~2500ms), dan menutup
// editor memaksa tulis segera kalau masih ada yang tertunda
// (flushAndDiscardSnapshot) -- jaring pengaman kalau navigasi keluar
// terjadi sebelum jeda debounce selesai.
const ACTIVITY_DIFF_FIELDS = {
  klien: ["nama", "tahap", "kontakNama", "telepon", "sumber"],
  ahsp: ["uraian", "mode", "hargaManual", "overhead"],
  rab: ["nomor", "nama", "klien", "ppn", "pph", "biayaLain", "itemCount"],
  penawaran: ["nomor", "nama", "klien", "ppn", "pph", "diskon", "itemCount", "brand"],
  proyek: ["nama", "status", "nilaiKontrak"],
  karyawan: ["nama", "jabatan", "aktif", "upahHarian", "gajiBulanan"],
  karyawanGaji: ["gajiPokok", "tunjangan", "potongan", "periode"],
  stok: ["nama", "stokMinimum", "hargaSatuan"],
  gudang: ["nama", "alamat"],
  pemasok: ["nama", "telepon", "kategori"],
  kasUsaha: ["jumlah", "tipe", "kategori", "keterangan", "tanggal", "status"],
  kasPribadi: ["jumlah", "tipe", "kategori", "keterangan", "tanggal", "status"],
  companyProfile: ["company", "alamat", "telepon", "approvalThreshold"]
};
const ACTIVITY_MODULE_LABELS = {
  klien: "Klien", ahsp: "AHSP", rab: "RAB", penawaran: "Penawaran",
  proyek: "Proyek", karyawan: "Karyawan", karyawanGaji: "Slip Gaji",
  stok: "Stok Material", gudang: "Gudang", pemasok: "Pemasok",
  kasUsaha: "Kas Perusahaan", kasPribadi: "Kas Pribadi",
  companyProfile: "Profil Perusahaan", system: "Sistem"
};
function activityEntityLabel(module, obj) {
  if (!obj) return "";
  if (module === "kasUsaha" || module === "kasPribadi") return obj.keterangan || rupiah(obj.jumlah || 0);
  return obj.nama || obj.nomor || obj.uraian || obj.kode || "";
}
function activityFieldValue(f, obj) {
  if (!obj) return undefined;
  if (f === "itemCount") return (obj.items || []).length;
  return obj[f];
}
function diffActivityFields(module, before, after) {
  const fields = ACTIVITY_DIFF_FIELDS[module] || [];
  const diff = {};
  fields.forEach(f => {
    const a = activityFieldValue(f, before);
    const b = activityFieldValue(f, after);
    if (JSON.stringify(a) !== JSON.stringify(b)) diff[f] = { from: a === undefined ? null : a, to: b === undefined ? null : b };
  });
  return diff;
}
function buildActivitySummary(module, action, before, after) {
  const label = ACTIVITY_MODULE_LABELS[module] || module;
  const nama = activityEntityLabel(module, after || before);
  if (action === "create") return `${label} "${nama}" ditambahkan`;
  if (action === "delete") return `${label} "${nama}" dihapus`;
  const diff = diffActivityFields(module, before, after);
  const keys = Object.keys(diff);
  if (!keys.length) return `${label} "${nama}" diubah`;
  const parts = keys.slice(0, 2).map(k => `${k} dari ${JSON.stringify(diff[k].from)} ke ${JSON.stringify(diff[k].to)}`);
  return `${label} "${nama}" — ${parts.join(", ")}`;
}
async function logActivityNow(module, action, recordId, before, after) {
  if (!sb || !targetCompanyId || !currentSyncUser) return;
  try {
    const row = {
      company_id: targetCompanyId,
      actor_id: currentSyncUser.id,
      actor_email: currentSyncUser.email || "",
      actor_role: currentTeamRole,
      module,
      action,
      record_id: String(recordId),
      summary: buildActivitySummary(module, action, before, after),
      diff: action === "delete" ? (before || null) : diffActivityFields(module, before, after)
    };
    const { error } = await sb.from("activity_log").insert(row);
    if (error) throw error;
  } catch (err) {
    setSyncStatus("Gagal mencatat aktivitas: " + err.message);
  }
}
const pendingActivity = new Map();
function queueActivityEdit(module, id, current) {
  if (!sb || !targetCompanyId || !currentSyncUser) return;
  const key = module + ":" + id;
  let entry = pendingActivity.get(key);
  if (!entry) {
    entry = { before: JSON.parse(JSON.stringify(current)), after: JSON.parse(JSON.stringify(current)) };
    pendingActivity.set(key, entry);
  } else {
    entry.after = JSON.parse(JSON.stringify(current));
  }
  clearTimeout(entry.timer);
  // Debounce yang kadaluarsa cuma menulis log & mereset "before" ke nilai
  // saat ini (BUKAN membuang snapshot sepenuhnya) -- editor mungkin masih
  // terbuka dan user masih bisa mengetik lagi, jadi sesi pelacakan before/
  // after harus tetap jalan. Snapshot baru benar-benar dibuang saat editor
  // ditutup lewat flushAndDiscardSnapshot().
  entry.timer = setTimeout(() => flushActivityQueue(module, id), 2500);
}
function openEditSnapshot(module, id, record) {
  if (!record) return;
  const key = module + ":" + id;
  const prev = pendingActivity.get(key);
  if (prev) clearTimeout(prev.timer);
  pendingActivity.set(key, { before: JSON.parse(JSON.stringify(record)), after: JSON.parse(JSON.stringify(record)) });
}
function flushActivityQueue(module, id) {
  const key = module + ":" + id;
  const entry = pendingActivity.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  const diff = diffActivityFields(module, entry.before, entry.after);
  if (Object.keys(diff).length) logActivityNow(module, "update", id, entry.before, entry.after);
  entry.before = entry.after;
  entry.timer = null;
}
function flushAndDiscardSnapshot(module, id) {
  const key = module + ":" + id;
  flushActivityQueue(module, id);
  pendingActivity.delete(key);
}
// Import Backup menimpa banyak modul sekaligus lewat mirrorAllToRelational()
// -- fungsi itu SENGAJA tidak mencatat 1 baris log per record (akan
// menghasilkan ratusan baris untuk 1 aksi impor). Sebagai gantinya, 1 baris
// ringkasan dicatat di sini supaya Owner tetap tahu aksi bervolume besar ini
// pernah terjadi, siapa pelakunya, dan berapa banyak yang terdampak per modul.
async function logBulkImportActivity(counts) {
  if (!sb || !targetCompanyId || !currentSyncUser) return;
  try {
    const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
    // Bentuk diff dipin ke {from,to} yang sama seperti log per-record lain
    // supaya modal detail Aktivitas Tim (yang mengasumsikan bentuk itu)
    // bisa merender baris ini tanpa cabang kode khusus.
    const diff = {};
    Object.entries(counts).forEach(([k, n]) => { diff[k] = { from: null, to: n }; });
    const row = {
      company_id: targetCompanyId,
      actor_id: currentSyncUser.id,
      actor_email: currentSyncUser.email || "",
      actor_role: currentTeamRole,
      module: "system",
      action: "update",
      record_id: "import_backup",
      summary: `Import Backup JSON (menimpa data): ${parts.join(", ") || "tidak ada data"}`,
      diff
    };
    const { error } = await sb.from("activity_log").insert(row);
    if (error) throw error;
  } catch (err) {
    setSyncStatus("Gagal mencatat aktivitas: " + err.message);
  }
}

// ===== Fase C (percobaan): mirror modul Klien ke tabel relasional =====
// Selama masa transisi, state.klien (di memori + blob app_state) tetap
// jadi sumber data utama yang dibaca semua bagian aplikasi -- supaya nol
// risiko ke perilaku yang sudah ada. Setiap kali klien ditambah/diubah/
// dihapus, perubahan yang sama juga "dicerminkan" (mirror) ke tabel
// relasional klien secara best-effort (gagal diam-diam, tidak memblokir
// pemakaian aplikasi), sebagai persiapan Fase D nanti ketika tabel
// relasional ini yang jadi sumber utama.
function klienToRow(k) {
  return {
    id: k.id,
    company_id: targetCompanyId,
    nama: k.nama || "",
    kontak_nama: k.kontakNama || "",
    telepon: k.telepon || "",
    email: k.email || "",
    sumber: k.sumber || "",
    alamat: k.alamat || "",
    tahap: k.tahap || "",
    tahap_sejak: k.tahapSejak || null,
    follow_up_berikutnya: k.followUpTanggal || null,
    catatan: k.catatan || "",
    kontak_list: k.kontakList || [],
    riwayat_kontak: k.riwayatKontak || [],
    updated_at: new Date().toISOString()
  };
}
async function mirrorKlienUpsert(k, existing) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("klien").upsert(klienToRow(k));
    if (error) throw error;
    if (existing !== undefined) logActivityNow("klien", existing ? "update" : "create", k.id, existing, k);
  } catch (err) {
    setSyncStatus("Gagal menyimpan klien ke tabel relasional: " + err.message);
  }
}
async function mirrorKlienDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("klien").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    if (deletedRecord) logActivityNow("klien", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus klien di tabel relasional: " + err.message);
  }
}
async function migrateKlienIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("klien").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.klien || state.klien.length === 0) return;
    const rows = state.klien.map(klienToRow);
    const { error: insertErr } = await sb.from("klien").insert(rows);
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data klien ke tabel relasional: " + err.message);
  }
}

// ===== Fase C (percobaan): mirror modul AHSP ke tabel relasional =====
// Pola yang sama persis dengan Klien di atas -- state.ahsp tetap sumber
// utama, tabel relasional dicerminkan (mirror) secara best-effort.
function ahspToRow(a) {
  return {
    id: a.id,
    company_id: targetCompanyId,
    kategori: a.kategori || "",
    kode: a.kode || "",
    uraian: a.uraian || "",
    satuan: a.satuan || "",
    mode: a.mode || "",
    harga_manual: a.hargaManual || 0,
    overhead: a.overhead || 0,
    referensi: a.referensi || "",
    komponen: a.komponen || [],
    riwayat_harga: a.riwayatHarga || [],
    updated_at: new Date().toISOString()
  };
}
async function mirrorAhspUpsert(a, existing) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("ahsp").upsert(ahspToRow(a));
    if (error) throw error;
    if (existing !== undefined) logActivityNow("ahsp", existing ? "update" : "create", a.id, existing, a);
  } catch (err) {
    setSyncStatus("Gagal menyimpan AHSP ke tabel relasional: " + err.message);
  }
}
async function mirrorAhspDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("ahsp").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    if (deletedRecord) logActivityNow("ahsp", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus AHSP di tabel relasional: " + err.message);
  }
}
async function migrateAhspIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("ahsp").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.ahsp || state.ahsp.length === 0) return;
    const rows = state.ahsp.map(ahspToRow);
    const { error: insertErr } = await sb.from("ahsp").insert(rows);
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data AHSP ke tabel relasional: " + err.message);
  }
}

// ===== Fase C (percobaan): mirror modul RAB ke tabel relasional =====
// Pola yang sama persis dengan Klien & AHSP -- state.proyekRab tetap
// sumber utama, tabel relasional dicerminkan (mirror) secara best-effort.
function rabToRow(r) {
  return {
    id: r.id,
    company_id: targetCompanyId,
    nomor: r.nomor || "",
    klien_id: r.klienId || null,
    klien: r.klien || "",
    nama_proyek: r.nama || "",
    lokasi: r.lokasi || "",
    kategori: r.kategori || "",
    tanggal: r.tanggal || null,
    ppn: r.ppn || 0,
    pph: r.pph || 0,
    biaya_lain: r.biayaLain || 0,
    proyek_id: r.proyekId || null,
    revisi_dari_id: r.revisiDariId || null,
    revisi_ke: r.revisiKe || 0,
    items: r.items || [],
    total: rabTotals(r).total,
    updated_at: new Date().toISOString()
  };
}
async function mirrorRabUpsert(r, isNew) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("rab").upsert(rabToRow(r));
    if (error) throw error;
    if (isNew) {
      logActivityNow("rab", "create", r.id, null, r);
      openEditSnapshot("rab", r.id, r);
    } else if (isNew !== undefined) {
      queueActivityEdit("rab", r.id, r);
    }
  } catch (err) {
    setSyncStatus("Gagal menyimpan RAB ke tabel relasional: " + err.message);
  }
}
async function mirrorRabDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("rab").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    pendingActivity.delete("rab:" + id);
    if (deletedRecord) logActivityNow("rab", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus RAB di tabel relasional: " + err.message);
  }
}
async function migrateRabIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("rab").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.proyekRab || state.proyekRab.length === 0) return;
    const rows = state.proyekRab.map(rabToRow);
    const { error: insertErr } = await sb.from("rab").insert(rows);
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data RAB ke tabel relasional: " + err.message);
  }
}

// ===== Fase C (percobaan): mirror modul Penawaran ke tabel relasional =====
// Pola yang sama persis dengan Klien, AHSP & RAB -- state.penawaran tetap
// sumber utama, tabel relasional dicerminkan (mirror) secara best-effort.
function penawaranToRow(p) {
  return {
    id: p.id,
    company_id: targetCompanyId,
    nomor: p.nomor || "",
    klien_id: p.klienId || null,
    kepada: p.kepada || "",
    alamat_klien: p.alamatKlien || "",
    perihal: p.perihal || "",
    kategori: p.kategori || "",
    status: p.status || "",
    tanggal: p.tanggal || null,
    diskon: p.diskon || 0,
    ppn: p.ppn || 0,
    pph: p.pph || 0,
    biaya_lain: p.biayaLain || 0,
    syarat: p.syarat || "",
    penutup: p.penutup || "",
    ttd_nama: p.ttdNama || "",
    ttd_jabatan: p.ttdJabatan || "",
    proyek_id: p.proyekId || null,
    revisi_dari_id: p.revisiDariId || null,
    revisi_ke: p.revisiKe || 0,
    brand: p.brand || "mitra",
    markup_percent: p.markupPercent ?? null,
    source_penawaran_id: p.sourcePenawaranId || null,
    items: p.items || [],
    total: penawaranTotals(p).total,
    updated_at: new Date().toISOString()
  };
}
async function mirrorPenawaranUpsert(p, isNew) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("penawaran").upsert(penawaranToRow(p));
    if (error) throw error;
    if (isNew) {
      logActivityNow("penawaran", "create", p.id, null, p);
      openEditSnapshot("penawaran", p.id, p);
    } else if (isNew !== undefined) {
      queueActivityEdit("penawaran", p.id, p);
    }
  } catch (err) {
    setSyncStatus("Gagal menyimpan Penawaran ke tabel relasional: " + err.message);
  }
}
async function mirrorPenawaranDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("penawaran").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    pendingActivity.delete("penawaran:" + id);
    if (deletedRecord) logActivityNow("penawaran", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus Penawaran di tabel relasional: " + err.message);
  }
}
async function migratePenawaranIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("penawaran").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.penawaran || state.penawaran.length === 0) return;
    const rows = state.penawaran.map(penawaranToRow);
    const { error: insertErr } = await sb.from("penawaran").insert(rows);
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data Penawaran ke tabel relasional: " + err.message);
  }
}

// ===== Fase C (percobaan): mirror modul Proyek ke tabel relasional =====
// Pola yang sama persis dengan Klien, AHSP, RAB & Penawaran -- state.proyek
// tetap sumber utama, tabel relasional dicerminkan (mirror) secara
// best-effort.
function proyekToRow(p) {
  const realisasiTerbaru = (p.progressRealisasi || []).slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""))[0];
  return {
    id: p.id,
    company_id: targetCompanyId,
    nama: p.nama || "",
    klien_id: p.klienId || null,
    klien: p.klien || "",
    lokasi: p.lokasi || "",
    nilai_kontrak: p.nilaiKontrak || 0,
    status: p.status || "",
    tanggal_mulai: p.tanggalMulai || null,
    tanggal_selesai: p.tanggalSelesai || null,
    biaya_bahan: p.biayaBahan || 0,
    biaya_upah: p.biayaUpah || 0,
    biaya_lain: p.biayaLain || 0,
    karyawan_ids: p.karyawanIds || [],
    subkontraktor: p.subkontraktor || [],
    belanja_material: p.belanjaMaterial || [],
    sumber_rab_id: p.sumberRabId || null,
    sumber_penawaran_id: p.sumberPenawaranId || null,
    progress_rencana: p.progressRencana || [],
    progress_realisasi: p.progressRealisasi || [],
    progress: realisasiTerbaru ? realisasiTerbaru.persen : 0,
    dokumen: p.dokumen || [],
    jadwal_pekerjaan: p.jadwalPekerjaan || [],
    laporan_harian: p.laporanHarian || [],
    perubahan_pekerjaan: p.perubahanPekerjaan || [],
    updated_at: new Date().toISOString()
  };
}
async function mirrorProyekUpsert(p, existing) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("proyek").upsert(proyekToRow(p));
    if (error) throw error;
    if (existing !== undefined) logActivityNow("proyek", existing ? "update" : "create", p.id, existing, p);
  } catch (err) {
    setSyncStatus("Gagal menyimpan Proyek ke tabel relasional: " + err.message);
  }
}
async function mirrorProyekDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("proyek").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    if (deletedRecord) logActivityNow("proyek", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus Proyek di tabel relasional: " + err.message);
  }
}
async function migrateProyekIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("proyek").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.proyek || state.proyek.length === 0) return;
    const rows = state.proyek.map(proyekToRow);
    const { error: insertErr } = await sb.from("proyek").insert(rows);
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data Proyek ke tabel relasional: " + err.message);
  }
}

// ===== Fase C (percobaan): mirror modul Karyawan ke tabel relasional =====
// Beda dari modul lain: dipecah jadi 2 tabel. "karyawan" berisi data
// dasar + absensi (aman dilihat Admin, sudah divisualkan sejak PR peran
// tim). "karyawan_gaji" berisi riwayat slip gaji (Owner saja -- sesuai
// subtab "Penggajian & Slip Gaji" yang memang sudah disembunyikan dari
// Admin). state.karyawan tetap sumber utama.
function karyawanToRow(k) {
  return {
    id: k.id,
    company_id: targetCompanyId,
    nama: k.nama || "",
    jabatan: k.jabatan || "",
    tipe_gaji: k.tipeGaji || "",
    aktif: k.aktif !== false,
    upah_harian: k.upahHarian || 0,
    tarif_lembur: k.tarifLembur || 0,
    uang_makan_harian: k.uangMakanHarian || 0,
    gaji_bulanan: k.gajiBulanan || 0,
    target_bulanan: k.targetBulanan || 0,
    persen_bonus: k.persenBonus || 0,
    pinjaman_awal: k.pinjamanAwal || 0,
    absensi: k.absensi || [],
    updated_at: new Date().toISOString()
  };
}
function karyawanGajiToRow(k) {
  return {
    id: k.id,
    company_id: targetCompanyId,
    karyawan_id: k.id,
    slip_gaji: k.slipGaji || [],
    updated_at: new Date().toISOString()
  };
}
async function mirrorKaryawanUpsert(k, existing) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("karyawan").upsert(karyawanToRow(k));
    if (error) throw error;
    if (existing !== undefined) logActivityNow("karyawan", existing ? "update" : "create", k.id, existing, k);
  } catch (err) {
    setSyncStatus("Gagal menyimpan Karyawan ke tabel relasional: " + err.message);
  }
}
async function mirrorKaryawanGajiUpsert(k, isNewSlip) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("karyawan_gaji").upsert(karyawanGajiToRow(k));
    if (error) throw error;
    if (isNewSlip !== undefined) logActivityNow("karyawanGaji", "update", k.id, null, k);
  } catch (err) {
    setSyncStatus("Gagal menyimpan slip gaji ke tabel relasional: " + err.message);
  }
}
async function mirrorKaryawanDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error: e1 } = await sb.from("karyawan").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (e1) throw e1;
    const { error: e2 } = await sb.from("karyawan_gaji").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (e2) throw e2;
    if (deletedRecord) logActivityNow("karyawan", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus Karyawan di tabel relasional: " + err.message);
  }
}
async function migrateKaryawanIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("karyawan").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.karyawan || state.karyawan.length === 0) return;
    const { error: insertErr } = await sb.from("karyawan").insert(state.karyawan.map(karyawanToRow));
    if (insertErr) throw insertErr;
    // karyawan_gaji (slip gaji) Owner-only sesuai RLS -- kalau kebetulan
    // Admin/Marketing yang login duluan, lewati bagian ini (bukan error)
    // supaya tidak muncul toast gagal yang tidak perlu; data slip gaji
    // akan termigrasi begitu Owner sendiri login.
    if (currentSyncUser && currentSyncUser.id === targetCompanyId) {
      const { error: insertGajiErr } = await sb.from("karyawan_gaji").insert(state.karyawan.map(karyawanGajiToRow));
      if (insertGajiErr) throw insertGajiErr;
    }
  } catch (err) {
    setSyncStatus("Gagal migrasi data Karyawan ke tabel relasional: " + err.message);
  }
}

// ===== Fase C (percobaan): mirror modul Stok ke tabel relasional =====
// state.stok tetap sumber utama, tabel relasional dicerminkan (mirror)
// secara best-effort. Riwayat transaksi masuk/keluar tersimpan MENYATU
// di dalam data barang (bukan tabel sendiri), jadi dicerminkan apa
// adanya sebagai kolom jsonb "transactions". Daftar Gudang/Lokasi Stok
// dicerminkan terpisah ke tabel "gudang".
function stokToRow(s) {
  return {
    id: s.id,
    company_id: targetCompanyId,
    nama: s.nama || "",
    kategori: s.kategori || "",
    satuan: s.satuan || "",
    stok_awal: s.stokAwal || 0,
    stok_minimum: s.stokMinimum || 0,
    harga_satuan: s.hargaSatuan || 0,
    transactions: s.transactions || [],
    updated_at: new Date().toISOString()
  };
}
async function mirrorStokUpsert(s, existing) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("stok_material").upsert(stokToRow(s));
    if (error) throw error;
    if (existing !== undefined) logActivityNow("stok", existing ? "update" : "create", s.id, existing, s);
  } catch (err) {
    setSyncStatus("Gagal menyimpan Stok ke tabel relasional: " + err.message);
  }
}
async function mirrorStokDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("stok_material").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    if (deletedRecord) logActivityNow("stok", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus Stok di tabel relasional: " + err.message);
  }
}
async function migrateStokIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("stok_material").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.stok || state.stok.length === 0) return;
    const { error: insertErr } = await sb.from("stok_material").insert(state.stok.map(stokToRow));
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data Stok ke tabel relasional: " + err.message);
  }
}
function gudangToRow(g) {
  return {
    id: g.id,
    company_id: targetCompanyId,
    nama: g.nama || "",
    updated_at: new Date().toISOString()
  };
}
async function mirrorGudangUpsert(g, existing) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("gudang").upsert(gudangToRow(g));
    if (error) throw error;
    if (existing !== undefined) logActivityNow("gudang", existing ? "update" : "create", g.id, existing, g);
  } catch (err) {
    setSyncStatus("Gagal menyimpan Gudang ke tabel relasional: " + err.message);
  }
}
async function mirrorGudangDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("gudang").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    if (deletedRecord) logActivityNow("gudang", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus Gudang di tabel relasional: " + err.message);
  }
}
async function migrateGudangIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("gudang").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.gudang || state.gudang.length === 0) return;
    const { error: insertErr } = await sb.from("gudang").insert(state.gudang.map(gudangToRow));
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data Gudang ke tabel relasional: " + err.message);
  }
}

// ===== Fase C (percobaan): mirror modul Pemasok ke tabel relasional =====
// state.pemasok tetap sumber utama. Beda dari modul lain: riwayat harga
// pembelian TIDAK tersimpan di data pemasok itu sendiri, melainkan
// dihitung on-the-fly dari Stok Material & Belanja Material Proyek (lihat
// pemasokRiwayat()) -- jadi tidak ada apa pun untuk dicerminkan di luar
// field dasarnya sendiri.
function pemasokToRow(pm) {
  return {
    id: pm.id,
    company_id: targetCompanyId,
    nama: pm.nama || "",
    kategori: pm.kategori || "",
    telepon: pm.telepon || "",
    alamat: pm.alamat || "",
    catatan: pm.catatan || "",
    updated_at: new Date().toISOString()
  };
}
async function mirrorPemasokUpsert(pm, existing) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("pemasok").upsert(pemasokToRow(pm));
    if (error) throw error;
    if (existing !== undefined) logActivityNow("pemasok", existing ? "update" : "create", pm.id, existing, pm);
  } catch (err) {
    setSyncStatus("Gagal menyimpan Pemasok ke tabel relasional: " + err.message);
  }
}
async function mirrorPemasokDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("pemasok").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    if (deletedRecord) logActivityNow("pemasok", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus Pemasok di tabel relasional: " + err.message);
  }
}
async function migratePemasokIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("pemasok").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.pemasok || state.pemasok.length === 0) return;
    const { error: insertErr } = await sb.from("pemasok").insert(state.pemasok.map(pemasokToRow));
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data Pemasok ke tabel relasional: " + err.message);
  }
}

// ===== Fase 0.4: mirror profil perusahaan ke tabel relasional =====
// Satu-satunya bagian data yang sampai sekarang cuma ada di blob app_state
// dan belum pernah dicerminkan ke tabel manapun -- 8 field skalar ini
// (nama/alamat/telepon perusahaan, nama/jabatan Owner, batas approval,
// dan 2 penomoran urut RAB/Penawaran) dibutuhkan supaya buildStateFromRelational()
// bisa memuat SELURUH state dari tabel relasional, tanpa perlu membaca
// blob sama sekali. Beda dari mirror modul lain: cuma 1 baris per
// perusahaan (bukan array), jadi upsert-nya selalu menimpa baris yang sama.
function companyProfileToRow() {
  return {
    company_id: targetCompanyId,
    company: state.company || "",
    alamat: state.alamat || "",
    telepon: state.telepon || "",
    owner_nama: state.ownerNama || "",
    owner_jabatan: state.ownerJabatan || "",
    approval_threshold: state.approvalThreshold || 0,
    penawaran_counter: state.penawaranCounter || 0,
    rab_counter: state.rabCounter || 0,
    mata_resolusi_markup_percent: state.mataResolusiMarkupPercent ?? 5,
    mata_resolusi_penawaran_counter: state.mataResolusiPenawaranCounter || 0,
    target_omzet_bulanan: state.targetOmzetBulanan || 0,
    target_laba_bersih_bulanan: state.targetLababersihBulanan || 0,
    updated_at: new Date().toISOString()
  };
}
async function mirrorCompanyProfileUpsert() {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("company_profile").upsert(companyProfileToRow());
    if (error) throw error;
  } catch (err) {
    setSyncStatus("Gagal menyimpan profil perusahaan ke tabel relasional: " + err.message);
  }
}
async function migrateCompanyProfileIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("company_profile").select("company_id").eq("company_id", targetCompanyId).maybeSingle();
    if (error) throw error;
    if (data) return;
    const { error: insertErr } = await sb.from("company_profile").insert(companyProfileToRow());
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi profil perusahaan ke tabel relasional: " + err.message);
  }
}

// ===== Fase C (percobaan): mirror modul Kas Perusahaan & Kas Pribadi ke tabel relasional =====
// Modul paling sensitif: sesuai keputusan Owner, Admin hanya boleh MELIHAT
// transaksi Kas Perusahaan yang mereka input SENDIRI (bukan seluruh buku),
// supaya Admin tidak bisa menjumlahkan sendiri dan mengetahui saldo
// perusahaan -- aturan ini sudah dikunci di RLS tabel kas_usaha_transaksi
// sejak Fase A (created_by = auth.uid() untuk role admin). Kolom
// "created_by" diisi dari currentSyncUser.id (siapa pun yang sedang login
// saat menyimpan) -- state.kasUsaha sendiri tidak pernah menyimpan siapa
// penginputnya. Kas Pribadi sepenuhnya milik Owner (RLS tidak mengizinkan
// peran lain sama sekali), jadi tidak perlu kolom created_by.
// state.kasUsaha / state.kasPribadi tetap sumber utama.
function kasUsahaTxnToRow(t) {
  return {
    id: t.id,
    company_id: targetCompanyId,
    proyek_id: t.proyekId || null,
    subkon_id: t.subkonId || null,
    sumber_slip_id: t.sumberSlipId || null,
    sumber_belanja_id: t.sumberBelanjaId || null,
    tipe: t.tipe || "",
    status: t.status || "lunas",
    tanggal: t.tanggal || null,
    jumlah: t.jumlah || 0,
    keterangan: t.keterangan || "",
    kategori: t.kategori || "",
    extra: t.extra || "",
    catatan: t.catatan || "",
    created_by: (currentSyncUser && currentSyncUser.id) || targetCompanyId
  };
}
async function mirrorKasUsahaUpsert(t, existing) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("kas_usaha_transaksi").upsert(kasUsahaTxnToRow(t));
    if (error) throw error;
    if (existing !== undefined) logActivityNow("kasUsaha", existing ? "update" : "create", t.id, existing, t);
  } catch (err) {
    setSyncStatus("Gagal menyimpan transaksi Kas Perusahaan ke tabel relasional: " + err.message);
  }
}
async function mirrorKasUsahaDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("kas_usaha_transaksi").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    if (deletedRecord) logActivityNow("kasUsaha", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus transaksi Kas Perusahaan di tabel relasional: " + err.message);
  }
}
async function mirrorKasUsahaDeleteBySumberSlip(slipId) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("kas_usaha_transaksi").delete().eq("sumber_slip_id", slipId).eq("company_id", targetCompanyId);
    if (error) throw error;
  } catch (err) {
    setSyncStatus("Gagal menghapus transaksi Kas Perusahaan (slip gaji) di tabel relasional: " + err.message);
  }
}
async function mirrorKasUsahaDeleteBySumberBelanja(belanjaId) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("kas_usaha_transaksi").delete().eq("sumber_belanja_id", belanjaId).eq("company_id", targetCompanyId);
    if (error) throw error;
  } catch (err) {
    setSyncStatus("Gagal menghapus transaksi Kas Perusahaan (belanja material) di tabel relasional: " + err.message);
  }
}
async function mirrorSyncBelanjaMaterialKas(item) {
  // syncBelanjaMaterial() selalu membuang transaksi Kas lama (id berbeda)
  // lalu membuat baru dengan uid() baru kalau statusnya "Dibeli" -- jadi
  // hapus dulu semua baris relasional lama untuk item ini, baru cerminkan
  // baris baru (kalau ada) dari state.kasUsaha yang sudah diperbarui.
  await mirrorKasUsahaDeleteBySumberBelanja(item.id);
  const newTxn = state.kasUsaha.transactions.find(t => t.sumberBelanjaId === item.id);
  if (newTxn) await mirrorKasUsahaUpsert(newTxn);
}
async function migrateKasUsahaIfNeeded() {
  if (!sb || !targetCompanyId) return;
  // Hanya Owner yang boleh menjalankan migrasi satu-kali ini -- data lama
  // sebelum sistem tim ada tidak pernah tercatat siapa penginputnya, dan
  // kalau kebetulan Admin yang login duluan, migrasi akan salah menandai
  // seluruh riwayat lama sebagai input Admin itu (created_by keliru).
  if (!currentSyncUser || currentSyncUser.id !== targetCompanyId) return;
  try {
    const { data, error } = await sb.from("kas_usaha_transaksi").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.kasUsaha.transactions || state.kasUsaha.transactions.length === 0) return;
    const { error: insertErr } = await sb.from("kas_usaha_transaksi").insert(state.kasUsaha.transactions.map(kasUsahaTxnToRow));
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data Kas Perusahaan ke tabel relasional: " + err.message);
  }
}
function kasPribadiTxnToRow(t) {
  return {
    id: t.id,
    company_id: targetCompanyId,
    tipe: t.tipe || "",
    tanggal: t.tanggal || null,
    jumlah: t.jumlah || 0,
    keterangan: t.keterangan || "",
    kategori: t.kategori || "",
    extra: t.extra || "",
    catatan: t.catatan || ""
  };
}
async function mirrorKasPribadiUpsert(t, existing) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("kas_pribadi_transaksi").upsert(kasPribadiTxnToRow(t));
    if (error) throw error;
    if (existing !== undefined) logActivityNow("kasPribadi", existing ? "update" : "create", t.id, existing, t);
  } catch (err) {
    setSyncStatus("Gagal menyimpan transaksi Kas Pribadi ke tabel relasional: " + err.message);
  }
}
async function mirrorKasPribadiDelete(id, deletedRecord) {
  if (!sb || !targetCompanyId) return;
  try {
    const { error } = await sb.from("kas_pribadi_transaksi").delete().eq("id", id).eq("company_id", targetCompanyId);
    if (error) throw error;
    if (deletedRecord) logActivityNow("kasPribadi", "delete", id, deletedRecord, null);
  } catch (err) {
    setSyncStatus("Gagal menghapus transaksi Kas Pribadi di tabel relasional: " + err.message);
  }
}
async function migrateKasPribadiIfNeeded() {
  if (!sb || !targetCompanyId) return;
  try {
    const { data, error } = await sb.from("kas_pribadi_transaksi").select("id").eq("company_id", targetCompanyId).limit(1);
    if (error) throw error;
    if ((data || []).length > 0) return;
    if (!state.kasPribadi.transactions || state.kasPribadi.transactions.length === 0) return;
    const { error: insertErr } = await sb.from("kas_pribadi_transaksi").insert(state.kasPribadi.transactions.map(kasPribadiTxnToRow));
    if (insertErr) throw insertErr;
  } catch (err) {
    setSyncStatus("Gagal migrasi data Kas Pribadi ke tabel relasional: " + err.message);
  }
}
function mirrorKasTxnUpsert(book, t, existing) {
  if (book === "kasUsaha") mirrorKasUsahaUpsert(t, existing); else mirrorKasPribadiUpsert(t, existing);
}
function mirrorKasTxnDelete(book, id, deletedRecord) {
  if (book === "kasUsaha") mirrorKasUsahaDelete(id, deletedRecord); else mirrorKasPribadiDelete(id, deletedRecord);
}

// ===== Fase 0.4 (Tahap 1): bangun ulang seluruh `state` dari tabel
// relasional, bukan dari blob app_state -- supaya RLS per-tabel yang
// sudah benar sejak Fase A/C (mis. Marketing tidak boleh akses
// proyek/karyawan/stok/gudang/pemasok) benar-benar ditegakkan di jalur
// baca, bukan cuma disembunyikan di UI. Setiap rowToX() adalah kebalikan
// persis dari XToRow() yang sudah ada di atas. Jalur TULIS (mirrorXUpsert,
// pushStateToCloud ke blob) sama sekali tidak berubah. Sejak Fase 0.4
// Tahap 2, blob app_state TIDAK PERNAH lagi dibaca aplikasi ini (lihat
// handlePostLoginSync) -- penulisannya tetap dipertahankan murni untuk
// memberi makan Backup Otomatis di server (server/lib/backup.js).
function rowToKlien(r) {
  return {
    id: r.id, nama: r.nama || "", kontakNama: r.kontak_nama || "", telepon: r.telepon || "",
    email: r.email || "", sumber: r.sumber || "", alamat: r.alamat || "", tahap: r.tahap || "",
    tahapSejak: r.tahap_sejak || "", followUpTanggal: r.follow_up_berikutnya || "",
    catatan: r.catatan || "", kontakList: r.kontak_list || [], riwayatKontak: r.riwayat_kontak || []
  };
}
function rowToAhsp(r) {
  return {
    id: r.id, kategori: r.kategori || "", kode: r.kode || "", uraian: r.uraian || "",
    satuan: r.satuan || "", mode: r.mode || "", hargaManual: r.harga_manual || 0,
    overhead: r.overhead || 0, referensi: r.referensi || "", komponen: r.komponen || [],
    riwayatHarga: r.riwayat_harga || []
  };
}
function rowToRab(r) {
  return {
    id: r.id, nomor: r.nomor || "", klienId: r.klien_id || "", klien: r.klien || "",
    nama: r.nama_proyek || "", lokasi: r.lokasi || "", kategori: r.kategori || "",
    tanggal: r.tanggal || "", ppn: r.ppn || 0, pph: r.pph || 0, biayaLain: r.biaya_lain || 0,
    proyekId: r.proyek_id || "", revisiDariId: r.revisi_dari_id || "", revisiKe: r.revisi_ke || 0,
    items: r.items || []
  };
}
function rowToPenawaran(r) {
  return {
    id: r.id, nomor: r.nomor || "", klienId: r.klien_id || "", kepada: r.kepada || "",
    alamatKlien: r.alamat_klien || "", perihal: r.perihal || "", kategori: r.kategori || "",
    status: r.status || "", tanggal: r.tanggal || "", diskon: r.diskon || 0, ppn: r.ppn || 0,
    pph: r.pph || 0, biayaLain: r.biaya_lain || 0, syarat: r.syarat || "", penutup: r.penutup || "", ttdNama: r.ttd_nama || "",
    ttdJabatan: r.ttd_jabatan || "", proyekId: r.proyek_id || "", revisiDariId: r.revisi_dari_id || "",
    revisiKe: r.revisi_ke || 0, brand: r.brand || "mitra", markupPercent: r.markup_percent ?? null,
    sourcePenawaranId: r.source_penawaran_id || "", items: r.items || []
  };
}
function rowToProyek(r) {
  return {
    id: r.id, nama: r.nama || "", klienId: r.klien_id || "", klien: r.klien || "",
    lokasi: r.lokasi || "", nilaiKontrak: r.nilai_kontrak || 0, status: r.status || "",
    tanggalMulai: r.tanggal_mulai || "", tanggalSelesai: r.tanggal_selesai || "",
    biayaBahan: r.biaya_bahan || 0, biayaUpah: r.biaya_upah || 0, biayaLain: r.biaya_lain || 0,
    karyawanIds: r.karyawan_ids || [], subkontraktor: r.subkontraktor || [],
    belanjaMaterial: r.belanja_material || [], sumberRabId: r.sumber_rab_id || "",
    sumberPenawaranId: r.sumber_penawaran_id || "", progressRencana: r.progress_rencana || [],
    progressRealisasi: r.progress_realisasi || [], dokumen: r.dokumen || [],
    jadwalPekerjaan: r.jadwal_pekerjaan || [], laporanHarian: r.laporan_harian || [],
    perubahanPekerjaan: r.perubahan_pekerjaan || []
  };
}
function rowToKaryawan(r) {
  return {
    id: r.id, nama: r.nama || "", jabatan: r.jabatan || "", tipeGaji: r.tipe_gaji || "",
    aktif: r.aktif !== false, upahHarian: r.upah_harian || 0, tarifLembur: r.tarif_lembur || 0,
    uangMakanHarian: r.uang_makan_harian || 0, gajiBulanan: r.gaji_bulanan || 0,
    targetBulanan: r.target_bulanan || 0, persenBonus: r.persen_bonus || 0,
    pinjamanAwal: r.pinjaman_awal || 0, absensi: r.absensi || [],
    slipGaji: [] // diisi belakangan oleh hydrateSensitiveFields()
  };
}
function rowToStok(r) {
  return {
    id: r.id, nama: r.nama || "", kategori: r.kategori || "", satuan: r.satuan || "",
    stokAwal: r.stok_awal || 0, stokMinimum: r.stok_minimum || 0, hargaSatuan: r.harga_satuan || 0,
    transactions: r.transactions || []
  };
}
function rowToGudang(r) { return { id: r.id, nama: r.nama || "" }; }
function rowToPemasok(r) {
  return {
    id: r.id, nama: r.nama || "", kategori: r.kategori || "", telepon: r.telepon || "",
    alamat: r.alamat || "", catatan: r.catatan || ""
  };
}
async function buildStateFromRelational(companyId) {
  // company_profile diambil terpisah dengan try/catch sendiri -- ini
  // tabel yang PALING BARU (Fase 0.4), jadi selama jeda deploy sudah
  // jalan tapi SQL-nya belum dijalankan Owner, tabel ini belum ada sama
  // sekali. Kalau gagal, field profil cukup kosong sementara -- modul
  // lain (yang tabelnya sudah ada sejak Fase A/C) tetap harus tetap jalan
  // normal, tidak boleh ikut gagal gara-gara ini.
  let profileRow = null;
  try {
    const { data, error } = await sb.from("company_profile").select("*").eq("company_id", companyId).maybeSingle();
    if (!error) profileRow = data;
  } catch (e) { /* tabel belum ada -- biarkan profileRow null */ }

  let klienRows = [], ahspRows = [], rabRows = [], penawaranRows = [], proyekRows = [],
    karyawanRows = [], stokRows = [], gudangRows = [], pemasokRows = [];
  try {
    const [klienRes, ahspRes, rabRes, penawaranRes, proyekRes, karyawanRes, stokRes, gudangRes, pemasokRes] = await Promise.all([
      sb.from("klien").select("*").eq("company_id", companyId),
      sb.from("ahsp").select("*").eq("company_id", companyId),
      sb.from("rab").select("*").eq("company_id", companyId),
      sb.from("penawaran").select("*").eq("company_id", companyId),
      sb.from("proyek").select("*").eq("company_id", companyId),
      sb.from("karyawan").select("*").eq("company_id", companyId),
      sb.from("stok_material").select("*").eq("company_id", companyId),
      sb.from("gudang").select("*").eq("company_id", companyId),
      sb.from("pemasok").select("*").eq("company_id", companyId)
    ]);
    klienRows = klienRes.error ? [] : (klienRes.data || []);
    ahspRows = ahspRes.error ? [] : (ahspRes.data || []);
    rabRows = rabRes.error ? [] : (rabRes.data || []);
    penawaranRows = penawaranRes.error ? [] : (penawaranRes.data || []);
    proyekRows = proyekRes.error ? [] : (proyekRes.data || []);
    karyawanRows = karyawanRes.error ? [] : (karyawanRes.data || []);
    stokRows = stokRes.error ? [] : (stokRes.data || []);
    gudangRows = gudangRes.error ? [] : (gudangRes.data || []);
    pemasokRows = pemasokRes.error ? [] : (pemasokRes.data || []);
  } catch (e) { /* biarkan semua kosong -- jaring pengaman di bawah akan pakai blob */ }

  let built = {
    company: (profileRow && profileRow.company) || "",
    alamat: (profileRow && profileRow.alamat) || "",
    telepon: (profileRow && profileRow.telepon) || "",
    ownerNama: (profileRow && profileRow.owner_nama) || "",
    ownerJabatan: (profileRow && profileRow.owner_jabatan) || "",
    approvalThreshold: (profileRow && profileRow.approval_threshold) || 0,
    penawaranCounter: (profileRow && profileRow.penawaran_counter) || 0,
    rabCounter: (profileRow && profileRow.rab_counter) || 0,
    mataResolusiMarkupPercent: (profileRow && profileRow.mata_resolusi_markup_percent) ?? 5,
    mataResolusiPenawaranCounter: (profileRow && profileRow.mata_resolusi_penawaran_counter) || 0,
    targetOmzetBulanan: (profileRow && profileRow.target_omzet_bulanan) || 0,
    targetLababersihBulanan: (profileRow && profileRow.target_laba_bersih_bulanan) || 0,
    klien: klienRows.map(rowToKlien),
    ahsp: ahspRows.map(rowToAhsp),
    proyekRab: rabRows.map(rowToRab),
    penawaran: penawaranRows.map(rowToPenawaran),
    proyek: proyekRows.map(rowToProyek),
    karyawan: karyawanRows.map(rowToKaryawan),
    stok: stokRows.map(rowToStok),
    gudang: gudangRows.map(rowToGudang),
    pemasok: pemasokRows.map(rowToPemasok),
    kasUsaha: { transactions: [], saldoAwal: 0 },
    kasPribadi: { transactions: [], saldoAwal: 0 }
  };

  // Jaring pengaman: kalau SEMUA 9 modul relasional kosong total untuk
  // company ini (indikasi tabel belum ter-backfill, mis. jeda deploy
  // sebelum migrateXIfNeeded sempat jalan) SEMENTARA blob app_state masih
  // punya isi, jangan percaya hasil relasional -- pakai isi blob untuk
  // pemuatan kali ini saja, dan jadwalkan penulisan ulang ke tabel
  // relasional di latar belakang supaya pemuatan berikutnya sudah benar.
  const totallyEmpty = !built.klien.length && !built.ahsp.length && !built.proyekRab.length &&
    !built.penawaran.length && !built.proyek.length && !built.karyawan.length &&
    !built.stok.length && !built.gudang.length && !built.pemasok.length;
  if (totallyEmpty) {
    try {
      const { data: blobRow } = await sb.from("app_state").select("data").eq("user_id", companyId).maybeSingle();
      if (blobRow && blobRow.data) {
        built = withDefaults(JSON.parse(JSON.stringify(blobRow.data)));
        // Ditunda beberapa detik: handlePostLoginSync menimpa variabel
        // global `state` dengan hasil fungsi ini SEGERA setelah promise-nya
        // selesai (langkah sinkron berikutnya) -- jeda ini cuma jaga-jaga
        // supaya mirrorAllToRelational() (yang membaca `state` global,
        // bukan `built` lokal ini) tidak sempat jalan sebelum penggantian
        // itu terjadi.
        setTimeout(() => { mirrorAllToRelational().catch(() => {}); }, 3000);
      }
    } catch (e) { /* blob juga gagal diambil -- lanjut dengan hasil relasional kosong apa adanya */ }
  }

  built = withDefaults(built);
  built = await hydrateSensitiveFields(built);
  return built;
}

async function handlePostLoginSync(user) {
  currentSyncUser = user;
  await resolveTeamMembership(user);
  updateSyncUI();
  applyRoleAccess();
  subscribeRealtime(targetCompanyId);
  try {
    // Fase 0.4 Tahap 2: "data cloud" dibangun LANGSUNG dari tabel
    // relasional, tidak lagi lewat blob app_state sama sekali -- selain
    // menutup 1 titik baca terakhir yang masih bisa berbeda dari sumber
    // kebenaran, ini juga memperbaiki celah untuk Admin/Marketing: RLS
    // app_state sudah Owner-only sejak Fase D, jadi query blob mereka
    // sebelumnya selalu kosong (bukan error, RLS diam-diam menolak) dan
    // login mereka diam-diam TIDAK pernah benar dapat "data cloud" lewat
    // jalur ini -- mereka cuma tertolong Realtime yang belakangan
    // reload data. buildStateFromRelational() sudah menegakkan RLS
    // per-peran yang benar untuk SEMUA peran, jadi jalur ini sekarang
    // konsisten untuk Owner maupun Admin/Marketing.
    // (Blob app_state TETAP ditulis di latar belakang oleh
    // pushStateToCloud/scheduleCloudPush -- itu sengaja dibiarkan, murni
    // untuk memberi makan Backup Otomatis di server, bukan lagi dibaca
    // aplikasi ini sama sekali.)
    const cloudState = await buildStateFromRelational(targetCompanyId);
    // "ahsp" sengaja TIDAK dicek di sini -- withDefaults() (dipanggil di
    // dalam buildStateFromRelational sebelum return) selalu membackfill
    // SEED_AHSP kalau array-nya kosong, jadi cloudState.ahsp tidak pernah
    // benar-benar 0 walau tabel relasionalnya memang kosong total untuk
    // perusahaan baru -- modul lain di bawah ini tidak punya seed data
    // seperti itu, jadi tetap indikator yang benar.
    const cloudKosong = !cloudState.klien.length && !cloudState.proyekRab.length &&
      !cloudState.penawaran.length && !cloudState.proyek.length && !cloudState.karyawan.length &&
      !cloudState.stok.length && !cloudState.gudang.length && !cloudState.pemasok.length;
    if (cloudKosong) {
      state = await hydrateSensitiveFields(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      await mirrorAllToRelational();
      // pushStateToCloud() dipanggil eksplisit juga di sini (bukan cuma
      // lewat scheduleCloudPush() yang dipicu saveState() nanti) supaya
      // blob app_state langsung terisi saat itu juga untuk Backup
      // Otomatis, bukan menunggu edit berikutnya.
      await pushStateToCloud();
      setSyncStatus("Data awal berhasil diunggah ke cloud.");
      return;
    }
    const pakaiCloud = confirm(`Ditemukan data yang sudah tersinkron di cloud.\n\nKlik OK untuk memakai data dari CLOUD (data di perangkat ini akan diganti dengan data cloud).\nKlik Batal untuk tetap memakai data di PERANGKAT INI (data perangkat ini akan digabungkan ke cloud).`);
    if (pakaiCloud) {
      // buildStateFromRelational() sudah termasuk memanggil
      // hydrateSensitiveFields() di dalamnya.
      state = cloudState;
    } else {
      // Fase D: state lokal yang sudah tersimpan di perangkat (misalnya
      // dari sesi Owner sebelumnya di perangkat yang sama) tidak boleh
      // dipercaya begitu saja untuk peran yang login sekarang -- Kas
      // Perusahaan/Kas Pribadi/slip gaji/saldoAwal SELALU disegarkan dari
      // tabel relasional.
      state = await hydrateSensitiveFields(state);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    if (pakaiCloud) {
      setSyncStatus("Data dari cloud berhasil dimuat ke perangkat ini.");
    } else {
      await mirrorAllToRelational();
      await pushStateToCloud();
      setSyncStatus("Data perangkat ini berhasil digabungkan ke cloud.");
    }
  } catch (err) {
    setSyncStatus("Gagal memeriksa data cloud: " + err.message);
  } finally {
    migrateCompanyProfileIfNeeded();
    migrateKlienIfNeeded();
    migrateAhspIfNeeded();
    migrateRabIfNeeded();
    migratePenawaranIfNeeded();
    migrateProyekIfNeeded();
    migrateKaryawanIfNeeded();
    migrateStokIfNeeded();
    migrateGudangIfNeeded();
    migratePemasokIfNeeded();
    migrateKasUsahaIfNeeded();
    migrateKasPribadiIfNeeded();
  }
}
function setSyncStatus(text) {
  const el = document.getElementById("sync_status");
  if (el) el.textContent = text;
}
const ROLE_LABELS = { owner: "Pemilik", admin: "Admin", marketing: "Marketing" };
function updateSyncUI() {
  const loggedOut = document.getElementById("sync_loggedOutPanel");
  const loggedIn = document.getElementById("sync_loggedInPanel");
  if (!loggedOut || !loggedIn) return;
  if (currentSyncUser) {
    loggedOut.style.display = "none";
    loggedIn.style.display = "block";
    document.getElementById("sync_userEmail").textContent = currentSyncUser.email || "-";
    const roleEl = document.getElementById("sync_userRole");
    if (roleEl) roleEl.textContent = ROLE_LABELS[currentTeamRole] || currentTeamRole;
    const teamPanel = document.getElementById("sync_teamPanel");
    if (teamPanel) teamPanel.style.display = currentTeamRole === "owner" ? "block" : "none";
    if (currentTeamRole === "owner") renderTeamMembers();
    const backupPanel = document.getElementById("settingsBackupPanel");
    if (backupPanel) {
      backupPanel.style.display = currentTeamRole === "owner" ? "block" : "none";
      if (currentTeamRole === "owner") renderBackupHistory();
    }
    if (currentTeamRole === "owner" && document.getElementById("page-aktivitas").classList.contains("active")) renderActivityLog(true);
  } else {
    loggedOut.style.display = "block";
    loggedIn.style.display = "none";
    const backupPanel = document.getElementById("settingsBackupPanel");
    if (backupPanel) backupPanel.style.display = "none";
  }
}

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
// Dipakai untuk field persen (PPN/PPh/Diskon) yang HTML-nya sudah punya
// min="0" max="100" tapi listener "input" langsung baca value tanpa lewat
// validasi form submit, jadi browser tidak menegakkan batas itu saat user
// mengetik langsung -- clamp manual di sini supaya nilai di luar 0-100 tidak
// pernah tersimpan ke state.
function clampPercent(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
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
function daysBetweenIso(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const a = new Date(fromIso + "T00:00:00");
  const b = new Date(toIso + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
function waLink(nomor, text) {
  let digits = (nomor || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (!digits.startsWith("62")) digits = "62" + digits;
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
function buildInviteMessage(email, role) {
  const namaPeran = ROLE_LABELS[role] || role;
  const loginUrl = window.location.origin + window.location.pathname;
  return `Halo! Anda diundang bergabung sebagai *${namaPeran}* di aplikasi Laporan Keuangan CV Mitra Creative.\n\nCara login:\n1. Buka ${loginUrl}\n2. Buka menu Pengaturan > Akun & Sinkronisasi Cloud\n3. Masuk dengan email ini: ${email}\n4. Masukkan kode OTP yang dikirim ke email tersebut\n\nTerima kasih.`;
}
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    return false;
  }
}
async function sendInviteInstruction(email, role, whatsapp) {
  const pesan = buildInviteMessage(email, role);
  const link = waLink(whatsapp, pesan);
  if (link) {
    window.open(link, "_blank");
    showTeamMsg(`Instruksi login untuk ${email} dibuka di WhatsApp. Silakan kirim pesannya.`);
    return;
  }
  const ok = await copyToClipboard(pesan);
  showTeamMsg(ok
    ? `Teks instruksi login untuk ${email} sudah disalin ke clipboard. Silakan kirim lewat email/chat lain.`
    : `Berhasil diundang. Minta ${email} login lewat halaman Pengaturan > Akun & Sinkronisasi Cloud di perangkat mereka dengan email yang sama.`);
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
// Sama seperti attachNumberFormatting(), tapi mempertahankan tanda minus
// di depan -- dipakai untuk field yang nilainya boleh negatif (mis. Nilai
// Perubahan Pekerjaan, bisa jadi pengurangan). attachNumberFormatting()
// biasa sengaja membuang semua karakter non-digit (termasuk "-") karena
// dirancang untuk field Rupiah yang selalu positif (jumlah transaksi,
// harga satuan, dst).
function attachSignedNumberFormatting(input) {
  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    const before = input.value;
    const negatif = before.trim().startsWith("-");
    const digits = before.replace(/[^0-9]/g, "");
    input.value = digits ? (negatif ? "-" : "") + Number(digits).toLocaleString("id-ID") : (negatif ? "-" : "");
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
      // Math.max(0, ...): transaksi Keluar otomatis dari slip gaji (lihat
      // pg_simpanCetakBtn/syncSlipGajiKasTxn) BISA bernilai negatif kalau
      // total potongan karyawan melebihi upah kotornya di periode itu --
      // keputusan bisnis yang sah, nilai aslinya tetap disimpan apa adanya
      // di transaksi. Tapi di sini, di titik penjumlahan saldo, nilai
      // negatif itu HARUS diabaikan (dianggap 0) -- kalau tidak, "+= t.jumlah"
      // pada transaksi Keluar negatif justru MENAMBAH saldoAkhir, kebalikan
      // dari makna "pengeluaran".
      if (status === "menunggu_persetujuan") menungguPersetujuan += Math.max(0, t.jumlah);
      else keluarLunas += Math.max(0, t.jumlah);
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

  const today = new Date().toISOString().slice(0, 10);
  const finalTahap = ["Selesai", "Hilang"];
  const pendingTxns = state.kasUsaha.transactions.filter(t => (t.status || "lunas") === "menunggu_persetujuan");
  const stokHampir = state.stok.filter(s => stokStatus(s) === "hampir").length;
  const stokHabis = state.stok.filter(s => stokStatus(s) === "habis").length;
  const klienFollowUp = state.klien.filter(k => !finalTahap.includes(k.tahap) && k.followUpTanggal && k.followUpTanggal <= today).length;
  const klienMandek = state.klien.filter(k => klienIsStale(k, today)).length;
  const pwKadaluarsa = state.penawaran.filter(p => pwIsKadaluarsa(p, today)).length;

  const alerts = [
    pendingTxns.length ? { icon: "⏳", label: "Kas Perusahaan menunggu persetujuan", value: `${pendingTxns.length} transaksi · ${rupiah(ku.menungguPersetujuan)}`, page: "kasUsaha" } : null,
    stokHabis ? { icon: "🔴", label: "Stok habis", value: `${stokHabis} barang`, page: "stok" } : null,
    stokHampir ? { icon: "🟡", label: "Stok hampir habis", value: `${stokHampir} barang`, page: "stok" } : null,
    klienFollowUp ? { icon: "📞", label: "Klien follow-up jatuh tempo", value: `${klienFollowUp} klien`, page: "klien" } : null,
    klienMandek ? { icon: "⚠️", label: "Klien mandek (>21 hari tanpa perubahan tahap)", value: `${klienMandek} klien`, page: "klien" } : null,
    pwKadaluarsa ? { icon: "📄", label: "Penawaran kadaluarsa", value: `${pwKadaluarsa} penawaran`, page: "penawaran" } : null
  ].filter(Boolean);

  document.getElementById("dash_alertPanel").style.display = alerts.length ? "block" : "none";
  document.getElementById("dash_allClearPanel").style.display = alerts.length ? "none" : "block";
  document.getElementById("dash_alertRows").innerHTML = alerts.map(a => `
    <div class="summary-row">
      <span>${a.icon} ${escapeHtml(a.label)}</span>
      <strong><a href="#" data-goto-page="${a.page}">${escapeHtml(a.value)} →</a></strong>
    </div>
  `).join("");

  renderBarChart(document.getElementById("chartCashflow"), [
    { label: "Usaha - Masuk", value: ku.masukLunas, color: "var(--series-1)", formattedValue: rupiah(ku.masukLunas) },
    { label: "Usaha - Keluar", value: ku.keluarLunas, color: "var(--series-2)", formattedValue: rupiah(ku.keluarLunas) },
    { label: "Pribadi - Masuk", value: kp.masukLunas, color: "var(--series-1)", formattedValue: rupiah(kp.masukLunas) },
    { label: "Pribadi - Keluar", value: kp.keluarLunas, color: "var(--series-2)", formattedValue: rupiah(kp.keluarLunas) }
  ]);

  // value TIDAK di-clamp ke 0 -- renderBarChart() sudah menangani nilai
  // negatif dengan benar lewat Math.abs() saat menghitung lebar batang,
  // supaya proyek rugi parah (mis. -60%) tetap kelihatan beda dari yang
  // nyaris impas (-2%), bukan sama-sama jadi batang minimum.
  const marginRows = projects
    .slice().sort((a, b) => b.marginPct - a.marginPct)
    .map(p => ({
      label: p.nama, value: p.marginPct * 100,
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
document.getElementById("dash_alertRows").addEventListener("click", e => {
  const link = e.target.closest("[data-goto-page]");
  if (link) { e.preventDefault(); showPage(link.dataset.gotoPage); }
});

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
          ${status === "menunggu_persetujuan" && t.tipe === "Keluar" ? `<button class="icon-btn" data-approve="${t.id}" data-book="${book}" title="Setujui">✅</button>` : ""}
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

  const search = (document.getElementById("pr_search").value || "").toLowerCase();
  const filterStatus = document.getElementById("pr_filterStatus").value;
  let rows = projects;
  if (search) rows = rows.filter(p => (p.nama || "").toLowerCase().includes(search) || (p.klien || "").toLowerCase().includes(search));
  if (filterStatus) rows = rows.filter(p => p.status === filterStatus);

  const tbody = document.querySelector("#pr_table tbody");
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Belum ada proyek</td></tr>';
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  rows.forEach(p => {
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
  if (!p.jadwalPekerjaan) p.jadwalPekerjaan = [];
  if (!p.laporanHarian) p.laporanHarian = [];
  if (!p.perubahanPekerjaan) p.perubahanPekerjaan = [];

  const rencanaSorted = p.progressRencana.slice().sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  const realisasiSorted = p.progressRealisasi.slice().sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  const progressStatus = proyekProgressStatus(p, today);
  const realisasiTerakhir = progressStatus ? progressStatus.realisasiTerakhir : null;
  const targetTerdekat = progressStatus ? progressStatus.targetTerdekat : null;

  document.getElementById("pf_realisasiTerakhir").textContent = realisasiTerakhir ? `${realisasiTerakhir.persen}%` : "0%";
  document.getElementById("pf_targetTerdekat").textContent = targetTerdekat ? `${targetTerdekat.persen}% (${formatTanggal(targetTerdekat.tanggal)})` : "-";
  const statusEl = document.getElementById("pf_statusProgress");
  if (!progressStatus) {
    statusEl.textContent = "-";
    statusEl.className = "stat-value";
  } else {
    statusEl.textContent = progressStatus.telat ? "Telat dari Rencana" : "Sesuai/Lebih Cepat";
    statusEl.className = "stat-value " + (progressStatus.telat ? "bad" : "good");
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

  renderJadwalPekerjaan(p, today);
  renderLaporanHarian(p);
  renderPerubahanPekerjaan(p);
}

// ----- Jadwal Pekerjaan (Gantt sederhana) -----
function renderJadwalPekerjaan(p, today) {
  const tugas = p.jadwalPekerjaan.slice().sort((a, b) => (a.tanggalMulai || "").localeCompare(b.tanggalMulai || ""));
  document.querySelector("#pj_jadwalTable tbody").innerHTML = tugas.length ? tugas.map(t => {
    const telat = t.tanggalSelesai && t.tanggalSelesai < today && (t.persenSelesai || 0) < 100;
    return `
    <tr>
      <td>${escapeHtml(t.nama)}</td>
      <td>${t.tanggalMulai ? formatTanggal(t.tanggalMulai) : "-"}</td>
      <td class="${telat ? "bad" : ""}">${t.tanggalSelesai ? formatTanggal(t.tanggalSelesai) : "-"}${telat ? " ⚠️ telat" : ""}</td>
      <td class="num">${t.persenSelesai || 0}%</td>
      <td><div class="row-actions"><button class="icon-btn" data-delete-jadwal="${t.id}" title="Hapus">🗑️</button></div></td>
    </tr>
  `; }).join("") : '<tr class="empty-row"><td colspan="5">Belum ada tahapan pekerjaan</td></tr>';

  const ganttEl = document.getElementById("pj_gantt");
  const withDates = tugas.filter(t => t.tanggalMulai && t.tanggalSelesai);
  if (!withDates.length) {
    ganttEl.innerHTML = '<div class="muted" style="font-size:12px;">Isi Tanggal Mulai &amp; Selesai pada tahapan untuk melihat visual Gantt.</div>';
    return;
  }
  const rentangMulai = withDates.reduce((m, t) => t.tanggalMulai < m ? t.tanggalMulai : m, withDates[0].tanggalMulai);
  const rentangSelesai = withDates.reduce((m, t) => t.tanggalSelesai > m ? t.tanggalSelesai : m, withDates[0].tanggalSelesai);
  const totalHari = Math.max(1, daysBetweenIso(rentangMulai, rentangSelesai));
  ganttEl.innerHTML = withDates.map(t => {
    const offsetHari = Math.max(0, daysBetweenIso(rentangMulai, t.tanggalMulai));
    const durasiHari = Math.max(1, daysBetweenIso(t.tanggalMulai, t.tanggalSelesai));
    const left = (offsetHari / totalHari) * 100;
    const width = Math.max(2, (durasiHari / totalHari) * 100);
    const telat = t.tanggalSelesai < today && (t.persenSelesai || 0) < 100;
    const warna = (t.persenSelesai || 0) >= 100 ? "var(--good)" : telat ? "var(--critical)" : "var(--series-1)";
    return `
    <div class="bar-row">
      <div class="bar-label" title="${escapeHtml(t.nama)}">${escapeHtml(t.nama)}</div>
      <div class="bar-track" style="position:relative;">
        <div style="position:absolute; left:${left}%; width:${width}%; height:100%; border-radius:4px; background:${warna};" title="${t.persenSelesai || 0}%"></div>
      </div>
      <div class="bar-value">${t.persenSelesai || 0}%</div>
    </div>
  `;
  }).join("");
}
document.getElementById("jp_addBtn").addEventListener("click", () => {
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) return;
  const nama = document.getElementById("jp_nama").value.trim();
  const tanggalMulai = document.getElementById("jp_mulai").value;
  const tanggalSelesai = document.getElementById("jp_selesai").value;
  if (!nama) { alert("Isi nama tahapan pekerjaan terlebih dahulu."); return; }
  if (tanggalMulai && tanggalSelesai && tanggalSelesai < tanggalMulai) { alert("Tanggal Selesai tidak boleh sebelum Tanggal Mulai."); return; }
  if (!p.jadwalPekerjaan) p.jadwalPekerjaan = [];
  p.jadwalPekerjaan.push({
    id: uid(), nama, tanggalMulai, tanggalSelesai,
    persenSelesai: Math.max(0, Math.min(100, parseFloat(document.getElementById("jp_persen").value) || 0))
  });
  saveState();
  mirrorProyekUpsert(p);
  document.getElementById("jp_nama").value = "";
  document.getElementById("jp_mulai").value = "";
  document.getElementById("jp_selesai").value = "";
  document.getElementById("jp_persen").value = "";
  renderProyekDetail();
});
document.getElementById("pj_jadwalTable").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-jadwal]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (delBtn && p && confirm("Hapus tahapan pekerjaan ini?")) {
    p.jadwalPekerjaan = (p.jadwalPekerjaan || []).filter(t => t.id !== delBtn.dataset.deleteJadwal);
    saveState();
    mirrorProyekUpsert(p);
    renderProyekDetail();
  }
});

// ----- Laporan Harian Lapangan -----
const laporanHarianModal = document.getElementById("laporanHarianModal");
function openLaporanHarianModal(existing) {
  document.getElementById("lap_id").value = existing ? existing.id : "";
  document.getElementById("laporanHarianModalTitle").textContent = existing ? "Edit Laporan Harian" : "Tambah Laporan Harian";
  document.getElementById("lap_tanggal").value = existing ? existing.tanggal : new Date().toISOString().slice(0, 10);
  document.getElementById("lap_cuaca").value = existing ? existing.cuaca : "Cerah";
  document.getElementById("lap_tenagaKerja").value = existing ? existing.tenagaKerja : "";
  document.getElementById("lap_uraian").value = existing ? (existing.uraian || "") : "";
  document.getElementById("lap_kendala").value = existing ? (existing.kendala || "") : "";
  laporanHarianModal.classList.add("open");
}
document.getElementById("lap_addBtn").addEventListener("click", () => openLaporanHarianModal(null));
document.getElementById("laporanHarianForm").addEventListener("submit", e => {
  e.preventDefault();
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) { closeModals(); return; }
  if (!p.laporanHarian) p.laporanHarian = [];
  const id = document.getElementById("lap_id").value;
  const lap = {
    id: id || uid(),
    tanggal: document.getElementById("lap_tanggal").value,
    cuaca: document.getElementById("lap_cuaca").value,
    tenagaKerja: Math.max(0, parseInt(document.getElementById("lap_tenagaKerja").value, 10) || 0),
    uraian: document.getElementById("lap_uraian").value.trim(),
    kendala: document.getElementById("lap_kendala").value.trim()
  };
  const idx = p.laporanHarian.findIndex(l => l.id === id);
  if (idx >= 0) p.laporanHarian[idx] = lap; else p.laporanHarian.push(lap);
  saveState();
  mirrorProyekUpsert(p);
  renderProyekDetail();
  closeModals();
});
document.getElementById("pj_laporanTable").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-laporan]");
  const delBtn = e.target.closest("[data-delete-laporan]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) return;
  if (editBtn) {
    const lap = (p.laporanHarian || []).find(l => l.id === editBtn.dataset.editLaporan);
    if (lap) openLaporanHarianModal(lap);
  } else if (delBtn) {
    if (confirm("Hapus laporan harian ini?")) {
      p.laporanHarian = (p.laporanHarian || []).filter(l => l.id !== delBtn.dataset.deleteLaporan);
      saveState();
      mirrorProyekUpsert(p);
      renderProyekDetail();
    }
  }
});
function renderLaporanHarian(p) {
  const rows = p.laporanHarian.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  document.querySelector("#pj_laporanTable tbody").innerHTML = rows.length ? rows.map(l => `
    <tr>
      <td>${formatTanggal(l.tanggal)}</td>
      <td>${escapeHtml(l.cuaca || "-")}</td>
      <td class="num">${l.tenagaKerja || 0}</td>
      <td>${escapeHtml(l.uraian || "-")}</td>
      <td>${escapeHtml(l.kendala || "-")}</td>
      <td><div class="row-actions"><button class="icon-btn" data-edit-laporan="${l.id}" title="Edit">✏️</button><button class="icon-btn" data-delete-laporan="${l.id}" title="Hapus">🗑️</button></div></td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="6">Belum ada laporan harian</td></tr>';
}

// ----- Perubahan Pekerjaan (Adendum) -----
// Menyesuaikan Nilai Kontrak proyek dengan tepat, apapun urutan
// kejadiannya: dibuat langsung disetujui, disetujui belakangan, koreksi
// nilai pada item yang sudah disetujui, dibatalkan lagi setelah
// disetujui, atau dihapus -- dihitung sebagai "efek sebelum" (0 kalau
// item lama belum/tidak disetujui) dikurangkan dan "efek sesudah"
// ditambahkan, bukan menambah/mengurangi langsung, supaya tidak pernah
// dobel-hitung atau lupa membatalkan.
function applyPerubahanPekerjaanEffect(p, sebelum, sesudah) {
  const efekSebelum = (sebelum && sebelum.status === "disetujui") ? (sebelum.nilaiPerubahan || 0) : 0;
  const efekSesudah = (sesudah && sesudah.status === "disetujui") ? (sesudah.nilaiPerubahan || 0) : 0;
  p.nilaiKontrak = (p.nilaiKontrak || 0) - efekSebelum + efekSesudah;
}
const perubahanPekerjaanModal = document.getElementById("perubahanPekerjaanModal");
function openPerubahanPekerjaanModal(existing) {
  document.getElementById("pp_id").value = existing ? existing.id : "";
  document.getElementById("perubahanPekerjaanModalTitle").textContent = existing ? "Edit Perubahan Pekerjaan" : "Tambah Perubahan Pekerjaan";
  document.getElementById("pp_tanggal").value = existing ? existing.tanggal : new Date().toISOString().slice(0, 10);
  document.getElementById("pp_uraian").value = existing ? (existing.uraian || "") : "";
  document.getElementById("pp_nilaiPerubahan").value = existing ? formatNumberInput(existing.nilaiPerubahan || 0) : "";
  document.getElementById("pp_dampakHari").value = existing ? (existing.dampakHari || "") : "";
  document.getElementById("pp_status").value = existing ? existing.status : "diajukan";
  perubahanPekerjaanModal.classList.add("open");
}
attachSignedNumberFormatting(document.getElementById("pp_nilaiPerubahan"));
document.getElementById("pp_addBtn").addEventListener("click", () => openPerubahanPekerjaanModal(null));
document.getElementById("perubahanPekerjaanForm").addEventListener("submit", e => {
  e.preventDefault();
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) { closeModals(); return; }
  if (!p.perubahanPekerjaan) p.perubahanPekerjaan = [];
  const id = document.getElementById("pp_id").value;
  const existing = p.perubahanPekerjaan.find(x => x.id === id);
  const item = {
    id: id || uid(),
    nomorAdendum: existing ? existing.nomorAdendum : p.perubahanPekerjaan.length + 1,
    tanggal: document.getElementById("pp_tanggal").value,
    uraian: document.getElementById("pp_uraian").value.trim(),
    nilaiPerubahan: parseNumberInput(document.getElementById("pp_nilaiPerubahan").value),
    dampakHari: parseInt(document.getElementById("pp_dampakHari").value, 10) || 0,
    status: document.getElementById("pp_status").value
  };
  if (!item.uraian) { alert("Isi uraian perubahan pekerjaan terlebih dahulu."); return; }
  applyPerubahanPekerjaanEffect(p, existing, item);
  const idx = p.perubahanPekerjaan.findIndex(x => x.id === id);
  if (idx >= 0) p.perubahanPekerjaan[idx] = item; else p.perubahanPekerjaan.push(item);
  saveState();
  mirrorProyekUpsert(p);
  renderProyekDetail();
  closeModals();
});
document.getElementById("pj_perubahanTable").addEventListener("click", e => {
  const editBtn = e.target.closest("[data-edit-perubahan]");
  const delBtn = e.target.closest("[data-delete-perubahan]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (!p) return;
  if (editBtn) {
    const item = (p.perubahanPekerjaan || []).find(x => x.id === editBtn.dataset.editPerubahan);
    if (item) openPerubahanPekerjaanModal(item);
  } else if (delBtn) {
    const item = (p.perubahanPekerjaan || []).find(x => x.id === delBtn.dataset.deletePerubahan);
    if (item && confirm(`Hapus "${item.uraian}"? ${item.status === "disetujui" ? "Nilai Kontrak akan disesuaikan kembali." : ""}`)) {
      applyPerubahanPekerjaanEffect(p, item, null);
      p.perubahanPekerjaan = (p.perubahanPekerjaan || []).filter(x => x.id !== item.id);
      saveState();
      mirrorProyekUpsert(p);
      renderProyekDetail();
    }
  }
});
function perubahanStatusBadge(status) {
  if (status === "disetujui") return "good";
  if (status === "ditolak") return "critical";
  return "warning";
}
function renderPerubahanPekerjaan(p) {
  const rows = p.perubahanPekerjaan.slice().sort((a, b) => (a.nomorAdendum || 0) - (b.nomorAdendum || 0));
  document.querySelector("#pj_perubahanTable tbody").innerHTML = rows.length ? rows.map(item => `
    <tr>
      <td>Adendum ${item.nomorAdendum}</td>
      <td>${formatTanggal(item.tanggal)}</td>
      <td>${escapeHtml(item.uraian)}</td>
      <td class="num ${item.nilaiPerubahan < 0 ? "bad" : "good"}">${item.nilaiPerubahan < 0 ? "-" : "+"}${rupiah(Math.abs(item.nilaiPerubahan))}</td>
      <td class="num">${item.dampakHari ? (item.dampakHari > 0 ? "+" : "") + item.dampakHari + " hari" : "-"}</td>
      <td><span class="badge-margin ${perubahanStatusBadge(item.status)}">${escapeHtml(item.status)}</span></td>
      <td><div class="row-actions"><button class="icon-btn" data-edit-perubahan="${item.id}" title="Edit">✏️</button><button class="icon-btn" data-delete-perubahan="${item.id}" title="Hapus">🗑️</button></div></td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="7">Belum ada perubahan pekerjaan / adendum</td></tr>';
}

// ===== Klien (CRM/Pipeline) =====
function klienDerived(k) {
  const proyekTerkait = state.proyek.filter(p => p.klienId === k.id);
  const penawaranTerkait = state.penawaran.filter(p => p.klienId === k.id);
  const rabTerkait = state.proyekRab.filter(r => r.klienId === k.id);
  const totalNilai = proyekTerkait.reduce((s, p) => s + (p.nilaiKontrak || 0), 0);
  const totalMargin = proyekTerkait.reduce((s, p) => s + projectCalc(p).margin, 0);
  const nilaiPipeline = penawaranTerkait
    .filter(p => ["draft", "terkirim"].includes(p.status))
    .reduce((s, p) => s + penawaranTotals(p).total, 0);
  return { proyekTerkait, penawaranTerkait, rabTerkait, totalNilai, totalMargin, nilaiPipeline };
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
const KLIEN_STALE_HARI = 21;
function klienIsStale(k, today) {
  return !["Selesai", "Hilang"].includes(k.tahap) && k.tahapSejak && daysBetweenIso(k.tahapSejak, today) > KLIEN_STALE_HARI;
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
  document.getElementById("kl_totalPipeline").textContent = rupiah(rowsAll.reduce((s, k) => s + k.nilaiPipeline, 0));

  const sumberCounts = {};
  KLIEN_SUMBER.forEach(s => { sumberCounts[s] = 0; });
  rowsAll.forEach(k => { const s = k.sumber || "Lainnya"; sumberCounts[s] = (sumberCounts[s] || 0) + 1; });
  const sumberRows = Object.entries(sumberCounts).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, color: "var(--series-1)", formattedValue: `${value} klien` }));
  renderBarChart(document.getElementById("kl_sumberChart"), sumberRows);

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
    const stale = klienIsStale(k, today);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(k.nama)}</td>
      <td><span class="badge-margin ${klienTahapBadge(k.tahap)}">${escapeHtml(k.tahap || "Leads")}</span>${stale ? ` <span class="bad" style="font-size:11px;" title="Sudah ${daysBetweenIso(k.tahapSejak, today)} hari tanpa perubahan tahap">⚠️ Mandek</span>` : ""}</td>
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
function buildKlienListPrintHtml() {
  const today = new Date().toISOString().slice(0, 10);
  const search = (document.getElementById("kl_search").value || "").toLowerCase();
  const filterTahap = document.getElementById("kl_filterTahap").value;
  let rows = state.klien.map(k => ({ ...k, ...klienDerived(k) }));
  if (search) rows = rows.filter(k => k.nama.toLowerCase().includes(search));
  if (filterTahap) rows = rows.filter(k => k.tahap === filterTahap);
  rows = rows.slice().sort((a, b) => a.nama.localeCompare(b.nama));

  const bodyRows = rows.length ? rows.map(k => `
    <tr>
      <td>${escapeHtml(k.nama)}</td>
      <td>${escapeHtml(k.tahap || "Leads")}</td>
      <td>${escapeHtml(k.kontakNama || "-")}${k.telepon ? " / " + escapeHtml(k.telepon) : ""}</td>
      <td class="c">${k.followUpTanggal ? formatTanggal(k.followUpTanggal) : "-"}</td>
      <td class="r">${rupiah(k.totalNilai)}</td>
      <td class="r">${rupiah(k.nilaiPipeline)}</td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="c">Tidak ada klien</td></tr>`;

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
    <h3 style="text-align:center; margin:6px 0 16px; letter-spacing:.5px;">DAFTAR KLIEN / PIPELINE</h3>
    ${filterTahap ? `<p class="doc-p">Tahap: <strong>${escapeHtml(filterTahap)}</strong></p>` : ""}
    <table class="doc-items">
      <thead><tr><th>Nama Klien</th><th>Tahap</th><th>Kontak</th><th class="c">Follow-up</th><th class="r">Nilai Kontrak</th><th class="r">Nilai Pipeline</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p style="font-size:11px; color:#777; margin-top:10px;">Dicetak ${formatTanggal(today)} — ${rows.length} klien.</p>
  `;
}
document.getElementById("kl_printBtn").addEventListener("click", () => {
  document.getElementById("printArea").innerHTML = buildKlienListPrintHtml();
  document.body.classList.add("printing-quote");
  window.print();
});
function renderKlienDetail() {
  const k = state.klien.find(x => x.id === currentKlienId);
  if (!k) { showKlienList(); return; }
  if (!k.riwayatKontak) k.riwayatKontak = [];
  if (!k.kontakList) k.kontakList = [];
  const derived = klienDerived(k);

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("kld_nama").textContent = k.nama;
  document.getElementById("kld_sub").textContent = [k.kontakNama, k.telepon].filter(Boolean).join(" · ") || "-";
  document.getElementById("kld_tahap").textContent = k.tahap || "Leads";
  const hariDiTahap = k.tahapSejak ? daysBetweenIso(k.tahapSejak, today) : 0;
  document.getElementById("kld_tahapSejak").textContent = k.tahapSejak ? `${hariDiTahap} hari sejak ${formatTanggal(k.tahapSejak)}` : "-";
  document.getElementById("kld_tahapSejak").className = "stat-meta " + (klienIsStale(k, today) ? "bad" : "");
  document.getElementById("kld_totalProyek").textContent = derived.proyekTerkait.length;
  document.getElementById("kld_totalNilai").textContent = rupiah(derived.totalNilai);
  document.getElementById("kld_totalMargin").textContent = rupiah(derived.totalMargin);
  document.getElementById("kld_totalPipeline").textContent = rupiah(derived.nilaiPipeline);

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

  document.querySelector("#kld_rabTable tbody").innerHTML = derived.rabTerkait.length ? derived.rabTerkait.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "")).map(r => {
    const { total } = rabTotals(r);
    return `<tr><td>${escapeHtml(r.nomor || "-")}</td><td>${escapeHtml(r.nama || "-")}</td><td>${formatTanggal(r.tanggal)}</td><td class="num">${rupiah(total)}</td><td><button class="icon-btn" data-goto-rab="${r.id}" title="Buka RAB">📂</button></td></tr>`;
  }).join("") : '<tr class="empty-row"><td colspan="5">Belum ada RAB terkait</td></tr>';

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

  const picRows = k.kontakList.slice().sort((a, b) => (a.tipe === "Pusat" ? -1 : 1) - (b.tipe === "Pusat" ? -1 : 1));
  document.querySelector("#kld_picTable tbody").innerHTML = picRows.length ? picRows.map(pic => `
    <tr>
      <td>${escapeHtml(pic.tipe)}</td>
      <td>${escapeHtml(pic.area || "-")}</td>
      <td>${escapeHtml(pic.nama || "-")}</td>
      <td>${escapeHtml(pic.jabatan || "-")}</td>
      <td>${pic.whatsapp ? `<a href="${waLink(pic.whatsapp)}" target="_blank" rel="noopener">${escapeHtml(pic.whatsapp)} 💬</a>` : "-"}</td>
      <td><div class="row-actions"><button class="icon-btn" data-delete-pic="${pic.id}" title="Hapus">🗑️</button></div></td>
    </tr>
  `).join("") : '<tr class="empty-row"><td colspan="6">Belum ada kontak/PIC tercatat</td></tr>';
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
  const tahapBaru = document.getElementById("kl_tahap").value;
  const tahapBerubah = !existing || existing.tahap !== tahapBaru;
  const k = {
    ...existing,
    id: id || uid(),
    nama: document.getElementById("kl_nama").value.trim(),
    kontakNama: document.getElementById("kl_kontakNama").value.trim(),
    telepon: document.getElementById("kl_telepon").value.trim(),
    email: document.getElementById("kl_email").value.trim(),
    sumber: document.getElementById("kl_sumber").value,
    alamat: document.getElementById("kl_alamat").value.trim(),
    tahap: tahapBaru,
    tahapSejak: tahapBerubah ? new Date().toISOString().slice(0, 10) : (existing.tahapSejak || new Date().toISOString().slice(0, 10)),
    followUpTanggal: document.getElementById("kl_followUpTanggal").value,
    catatan: document.getElementById("kl_catatan").value.trim(),
    riwayatKontak: existing ? (existing.riwayatKontak || []) : [],
    kontakList: existing ? (existing.kontakList || []) : []
  };
  if (idx >= 0) state.klien[idx] = k; else state.klien.push(k);
  saveState();
  mirrorKlienUpsert(k, existing);
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
      const deleted = state.klien.find(x => x.id === delBtn.dataset.deleteKlien);
      state.klien = state.klien.filter(x => x.id !== delBtn.dataset.deleteKlien);
      mirrorKlienDelete(delBtn.dataset.deleteKlien, deleted);
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
function toggleKlienPicArea() {
  document.getElementById("pic_areaField").style.display = document.getElementById("pic_tipe").value === "Area" ? "flex" : "none";
}
document.getElementById("pic_tipe").addEventListener("change", toggleKlienPicArea);
toggleKlienPicArea();
document.getElementById("pic_addBtn").addEventListener("click", () => {
  const k = state.klien.find(x => x.id === currentKlienId);
  if (!k) return;
  const tipe = document.getElementById("pic_tipe").value;
  const nama = document.getElementById("pic_nama").value.trim();
  const jabatan = document.getElementById("pic_jabatan").value.trim();
  const whatsapp = document.getElementById("pic_wa").value.trim();
  const area = document.getElementById("pic_area").value.trim();
  if (!nama) { alert("Isi nama PIC terlebih dahulu."); return; }
  if (!k.kontakList) k.kontakList = [];
  k.kontakList.push({ id: uid(), tipe, area: tipe === "Area" ? area : "", nama, jabatan, whatsapp });
  saveState();
  mirrorKlienUpsert(k);
  document.getElementById("pic_area").value = "";
  document.getElementById("pic_nama").value = "";
  document.getElementById("pic_jabatan").value = "";
  document.getElementById("pic_wa").value = "";
  renderKlienDetail();
});
document.getElementById("kld_picTable").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-pic]");
  const k = state.klien.find(x => x.id === currentKlienId);
  if (delBtn && k && confirm("Hapus kontak PIC ini?")) {
    k.kontakList = (k.kontakList || []).filter(p => p.id !== delBtn.dataset.deletePic);
    saveState();
    mirrorKlienUpsert(k);
    renderKlienDetail();
  }
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
  mirrorKlienUpsert(k);
  document.getElementById("rk_tanggal").value = "";
  document.getElementById("rk_catatan").value = "";
  renderKlienDetail();
});
document.getElementById("kld_kontakTable").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-kontak]");
  const k = state.klien.find(x => x.id === currentKlienId);
  if (delBtn && k && confirm("Hapus riwayat kontak ini?")) {
    k.riwayatKontak = (k.riwayatKontak || []).filter(r => r.id !== delBtn.dataset.deleteKontak);
    saveState();
    mirrorKlienUpsert(k);
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
document.getElementById("kld_rabTable").addEventListener("click", e => {
  const gotoBtn = e.target.closest("[data-goto-rab]");
  if (gotoBtn) goToDoc("rab", gotoBtn.dataset.gotoRab);
});
document.getElementById("kld_toRabBtn").addEventListener("click", () => {
  const k = state.klien.find(x => x.id === currentKlienId);
  if (!k) return;
  const rab = { id: uid(), nomor: nextRabNomor(), nama: k.nama, klien: k.nama, klienId: k.id, lokasi: k.alamat || "", kategori: KATEGORI_PEKERJAAN[0], tanggal: new Date().toISOString().slice(0, 10), ppn: 0, pph: 0.5, biayaLain: 0, items: [] };
  state.proyekRab.push(rab);
  saveState();
  mirrorRabUpsert(rab, true);
  goToDoc("rab", rab.id);
});
document.getElementById("kld_toPwBtn").addEventListener("click", () => {
  const k = state.klien.find(x => x.id === currentKlienId);
  if (!k) return;
  const pw = {
    id: uid(), nomor: nextPenawaranNomor(), tanggal: new Date().toISOString().slice(0, 10),
    kepada: k.nama, klienId: k.id, alamatKlien: k.alamat || "", perihal: "", kategori: KATEGORI_PEKERJAAN[0], status: "draft",
    diskon: 0, ppn: 11, pph: 0.5, biayaLain: 0, items: [], syarat: defaultSyarat(), penutup: defaultPenutup(),
    ttdNama: state.ownerNama, ttdJabatan: state.ownerJabatan
  };
  state.penawaran.push(pw);
  saveState();
  mirrorPenawaranUpsert(pw, true);
  goToDoc("pw", pw.id);
});

// ===== Laporan Keuangan =====
function computeLabaRugi(mulai, selesai) {
  const txns = state.kasUsaha.transactions.filter(t => (t.status || "lunas") === "lunas" && t.tanggal >= mulai && t.tanggal <= selesai);
  const byKategori = {};
  txns.forEach(t => {
    const key = t.kategori || "(Tanpa Kategori)";
    if (!byKategori[key]) byKategori[key] = { tipe: t.tipe, jumlah: 0 };
    // Sama seperti kasSummary(): transaksi Keluar otomatis dari slip gaji bisa
    // bernilai negatif kalau potongan karyawan melebihi upah kotornya di
    // periode itu (keputusan bisnis yang sah, lihat www/app.js sekitar
    // syncSlipGajiKasTxn). Diabaikan (dianggap 0) di sini, bukan dikurangi
    // jadi negatif -- kalau tidak, beban kategori itu malah berkurang dan
    // labaBersih jadi lebih besar dari yang seharusnya.
    byKategori[key].jumlah += t.tipe === "Keluar" ? Math.max(0, t.jumlah || 0) : (t.jumlah || 0);
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
  // Math.max(0, ...): sama seperti kasSummary(), transaksi Keluar otomatis
  // dari slip gaji bisa bernilai negatif -- diabaikan di sini supaya tidak
  // salah tafsir jadi PENAMBAH saldoKas.
  const keluar = txnsUpTo.filter(t => t.tipe === "Keluar" && (t.status || "lunas") !== "menunggu_persetujuan").reduce((s, t) => s + Math.max(0, t.jumlah || 0), 0);
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

// ===== KPI =====
// Bucket 6 bulan kalender berturut-turut, berakhir di bulan yang memuat
// endDateStr (atau bulan berjalan kalau kosong) -- dipakai semua grafik
// tren di halaman KPI supaya konsisten.
function monthBuckets(endDateStr, n) {
  const end = endDateStr ? new Date(endDateStr + "T00:00:00") : new Date();
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const finish = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    buckets.push({
      label: start.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
      start: start.toISOString().slice(0, 10),
      end: finish.toISOString().slice(0, 10)
    });
  }
  return buckets;
}
// Diekstrak dari renderProyekDetail() supaya bisa dipakai ulang di KPI --
// logikanya sama persis: bandingkan realisasi progress terakhir terhadap
// target rencana terdekat (atau target terakhir kalau semua sudah lewat).
function proyekProgressStatus(p, today) {
  const rencanaSorted = (p.progressRencana || []).slice().sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  const realisasiSorted = (p.progressRealisasi || []).slice().sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  const realisasiTerakhir = realisasiSorted.length ? realisasiSorted[realisasiSorted.length - 1] : null;
  const targetTerdekat = rencanaSorted.find(r => r.tanggal >= today) || rencanaSorted[rencanaSorted.length - 1] || null;
  if (!targetTerdekat || !realisasiTerakhir) return null;
  const telat = targetTerdekat.tanggal <= today && realisasiTerakhir.persen < targetTerdekat.persen;
  return { telat, realisasiTerakhir, targetTerdekat };
}
function computeKpiPenjualan(mulai, selesai) {
  const pwPeriode = state.penawaran.filter(p => p.status !== "draft" && p.tanggal >= mulai && p.tanggal <= selesai);
  const disetujui = pwPeriode.filter(p => p.status === "disetujui");
  const ditolak = pwPeriode.filter(p => p.status === "ditolak");
  const winRate = (disetujui.length + ditolak.length) ? (disetujui.length / (disetujui.length + ditolak.length)) * 100 : null;
  const nilaiDisetujui = disetujui.reduce((s, p) => s + penawaranTotals(p).total, 0);
  const pipelineAktif = state.penawaran.filter(p => p.status === "draft" || p.status === "terkirim");
  const nilaiPipeline = pipelineAktif.reduce((s, p) => s + penawaranTotals(p).total, 0);
  const funnel = KLIEN_TAHAP.map(t => ({ tahap: t, jumlah: state.klien.filter(k => k.tahap === t).length }));
  const trend = monthBuckets(selesai, 6).map(b => {
    const d = state.penawaran.filter(p => p.status === "disetujui" && p.tanggal >= b.start && p.tanggal <= b.end);
    return { label: b.label, jumlah: d.length, nilai: d.reduce((s, p) => s + penawaranTotals(p).total, 0) };
  });
  return { terkirim: pwPeriode.length, disetujui: disetujui.length, ditolak: ditolak.length, winRate, nilaiDisetujui, pipelineCount: pipelineAktif.length, nilaiPipeline, funnel, trend };
}
function computeKpiProyek(mulai, selesai) {
  const today = new Date().toISOString().slice(0, 10);
  const semua = state.proyek;
  const baruPeriode = semua.filter(p => p.tanggalMulai && p.tanggalMulai >= mulai && p.tanggalMulai <= selesai).length;
  const calcs = semua.map(p => projectCalc(p));
  const marginRata = calcs.length ? (calcs.reduce((s, c) => s + c.marginPct, 0) / calcs.length) * 100 : null;
  const progresses = semua.map(p => proyekProgressStatus(p, today)).filter(Boolean);
  const tepatWaktu = progresses.length ? (progresses.filter(x => !x.telat).length / progresses.length) * 100 : null;
  const totalAnggaran = calcs.reduce((s, c) => s + c.anggaranBahan + c.anggaranUpah + c.anggaranLain + c.anggaranSubkon, 0);
  const totalRealisasi = calcs.reduce((s, c) => s + c.totalBiaya, 0);
  const deviasiAnggaran = totalAnggaran ? ((totalRealisasi - totalAnggaran) / totalAnggaran) * 100 : null;
  const trend = monthBuckets(selesai, 6).map(b => {
    const cohort = semua.filter(p => p.tanggalMulai && p.tanggalMulai >= b.start && p.tanggalMulai <= b.end).map(p => projectCalc(p).marginPct);
    return { label: b.label, marginRata: cohort.length ? (cohort.reduce((s, v) => s + v, 0) / cohort.length) * 100 : 0 };
  });
  return { totalProyek: semua.length, baruPeriode, marginRata, tepatWaktu, deviasiAnggaran, trend };
}
function computeKpiKeuangan(mulai, selesai) {
  const { pendapatan, beban, labaBersih } = computeLabaRugi(mulai, selesai);
  const ku = kasSummary("kasUsaha");
  const rasioPiutang = pendapatan ? (ku.pending / pendapatan) * 100 : null;
  const now = new Date();
  const bulanIniMulai = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const bulanIniSelesai = now.toISOString().slice(0, 10);
  const bulanIni = computeLabaRugi(bulanIniMulai, bulanIniSelesai);
  const trend = monthBuckets(selesai, 6).map(b => {
    const masuk = state.kasUsaha.transactions.filter(t => t.tipe === "Masuk" && (t.status || "lunas") === "lunas" && t.tanggal >= b.start && t.tanggal <= b.end).reduce((s, t) => s + (t.jumlah || 0), 0);
    const keluar = state.kasUsaha.transactions.filter(t => t.tipe === "Keluar" && (t.status || "lunas") !== "menunggu_persetujuan" && t.tanggal >= b.start && t.tanggal <= b.end).reduce((s, t) => s + Math.max(0, t.jumlah || 0), 0);
    return { label: b.label, masuk, keluar };
  });
  return {
    pendapatan, beban, labaBersih, rasioPiutang,
    omzetBulanIni: bulanIni.pendapatan, targetOmzet: state.targetOmzetBulanan || 0,
    labaBulanIni: bulanIni.labaBersih, targetLaba: state.targetLababersihBulanan || 0,
    trend
  };
}
function computeKpiTim(mulai, selesai) {
  const aktif = state.karyawan.filter(k => k.aktif !== false);
  let hadirCount = 0, totalRecord = 0, totalLembur = 0;
  aktif.forEach(k => {
    (k.absensi || []).filter(a => a.tanggal >= mulai && a.tanggal <= selesai).forEach(a => {
      totalRecord++;
      if (a.hadir) hadirCount++;
      totalLembur += a.jamLembur || 0;
    });
  });
  const tingkatKehadiran = totalRecord ? (hadirCount / totalRecord) * 100 : null;
  const calcs = state.proyek.map(p => ({ upah: projectCalc(p).realisasiUpah, kontrak: p.nilaiKontrak || 0 }));
  const totalUpahRealisasi = calcs.reduce((s, c) => s + c.upah, 0);
  const totalNilaiKontrak = calcs.reduce((s, c) => s + c.kontrak, 0);
  const rasioBiayaTenagaKerja = totalNilaiKontrak ? (totalUpahRealisasi / totalNilaiKontrak) * 100 : null;
  const trend = monthBuckets(selesai, 6).map(b => {
    let lembur = 0;
    aktif.forEach(k => (k.absensi || []).filter(a => a.tanggal >= b.start && a.tanggal <= b.end).forEach(a => { lembur += a.jamLembur || 0; }));
    return { label: b.label, lembur };
  });
  return { karyawanAktif: aktif.length, tingkatKehadiran, totalLembur, rasioBiayaTenagaKerja, trend };
}
function kpiPeriode() {
  const mulaiInput = document.getElementById("kpi_mulai");
  const selesaiInput = document.getElementById("kpi_selesai");
  if (!mulaiInput.value) {
    const now = new Date();
    mulaiInput.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }
  if (!selesaiInput.value) selesaiInput.value = new Date().toISOString().slice(0, 10);
  return { mulai: mulaiInput.value, selesai: selesaiInput.value };
}
function pct1(v) { return v == null ? "-" : v.toFixed(1) + "%"; }
function renderKpiPenjualan() {
  const { mulai, selesai } = kpiPeriode();
  const k = computeKpiPenjualan(mulai, selesai);
  document.getElementById("kpi_pwTerkirim").textContent = k.terkirim;
  document.getElementById("kpi_pwDisetujui").textContent = k.disetujui;
  document.getElementById("kpi_winRate").textContent = pct1(k.winRate);
  document.getElementById("kpi_nilaiDisetujui").textContent = rupiah(k.nilaiDisetujui);
  document.getElementById("kpi_pipelineAktif").textContent = `${rupiah(k.nilaiPipeline)} (${k.pipelineCount})`;
  document.getElementById("kpi_funnelRows").innerHTML = k.funnel.map(f => `
    <div class="summary-row"><span>${escapeHtml(f.tahap)}</span><strong>${f.jumlah}</strong></div>
  `).join("");
  renderBarChart(document.getElementById("kpi_trendPenjualan"), k.trend.map(t => ({
    label: t.label, value: t.jumlah, color: "var(--series-1)", formattedValue: `${t.jumlah} (${rupiah(t.nilai)})`
  })));
}
function renderKpiProyek() {
  const { mulai, selesai } = kpiPeriode();
  const k = computeKpiProyek(mulai, selesai);
  document.getElementById("kpi_totalProyek").textContent = k.totalProyek;
  document.getElementById("kpi_proyekBaru").textContent = k.baruPeriode;
  document.getElementById("kpi_marginRata").textContent = pct1(k.marginRata);
  document.getElementById("kpi_tepatWaktu").textContent = pct1(k.tepatWaktu);
  const deviasiEl = document.getElementById("kpi_deviasiAnggaran");
  deviasiEl.textContent = pct1(k.deviasiAnggaran);
  deviasiEl.className = "stat-value " + (k.deviasiAnggaran == null ? "" : (k.deviasiAnggaran > 0 ? "bad" : "good"));
  renderBarChart(document.getElementById("kpi_trendProyek"), k.trend.map(t => ({
    label: t.label, value: t.marginRata, color: t.marginRata >= 0 ? "var(--good)" : "var(--critical)", formattedValue: t.marginRata.toFixed(1) + "%"
  })));
}
function renderKpiKeuangan() {
  const { mulai, selesai } = kpiPeriode();
  const k = computeKpiKeuangan(mulai, selesai);
  document.getElementById("kpi_pendapatan").textContent = rupiah(k.pendapatan);
  const labaEl = document.getElementById("kpi_labaBersih");
  labaEl.textContent = rupiah(k.labaBersih);
  labaEl.className = "stat-value " + (k.labaBersih >= 0 ? "good" : "bad");
  document.getElementById("kpi_rasioPiutang").textContent = pct1(k.rasioPiutang);
  document.getElementById("kpi_omzetBulanIni").textContent = rupiah(k.omzetBulanIni);
  document.getElementById("kpi_targetOmzet").textContent = rupiah(k.targetOmzet);
  document.getElementById("kpi_labaBulanIni").textContent = rupiah(k.labaBulanIni);
  document.getElementById("kpi_targetLaba").textContent = rupiah(k.targetLaba);
  renderBarChart(document.getElementById("kpi_trendKeuangan"), k.trend.flatMap(t => [
    { label: `${t.label} - Masuk`, value: t.masuk, color: "var(--series-1)", formattedValue: rupiah(t.masuk) },
    { label: `${t.label} - Keluar`, value: t.keluar, color: "var(--series-2)", formattedValue: rupiah(t.keluar) }
  ]));
}
function renderKpiTim() {
  const { mulai, selesai } = kpiPeriode();
  const k = computeKpiTim(mulai, selesai);
  document.getElementById("kpi_karyawanAktif").textContent = k.karyawanAktif;
  document.getElementById("kpi_tingkatKehadiran").textContent = pct1(k.tingkatKehadiran);
  document.getElementById("kpi_totalLembur").textContent = `${k.totalLembur.toLocaleString("id-ID")} jam`;
  document.getElementById("kpi_rasioTenagaKerja").textContent = pct1(k.rasioBiayaTenagaKerja);
  renderBarChart(document.getElementById("kpi_trendTim"), k.trend.map(t => ({
    label: t.label, value: t.lembur, color: "var(--series-2)", formattedValue: `${t.lembur.toLocaleString("id-ID")} jam`
  })));
}
function renderKpiActiveSubtab() {
  const activeSubtab = document.querySelector('.subtab-item[data-subtab-page="kpi"].active');
  const name = activeSubtab ? activeSubtab.dataset.subtab : "penjualan";
  if (name === "penjualan") renderKpiPenjualan();
  else if (name === "proyek") renderKpiProyek();
  else if (name === "keuangan") renderKpiKeuangan();
  else if (name === "tim") renderKpiTim();
}
document.getElementById("kpi_mulai").addEventListener("change", renderKpiActiveSubtab);
document.getElementById("kpi_selesai").addEventListener("change", renderKpiActiveSubtab);

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
  const gudangItem = { id: uid(), nama };
  state.gudang.push(gudangItem);
  saveState();
  mirrorGudangUpsert(gudangItem, null);
  document.getElementById("gd_nama").value = "";
  renderGudangManagerTable();
  renderAll();
});
document.getElementById("gd_table").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-gudang]");
  if (delBtn) {
    if (confirm("Hapus gudang/lokasi ini? Transaksi stok yang sudah tercatat tidak ikut terhapus, hanya kaitannya yang hilang.")) {
      const deleted = state.gudang.find(g => g.id === delBtn.dataset.deleteGudang);
      state.gudang = state.gudang.filter(g => g.id !== delBtn.dataset.deleteGudang);
      saveState();
      mirrorGudangDelete(delBtn.dataset.deleteGudang, deleted);
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
      const sebelum = { ...t };
      t.status = "lunas";
      saveState();
      mirrorKasTxnUpsert("kasUsaha", t, sebelum);
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
function filteredStokItems() {
  const items = state.stok.map(s => ({ ...s, qty: stokQty(s), nilai: stokValue(s), status: stokStatus(s) }));
  const search = (document.getElementById("stok_search").value || "").toLowerCase();
  const filterKategori = document.getElementById("stok_filterKategori").value;
  const filterStatus = document.getElementById("stok_filterStatus").value;
  let rows = items.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  if (search) rows = rows.filter(s => s.nama.toLowerCase().includes(search));
  if (filterKategori) rows = rows.filter(s => s.kategori === filterKategori);
  if (filterStatus) rows = rows.filter(s => s.status === filterStatus);
  return rows;
}
function buildStokListPrintHtml() {
  const rows = filteredStokItems();
  const bodyRows = rows.length ? rows.map(s => `
    <tr>
      <td>${escapeHtml(s.nama)}</td>
      <td>${escapeHtml(s.kategori)}</td>
      <td class="c">${escapeHtml(s.satuan)}</td>
      <td class="r">${s.qty}</td>
      <td class="r">${s.stokMinimum || 0}</td>
      <td class="r">${rupiah(s.hargaSatuan)}</td>
      <td class="r">${rupiah(s.nilai)}</td>
      <td class="c">${stokStatusLabel(s.status)}</td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="c">Tidak ada barang</td></tr>`;
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
    <h3 style="text-align:center; margin:6px 0 4px; letter-spacing:.5px;">DAFTAR STOK MATERIAL &amp; ALAT</h3>
    <p class="doc-p" style="text-align:center; margin:0 0 16px;">Untuk kebutuhan stock opname — cocokkan dengan stok fisik di lapangan</p>
    <table class="doc-items">
      <thead><tr><th>Nama Barang</th><th>Kategori</th><th class="c">Satuan</th><th class="r">Qty</th><th class="r">Min.</th><th class="r">Harga Satuan</th><th class="r">Nilai</th><th class="c">Status</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p style="font-size:11px; color:#777; margin-top:10px;">Dicetak ${formatTanggal(new Date().toISOString().slice(0, 10))} — ${rows.length} barang.</p>
  `;
}
document.getElementById("stok_printBtn").addEventListener("click", () => {
  document.getElementById("printArea").innerHTML = buildStokListPrintHtml();
  document.body.classList.add("printing-quote");
  window.print();
});
document.getElementById("stok_exportCsv").addEventListener("click", () => {
  const rows = filteredStokItems();
  const lines = [["Nama Barang", "Kategori", "Satuan", "Qty", "Stok Minimum", "Harga Satuan", "Nilai", "Status"].join(",")];
  rows.forEach(s => {
    lines.push([s.nama, s.kategori, s.satuan, s.qty, s.stokMinimum || 0, s.hargaSatuan, s.nilai, stokStatusLabel(s.status)].map(csvEscape).join(","));
  });
  downloadFile(`stok_${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"), "text/csv");
});
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
      const deleted = state.stok.find(x => x.id === delBtn.dataset.deleteStok);
      state.stok = state.stok.filter(x => x.id !== delBtn.dataset.deleteStok);
      saveState();
      mirrorStokDelete(delBtn.dataset.deleteStok, deleted);
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
  mirrorStokUpsert(item, existing);
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
  const qty = parseFloat((document.getElementById("st_qty").value || "").replace(",", ".")) || 0;
  if (qty < 0) { alert("Qty tidak boleh negatif."); return; }
  const txn = {
    id: id || uid(),
    tipe: document.getElementById("st_tipe").value,
    tanggal: document.getElementById("st_tanggal").value,
    qty,
    pemasokId: document.getElementById("st_pemasokId").value || "",
    hargaSatuan: parseNumberInput(document.getElementById("st_harga").value),
    gudangId: document.getElementById("st_gudangId").value || "",
    keterangan: document.getElementById("st_keterangan").value.trim()
  };
  if (txn.tipe === "Keluar") {
    // Hitung stok tersedia TANPA transaksi ini (kalau sedang edit transaksi
    // lama, efeknya dikeluarkan dulu supaya tidak salah tolak saat cuma
    // ubah keterangan/harga tanpa ubah qty).
    const otherTxns = item.transactions.filter(t => t.id !== txn.id);
    const available = txn.gudangId
      ? otherTxns.filter(t => t.gudangId === txn.gudangId).reduce((s, t) => s + (t.tipe === "Masuk" ? (t.qty || 0) : -(t.qty || 0)), 0)
      : (item.stokAwal || 0) + otherTxns.reduce((s, t) => s + (t.tipe === "Masuk" ? (t.qty || 0) : -(t.qty || 0)), 0);
    if (txn.qty > available) {
      alert(`Qty keluar (${txn.qty}) melebihi stok tersedia${txn.gudangId ? " di gudang ini" : ""} (${available}).`);
      return;
    }
  }
  const idx = item.transactions.findIndex(t => t.id === id);
  if (idx >= 0) item.transactions[idx] = txn; else item.transactions.push(txn);
  saveState();
  mirrorStokUpsert(item);
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
      mirrorStokUpsert(item);
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
    const sebelum = { ...item };
    if (id === "stok_infoHarga") item.hargaSatuan = parseNumberInput(input.value);
    else item.stokMinimum = parseNumberInput(input.value);
    saveState();
    mirrorStokUpsert(item, sebelum);
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
const SUBTAB_PANEL_PREFIX = { ky: "ky_", lk: "lk_", kpi: "kpi_" };
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
  if (pagePrefix === "kpi") renderKpiActiveSubtab();
}

// ----- Daftar Karyawan -----
function renderKaryawanList() {
  const all = state.karyawan;
  const aktif = all.filter(k => k.aktif !== false);
  document.getElementById("ky_totalAktif").textContent = aktif.length;
  document.getElementById("ky_totalUpahHarian").textContent = rupiah(aktif.reduce((s, k) => s + (k.upahHarian || 0), 0));
  // Fase D: Sisa Pinjaman turunan dari slip gaji, yang memang rahasia
  // untuk non-Owner (state.karyawan[].slipGaji kosong untuk mereka) --
  // sembunyikan angkanya sama sekali daripada menampilkan pinjamanAwal
  // mentah yang bisa menyesatkan (seolah itu sisa yang sudah dihitung).
  const canSeePinjaman = currentTeamRole === "owner";
  document.getElementById("ky_totalPinjaman").textContent = canSeePinjaman ? rupiah(all.reduce((s, k) => s + sisaPinjaman(k), 0)) : "-";

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
      <td class="num">${canSeePinjaman ? rupiah(sisaPinjaman(k)) : "-"}</td>
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
      const deleted = state.karyawan.find(x => x.id === delBtn.dataset.deleteKaryawan);
      state.karyawan = state.karyawan.filter(x => x.id !== delBtn.dataset.deleteKaryawan);
      mirrorKaryawanDelete(delBtn.dataset.deleteKaryawan, deleted);
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
  mirrorKaryawanUpsert(k, existing);
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
      mirrorKaryawanUpsert(k);
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
    const jamLembur = Math.max(0, parseFloat((tr.querySelector(".ab-lembur").value || "").replace(",", ".")) || 0);
    if (!k.absensi) k.absensi = [];
    const idx = k.absensi.findIndex(a => a.tanggal === tanggal);
    const rec = { ...(idx >= 0 ? k.absensi[idx] : {}), id: idx >= 0 ? k.absensi[idx].id : uid(), tanggal, hadir, jamLembur };
    if (idx >= 0) k.absensi[idx] = rec; else k.absensi.push(rec);
    mirrorKaryawanUpsert(k);
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
          <button class="icon-btn" data-pdf-slip="${sl.id}" title="Unduh PDF">⬇️</button>
          <button class="icon-btn" data-edit-slip="${sl.id}" title="Perbaiki">✏️</button>
          <button class="icon-btn" data-delete-slip="${sl.id}" title="Hapus">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
// Menyusun ulang sisaSebelum/sisaSesudah tiap slip berurutan sesuai
// tanggal dibuat -- dipanggil setelah slip gaji manapun diedit atau
// dihapus, supaya riwayat pinjaman tetap runtut dan benar (bukan cuma
// slip yang diubah, tapi juga slip-slip sesudahnya yang ikut terpengaruh).
function recomputeSlipGajiChain(k) {
  const slips = (k.slipGaji || []).slice().sort((a, b) => (a.tanggalDibuat || a.mulai || "").localeCompare(b.tanggalDibuat || b.mulai || ""));
  let running = k.pinjamanAwal || 0;
  slips.forEach(sl => {
    sl.sisaSebelum = running;
    sl.sisaSesudah = running - (sl.potonganPinjaman || 0);
    running = sl.sisaSesudah;
  });
}
// Slip gaji adalah sumber utama, transaksi Kas Perusahaan yang tercatat
// otomatis dari slip ini (sumberSlipId) cuma cerminannya -- jadi setelah
// slip diperbaiki, transaksi Kas-nya SELALU disamakan: kalau masih ada,
// jumlahnya diperbarui; kalau sudah kadung dihapus manual dari Kas
// Perusahaan (atau entah kenapa belum pernah tercatat), dibuat ulang.
// "Kalau ada perbaikan di sub, pusat ikut mencatat otomatis."
function syncSlipGajiKasTxn(k, sl) {
  const jumlah = slipGajiBersih(sl);
  const existing = state.kasUsaha.transactions.find(x => x.sumberSlipId === sl.id);
  if (existing) {
    existing.jumlah = jumlah;
    existing.status = expenseApprovalStatus(jumlah);
    existing.keterangan = `Gaji ${k.nama} (${formatTanggal(sl.mulai)} - ${formatTanggal(sl.selesai)})`;
    mirrorKasUsahaUpsert(existing);
  } else {
    const txn = {
      id: uid(),
      sumberSlipId: sl.id,
      tipe: "Keluar",
      status: expenseApprovalStatus(jumlah),
      tanggal: sl.selesai,
      jumlah,
      keterangan: `Gaji ${k.nama} (${formatTanggal(sl.mulai)} - ${formatTanggal(sl.selesai)})`,
      kategori: "Biaya Upah/Tenaga",
      extra: k.nama,
      catatan: "Otomatis dari slip gaji"
    };
    state.kasUsaha.transactions.push(txn);
    mirrorKasUsahaUpsert(txn);
  }
}
const slipGajiEditModal = document.getElementById("slipGajiEditModal");
function openSlipGajiEditModal(sl) {
  document.getElementById("sge_id").value = sl.id;
  document.getElementById("sge_uangMakan").value = formatNumberInput(sl.uangMakan || 0);
  document.getElementById("sge_bon").value = formatNumberInput(sl.bon || 0);
  document.getElementById("sge_potonganPinjaman").value = formatNumberInput(sl.potonganPinjaman || 0);
  slipGajiEditModal.classList.add("open");
}
["sge_uangMakan", "sge_bon", "sge_potonganPinjaman"].forEach(id => attachNumberFormatting(document.getElementById(id)));
document.getElementById("slipGajiEditForm").addEventListener("submit", e => {
  e.preventDefault();
  const k = currentKaryawanForPayroll();
  if (!k) { closeModals(); return; }
  const sl = (k.slipGaji || []).find(s => s.id === document.getElementById("sge_id").value);
  if (!sl) { closeModals(); return; }
  const newUangMakan = parseNumberInput(document.getElementById("sge_uangMakan").value);
  const newBon = parseNumberInput(document.getElementById("sge_bon").value);
  const newPotonganPinjaman = parseNumberInput(document.getElementById("sge_potonganPinjaman").value);
  if (newPotonganPinjaman > (sl.sisaSebelum || 0)) {
    alert(`Potongan pinjaman (${rupiah(newPotonganPinjaman)}) melebihi sisa pinjaman karyawan saat itu (${rupiah(sl.sisaSebelum || 0)}).`);
    return;
  }
  sl.uangMakan = newUangMakan;
  sl.bon = newBon;
  sl.potonganPinjaman = newPotonganPinjaman;
  recomputeSlipGajiChain(k);
  syncSlipGajiKasTxn(k, sl);
  saveState();
  mirrorKaryawanGajiUpsert(k, true);
  renderAll();
  closeModals();
});
document.getElementById("pg_riwayatTable").addEventListener("click", e => {
  const printBtn = e.target.closest("[data-print-slip]");
  const pdfBtn = e.target.closest("[data-pdf-slip]");
  const editBtn = e.target.closest("[data-edit-slip]");
  const delBtn = e.target.closest("[data-delete-slip]");
  const k = currentKaryawanForPayroll();
  if (!k) return;
  if (printBtn) {
    const sl = k.slipGaji.find(s => s.id === printBtn.dataset.printSlip);
    if (sl) printSlipGaji(k, sl);
  } else if (pdfBtn) {
    const sl = k.slipGaji.find(s => s.id === pdfBtn.dataset.pdfSlip);
    if (sl) downloadPdfFromServer(pdfBtn, `slip-gaji/${sl.id}`, `Slip-Gaji-${sl.namaKaryawan}-${sl.mulai}`);
  } else if (editBtn) {
    const sl = k.slipGaji.find(s => s.id === editBtn.dataset.editSlip);
    if (sl) openSlipGajiEditModal(sl);
  } else if (delBtn) {
    if (confirm("Hapus slip gaji ini? Sisa pinjaman akan otomatis dihitung ulang tanpa potongan dari slip ini, dan transaksi Kas Perusahaan yang tercatat otomatis dari slip ini akan ikut terhapus.")) {
      k.slipGaji = k.slipGaji.filter(s => s.id !== delBtn.dataset.deleteSlip);
      state.kasUsaha.transactions = state.kasUsaha.transactions.filter(t => t.sumberSlipId !== delBtn.dataset.deleteSlip);
      recomputeSlipGajiChain(k);
      saveState();
      mirrorKaryawanGajiUpsert(k, true);
      mirrorKasUsahaDeleteBySumberSlip(delBtn.dataset.deleteSlip);
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
  if (slip.potonganPinjaman > slip.sisaSebelum) {
    alert(`Potongan pinjaman (${rupiah(slip.potonganPinjaman)}) melebihi sisa pinjaman karyawan (${rupiah(slip.sisaSebelum)}).`);
    return;
  }
  if (!k.slipGaji) k.slipGaji = [];
  k.slipGaji.push(slip);
  // Total potongan (uang makan/bon/pinjaman) BOLEH melebihi upah kotor
  // (mis. karyawan harian tanpa jam hadir di periode ini tapi tetap ada
  // cicilan pinjaman berjalan) -- keputusan bisnis yang sah, jumlah
  // transaksi Kas-nya dicatat apa adanya (bisa negatif) supaya tetap bisa
  // dilacak/dikoreksi. kasSummary() sendiri yang menjaga supaya nilai
  // negatif ini tidak salah tafsir jadi penambah saldo (lihat catatan di
  // sana), bukan di titik penyimpanan ini.
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
  mirrorKaryawanGajiUpsert(k, true);
  mirrorKasUsahaUpsert(state.kasUsaha.transactions[state.kasUsaha.transactions.length - 1]);
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
  const allWithTotal = state.pemasok.map(pm => ({ ...pm, total: pemasokTotal(pm) }));
  document.getElementById("pm_totalPemasok").textContent = allWithTotal.length;
  document.getElementById("pm_totalNilai").textContent = rupiah(allWithTotal.reduce((s, pm) => s + pm.total, 0));

  const search = (document.getElementById("pm_search").value || "").toLowerCase();
  let rows = allWithTotal.slice().sort((a, b) => a.nama.localeCompare(b.nama));
  if (search) rows = rows.filter(pm => pm.nama.toLowerCase().includes(search));

  const tbody = document.querySelector("#pm_table tbody");
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Belum ada pemasok</td></tr>';
    return;
  }
  rows.forEach(pm => {
    const total = pm.total;
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
  const existing = idx >= 0 ? state.pemasok[idx] : null;
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
  mirrorPemasokUpsert(pm, existing);
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
      const deleted = state.pemasok.find(x => x.id === delBtn.dataset.deletePemasok);
      state.pemasok = state.pemasok.filter(x => x.id !== delBtn.dataset.deletePemasok);
      if (currentPemasokId === delBtn.dataset.deletePemasok) currentPemasokId = null;
      saveState();
      mirrorPemasokDelete(delBtn.dataset.deletePemasok, deleted);
      renderAll();
    }
  }
});
document.getElementById("pmd_backBtn").addEventListener("click", showPemasokList);
document.getElementById("pm_search").addEventListener("input", renderPemasokList);
function buildPemasokListPrintHtml() {
  const search = (document.getElementById("pm_search").value || "").toLowerCase();
  let rows = state.pemasok.map(pm => ({ ...pm, total: pemasokTotal(pm) })).sort((a, b) => a.nama.localeCompare(b.nama));
  if (search) rows = rows.filter(pm => pm.nama.toLowerCase().includes(search));
  const bodyRows = rows.length ? rows.map(pm => `
    <tr>
      <td>${escapeHtml(pm.nama)}</td>
      <td>${escapeHtml(pm.kategori || "-")}</td>
      <td>${escapeHtml(pm.telepon || "-")}</td>
      <td>${escapeHtml(pm.alamat || "-")}</td>
      <td class="r">${rupiah(pm.total)}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="c">Tidak ada pemasok</td></tr>`;
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
    <h3 style="text-align:center; margin:6px 0 16px; letter-spacing:.5px;">DAFTAR PEMASOK</h3>
    <table class="doc-items">
      <thead><tr><th>Nama Pemasok</th><th>Kategori</th><th>Telepon</th><th>Alamat</th><th class="r">Total Pembelian</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p style="font-size:11px; color:#777; margin-top:10px;">Dicetak ${formatTanggal(new Date().toISOString().slice(0, 10))} — ${rows.length} pemasok.</p>
  `;
}
document.getElementById("pm_printBtn").addEventListener("click", () => {
  document.getElementById("printArea").innerHTML = buildPemasokListPrintHtml();
  document.body.classList.add("printing-quote");
  window.print();
});

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
  const total = dpp + ppnValue + (pw.biayaLain || 0);
  return { subtotal, diskonValue, dpp, ppnValue, pphValue, total };
}
const ROMAWI_BULAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
function nextPenawaranNomor() {
  state.penawaranCounter = (state.penawaranCounter || 0) + 1;
  mirrorCompanyProfileUpsert();
  const n = String(state.penawaranCounter).padStart(3, "0");
  const d = new Date();
  return `${n}/MC-PH/${ROMAWI_BULAN[d.getMonth()]}/${d.getFullYear()}`;
}
// Counter terpisah dari Mitra Creative -- supaya nomor surat Mata Resolusi
// tidak kelihatan "berurutan" dengan nomor Mitra Creative (yang bisa
// membocorkan bahwa keduanya satu grup yang sama ke pembaca tender).
function nextMataResolusiPenawaranNomor() {
  state.mataResolusiPenawaranCounter = (state.mataResolusiPenawaranCounter || 0) + 1;
  mirrorCompanyProfileUpsert();
  const n = String(state.mataResolusiPenawaranCounter).padStart(3, "0");
  const d = new Date();
  return `${n}/MR-PH/${ROMAWI_BULAN[d.getMonth()]}/${d.getFullYear()}`;
}
function nextRabNomor() {
  state.rabCounter = (state.rabCounter || 0) + 1;
  mirrorCompanyProfileUpsert();
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
  document.getElementById("ah_totalItem").textContent = state.ahsp.length;
  document.getElementById("ah_totalKategori").textContent = new Set(state.ahsp.map(a => a.kategori)).size;
  document.getElementById("ah_totalResmi").textContent = state.ahsp.filter(a => (a.kode || "").startsWith("PUPR-")).length;
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
document.getElementById("ah_syncUpahBtn").addEventListener("click", syncAllUpahHarga);

// ===== Modal: AHSP item =====
const ahspModal = document.getElementById("ahspModal");
let ahspKomponenRows = [];

function maxUpahHarianMitra() {
  const aktif = state.karyawan.filter(k => k.aktif !== false);
  const list = aktif.length ? aktif : state.karyawan;
  return list.reduce((max, k) => Math.max(max, k.upahHarian || 0), 0);
}
// Sinkronkan SEMUA komponen Upah di seluruh daftar AHSP (bukan cuma satu
// item yang sedang dibuka di modal edit, seperti tombol "Refresh Harga"
// yang sudah ada) ke harga terkini. Komponen yang sudah punya sumber
// (mis. terhubung ke karyawan tertentu, atau ke "Upah Tertinggi Mitra")
// disegarkan ke nilai sumbernya saat ini -- pilihan sumber yang sudah ada
// dihormati, tidak dipaksa jadi maxupah. Komponen Upah lama yang harganya
// masih diketik manual (tanpa sumber sama sekali -- umumnya item bawaan
// SIP-01/ADV-03/dll dari sebelum fitur penautan sumber harga ada) baru
// ditautkan ke "Upah Tertinggi Mitra +20%" sesuai permintaan eksplisit.
// Item mode "manual" (harga borongan gabungan, tanpa rincian Bahan/Upah)
// dilewati -- tidak ada baris Upah tersendiri untuk disinkronkan di sana.
function syncAllUpahHarga() {
  const maxUpah = Math.round(maxUpahHarianMitra() * 1.2);
  if (!maxUpah) {
    alert("Belum ada data upah harian karyawan aktif. Isi upah harian di menu Karyawan & Gaji dulu sebelum menyinkronkan harga upah AHSP.");
    return;
  }
  let itemBerubah = 0;
  let komponenBerubah = 0;
  state.ahsp.forEach(a => {
    if (a.mode !== "detail" || !Array.isArray(a.komponen)) return;
    const hargaLama = ahspHarga(a);
    let changed = false;
    a.komponen.forEach(k => {
      if (k.jenis !== "Upah") return;
      let hargaBaru;
      if (k.sumberTipe && k.sumberId) {
        const src = sumberHargaLookup(k.sumberTipe, k.sumberId);
        if (!src) return;
        hargaBaru = src.harga;
      } else {
        hargaBaru = maxUpah;
        k.sumberTipe = "maxupah";
        k.sumberId = "auto";
      }
      if (k.harga !== hargaBaru) {
        k.harga = hargaBaru;
        changed = true;
        komponenBerubah++;
      }
    });
    if (changed) {
      itemBerubah++;
      // Sama seperti simpan manual lewat modal edit AHSP -- catat ke
      // Riwayat Harga supaya audit trail tetap lengkap walau harga diubah
      // lewat sinkronisasi massal, bukan cuma edit satu-satu.
      const hargaBaruTotal = ahspHarga(a);
      if (hargaBaruTotal !== hargaLama) {
        if (!a.riwayatHarga) a.riwayatHarga = [];
        a.riwayatHarga.push({ id: uid(), tanggal: new Date().toISOString().slice(0, 10), hargaLama, hargaBaru: hargaBaruTotal });
      }
      mirrorAhspUpsert(a);
    }
  });
  if (itemBerubah) {
    saveState();
    renderAhsp();
  }
  alert(itemBerubah
    ? `${komponenBerubah} komponen Upah di ${itemBerubah} item AHSP disinkronkan.\nUpah tanpa sumber tertentu memakai "Upah Tertinggi Mitra +20%" = ${rupiah(maxUpah)}/OH.\n\nCatatan: item mode "Manual" (harga borongan gabungan, mis. Neon Box/Baliho bawaan) tidak punya rincian Upah tersendiri, jadi dilewati -- cek & sesuaikan manual kalau perlu.`
    : "Semua komponen Upah yang punya rincian sudah sesuai dengan sumber harga terkini -- tidak ada yang perlu diubah.");
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
  row.koefisien = Math.max(0, parseFloat(tr.querySelector(".komp-koef").value.replace(",", ".")) || 0);
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
  mirrorAhspUpsert(item, existing);
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
      const deleted = state.ahsp.find(x => x.id === delBtn.dataset.deleteAhsp);
      state.ahsp = state.ahsp.filter(x => x.id !== delBtn.dataset.deleteAhsp);
      mirrorAhspDelete(delBtn.dataset.deleteAhsp, deleted);
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
  const negatifCount = toImport.filter(r => (r.harga || 0) < 0).length;
  if (negatifCount) {
    alert(`${negatifCount} baris punya Harga negatif -- perbaiki dulu (kemungkinan kolom di file Excel tergeser/salah baca) sebelum impor.`);
    return;
  }
  // Kode yang sama dengan item AHSP yang sudah ada dilewati (bukan
  // diimpor sebagai item baru/duplikat) -- kalau memang mau memperbarui
  // harga item lama, edit langsung item itu, bukan lewat impor massal.
  const existingKode = new Set(state.ahsp.map(a => a.kode).filter(Boolean));
  const dupKode = [];
  let imported = 0;
  toImport.forEach(r => {
    if (r.kode && existingKode.has(r.kode)) { dupKode.push(r.kode); return; }
    const item = {
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
    };
    state.ahsp.push(item);
    mirrorAhspUpsert(item, null);
    if (r.kode) existingKode.add(r.kode);
    imported++;
  });
  saveState();
  renderAll();
  closeModals();
  alert(`${imported} item AHSP berhasil diimpor.` + (dupKode.length ? `\n${dupKode.length} baris dilewati karena kode sudah dipakai item AHSP lain: ${dupKode.join(", ")}.` : ""));
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
// Gabungan template riset pasar (AHSP_TEMPLATES, data.js, selalu tersedia) +
// dataset resmi AHSP Bidang Cipta Karya (AHSP_TEMPLATES_RESMI, ~1.940 item,
// ~1.7MB). File data_ahsp_resmi.js SENGAJA tidak dimuat lewat <script> tag
// di index.html -- terlalu besar untuk dimuat di setiap buka aplikasi,
// padahal cuma dipakai saat modal Template Standar dibuka. Dimuat dinamis
// oleh loadAhspResmiDataset() saat benar-benar dibutuhkan.
let ALL_AHSP_TEMPLATES = AHSP_TEMPLATES.slice();
let ahspResmiLoadPromise = null;
function loadAhspResmiDataset() {
  if (typeof AHSP_TEMPLATES_RESMI !== "undefined") return Promise.resolve();
  if (ahspResmiLoadPromise) return ahspResmiLoadPromise;
  ahspResmiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "data_ahsp_resmi.js";
    script.onload = () => {
      ALL_AHSP_TEMPLATES = AHSP_TEMPLATES.concat(typeof AHSP_TEMPLATES_RESMI !== "undefined" ? AHSP_TEMPLATES_RESMI : []);
      resolve();
    };
    script.onerror = () => { ahspResmiLoadPromise = null; reject(new Error("Gagal memuat dataset AHSP resmi")); };
    document.head.appendChild(script);
  });
  return ahspResmiLoadPromise;
}
const ahspTemplateModal = document.getElementById("ahspTemplateModal");
// Kategori yang sedang dibuka pengguna saat menjelajah tanpa kata kunci
// pencarian (modal tidak me-render ~1.940 item sekaligus di awal -- terlalu
// berat & tidak berguna -- hanya ringkasan kategori sampai diklik atau dicari).
let ahtplExpandedKategori = new Set();
const AHTPL_SEARCH_LIMIT = 300;

function renderAhTemplateGroup(items, sudahAda) {
  return `
    <div class="checklist" style="flex-direction:column; align-items:stretch; max-height:none;">
      ${items.map(tpl => {
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
  `;
}

function renderAhTemplateList(query) {
  query = (query || "").trim().toLowerCase();
  const sudahAda = new Set(state.ahsp.map(a => a.kode).filter(Boolean));
  const byKategori = {};
  ALL_AHSP_TEMPLATES.forEach(tpl => {
    if (!byKategori[tpl.kategori]) byKategori[tpl.kategori] = [];
    byKategori[tpl.kategori].push(tpl);
  });
  const kategoriNames = Object.keys(byKategori).sort();

  if (query.length >= 2) {
    let matched = ALL_AHSP_TEMPLATES.filter(tpl =>
      tpl.uraian.toLowerCase().includes(query) ||
      tpl.kode.toLowerCase().includes(query) ||
      tpl.kategori.toLowerCase().includes(query)
    );
    const totalMatch = matched.length;
    const truncated = totalMatch > AHTPL_SEARCH_LIMIT;
    if (truncated) matched = matched.slice(0, AHTPL_SEARCH_LIMIT);
    const byKategoriMatch = {};
    matched.forEach(tpl => {
      if (!byKategoriMatch[tpl.kategori]) byKategoriMatch[tpl.kategori] = [];
      byKategoriMatch[tpl.kategori].push(tpl);
    });
    const html = Object.keys(byKategoriMatch).sort().map(kategori => `
      <div style="margin-bottom:14px;">
        <div class="muted" style="font-weight:600; margin-bottom:6px;">${escapeHtml(kategori)}</div>
        ${renderAhTemplateGroup(byKategoriMatch[kategori], sudahAda)}
      </div>
    `).join("");
    const notice = truncated
      ? `<p class="muted" style="font-size:12px;">Menampilkan ${AHTPL_SEARCH_LIMIT} dari ${totalMatch} hasil — persempit kata kunci pencarian untuk melihat sisanya.</p>`
      : `<p class="muted" style="font-size:12px;">${totalMatch} hasil ditemukan.</p>`;
    document.getElementById("ahtpl_list").innerHTML = notice + (html || '<p class="muted">Tidak ada template yang cocok.</p>');
    return;
  }

  const html = kategoriNames.map(kategori => {
    const items = byKategori[kategori];
    const expanded = ahtplExpandedKategori.has(kategori);
    return `
      <div style="margin-bottom:10px;">
        <div class="ahtpl-kategori-toggle muted" data-kategori="${escapeHtml(kategori)}" style="font-weight:600; margin-bottom:6px; cursor:pointer; display:flex; align-items:center; gap:6px;">
          <span>${expanded ? "▾" : "▸"}</span>
          <span>${escapeHtml(kategori)}</span>
          <span style="font-weight:400;">(${items.length} item)</span>
        </div>
        ${expanded ? renderAhTemplateGroup(items, sudahAda) : ""}
      </div>
    `;
  }).join("");
  document.getElementById("ahtpl_list").innerHTML = html || '<p class="muted">Tidak ada template tersedia.</p>';
  document.querySelectorAll(".ahtpl-kategori-toggle").forEach(el => {
    el.addEventListener("click", () => {
      const kategori = el.dataset.kategori;
      if (ahtplExpandedKategori.has(kategori)) ahtplExpandedKategori.delete(kategori);
      else ahtplExpandedKategori.add(kategori);
      renderAhTemplateList(document.getElementById("ahtpl_search").value);
    });
  });
}
document.getElementById("ah_templateBtn").addEventListener("click", async () => {
  ahtplExpandedKategori = new Set();
  document.getElementById("ahtpl_search").value = "";
  ahspTemplateModal.classList.add("open");
  const alreadyLoaded = typeof AHSP_TEMPLATES_RESMI !== "undefined";
  if (!alreadyLoaded) document.getElementById("ahtpl_list").innerHTML = '<p class="muted">Memuat dataset AHSP resmi...</p>';
  try {
    await loadAhspResmiDataset();
  } catch (err) {
    alert("Gagal memuat dataset AHSP resmi (cek koneksi internet). Template riset pasar tetap bisa dipakai.");
  }
  renderAhTemplateList();
});
document.getElementById("ahtpl_search").addEventListener("input", (e) => {
  renderAhTemplateList(e.target.value);
});
document.getElementById("ahtpl_confirmBtn").addEventListener("click", () => {
  const checked = Array.from(document.querySelectorAll(".ahtpl-check:checked")).map(el => el.value);
  if (!checked.length) { alert("Pilih minimal satu item template untuk ditambahkan."); return; }
  let added = 0;
  checked.forEach(kode => {
    const tpl = ALL_AHSP_TEMPLATES.find(t => t.kode === kode);
    if (!tpl || state.ahsp.some(a => a.kode === tpl.kode)) return;
    const item = {
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
    };
    state.ahsp.push(item);
    mirrorAhspUpsert(item, null);
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
  // Pengelompokan section (kelompok) cuma dipakai di RAB -- Penawaran tetap
  // daftar flat seperti sebelumnya, jadi field ini disembunyikan untuk itu.
  const kelompokField = document.getElementById("it_kelompokField");
  if (ctx.kind === "rab") {
    kelompokField.style.display = "";
    document.getElementById("it_kelompok").value = existing ? (existing.kelompok || "") : "";
  } else {
    kelompokField.style.display = "none";
    document.getElementById("it_kelompok").value = "";
  }
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
  const volume = parseFloat((document.getElementById("it_volume").value || "").replace(",", ".")) || 0;
  if (volume < 0) { alert("Volume tidak boleh negatif."); return; }
  const item = {
    id: itemModalCtx.itemId || uid(),
    uraian: document.getElementById("it_uraian").value.trim(),
    satuan: document.getElementById("it_satuan").value.trim(),
    volume,
    hargaSatuan: parseNumberInput(document.getElementById("it_harga").value),
    ahspId: itemModalCtx.ahspId || ""
  };
  if (itemModalCtx.kind === "rab") item.kelompok = document.getElementById("it_kelompok").value.trim();
  const idx = doc.items.findIndex(x => x.id === item.id);
  if (idx >= 0) doc.items[idx] = item; else doc.items.push(item);
  saveState();
  if (itemModalCtx.kind === "rab") { mirrorRabUpsert(doc, false); renderRabEditor(); } else { mirrorPenawaranUpsert(doc, false); renderPwEditor(); }
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

// Pencarian deterministik (substring, bukan skor fuzzy) dipakai khusus oleh
// wizard Estimasi Dimensi di bawah -- dicoba dulu terhadap kalimat kunci
// yang SUDAH diverifikasi manual cocok ke wording resmi AHSP Kepmen PU
// (lihat matchHints tiap sub-item). Ditulis terpisah dari findBestAhspMatch
// (skor overlap token, dipakai BOQ import) karena untuk kalimat pendek
// seperti "Bekisting sloof" skor overlap-nya sering jatuh di bawah ambang
// 0.34 walau pasangannya sebenarnya jelas benar -- dan sebaliknya bisa
// salah pasang ke item yang mirip tapi beda (mis. "titik saklar" sempat
// ke-match ke "Instalasi Lampu"). Item yang TIDAK dikasih matchHints
// (misalnya beton sloof/kolom/balok -- mutu/gradenya harus pilihan
// pengguna sendiri) sengaja dibiarkan tidak ter-link otomatis sama sekali,
// supaya tidak diam-diam menebak harga yang bisa jauh salah.
function matchAhspByHint(mustIncludeAll) {
  if (!mustIncludeAll || !mustIncludeAll.length) return null;
  const needles = mustIncludeAll.map(s => s.toLowerCase());
  return state.ahsp.find(a => {
    const u = (a.uraian || "").toLowerCase();
    return needles.every(n => u.includes(n));
  }) || null;
}

// ===== Estimasi Cepat dari Dimensi (RAB) =====
// Kalkulator volume otomatis per jenis pekerjaan rumah, dari input dimensi
// bangunan. Rumus geometri konstruksi standar (trapesium pondasi, volume
// balok/kolom persegi, dst) yang ditulis sendiri berdasarkan pengetahuan
// umum estimasi bangunan -- BUKAN hasil salin dari software pihak ketiga
// manapun. Hasilnya estimasi awal, bukan angka final untuk pengajuan resmi.
function round3(n) { return Math.round((n || 0) * 1000) / 1000; }
const ESTIMASI_KATEGORI = [
  { id: "pondasi", label: "Pondasi Batu Kali", kelompok: "II. Pekerjaan Pondasi",
    fields: [
      { key: "panjang", label: "Panjang total pondasi", unit: "m", default: 20 },
      { key: "lebarAtas", label: "Lebar atas pondasi", unit: "m", default: 0.3 },
      { key: "lebarBawah", label: "Lebar bawah pondasi", unit: "m", default: 0.6 },
      { key: "tinggiPasangan", label: "Tinggi pasangan batu", unit: "m", default: 0.6 },
      { key: "tebalUrugPasir", label: "Tebal urugan pasir", unit: "m", default: 0.05 },
      { key: "kedalamanGalian", label: "Kedalaman galian", unit: "m", default: 0.7 }
    ],
    compute(v) {
      const lebarGalian = v.lebarBawah + 0.3; // ruang kerja tambahan kiri-kanan
      return [
        { uraian: "Galian tanah pondasi", satuan: "m3", volume: round3(v.panjang * lebarGalian * v.kedalamanGalian), matchHints: ["penggalian", "tanah biasa", "sedalam 0 s.d. 1 m", "manual"] },
        { uraian: "Urugan pasir bawah pondasi", satuan: "m3", volume: round3(v.panjang * v.lebarBawah * v.tebalUrugPasir), matchHints: ["urukan pasir uruk", "tanpa pemadatan", "manual"] },
        { uraian: "Pasangan pondasi batu kali", satuan: "m3", volume: round3(v.panjang * ((v.lebarAtas + v.lebarBawah) / 2) * v.tinggiPasangan), matchHints: ["pondasi batu belah", "manual"] }
      ];
    }
  },
  { id: "sloof", label: "Sloof Beton", kelompok: "III. Pekerjaan Struktur Beton",
    fields: [
      { key: "panjang", label: "Panjang total sloof", unit: "m", default: 20 },
      { key: "lebar", label: "Lebar sloof", unit: "m", default: 0.15 },
      { key: "tinggi", label: "Tinggi sloof", unit: "m", default: 0.2 },
      { key: "koefBesi", label: "Koefisien besi beton", unit: "kg/m3", default: 110 }
    ],
    compute(v) {
      const volBeton = round3(v.panjang * v.lebar * v.tinggi);
      return [
        { uraian: "Beton sloof", satuan: "m3", volume: volBeton }, // mutu/grade beton harus pilihan sendiri, sengaja tidak di-auto-link
        { uraian: "Bekisting sloof", satuan: "m2", volume: round3(2 * (v.lebar + v.tinggi) * v.panjang), matchHints: ["bekisting untuk sloof"] },
        { uraian: "Pembesian sloof", satuan: "kg", volume: round3(volBeton * v.koefBesi), matchHints: ["penulangan kolom, balok, ring balok, dan sloof"] }
      ];
    }
  },
  { id: "kolom", label: "Kolom Beton", kelompok: "III. Pekerjaan Struktur Beton",
    fields: [
      { key: "jumlah", label: "Jumlah kolom", unit: "buah", default: 10 },
      { key: "lebar", label: "Lebar penampang kolom", unit: "m", default: 0.15 },
      { key: "tebal", label: "Tebal penampang kolom", unit: "m", default: 0.15 },
      { key: "tinggi", label: "Tinggi kolom", unit: "m", default: 3.5 },
      { key: "koefBesi", label: "Koefisien besi beton", unit: "kg/m3", default: 150 }
    ],
    compute(v) {
      const volBeton = round3(v.jumlah * v.lebar * v.tebal * v.tinggi);
      return [
        { uraian: "Beton kolom", satuan: "m3", volume: volBeton },
        { uraian: "Bekisting kolom", satuan: "m2", volume: round3(v.jumlah * 2 * (v.lebar + v.tebal) * v.tinggi), matchHints: ["bekisting untuk kolom"] },
        { uraian: "Pembesian kolom", satuan: "kg", volume: round3(volBeton * v.koefBesi), matchHints: ["penulangan kolom, balok, ring balok, dan sloof"] }
      ];
    }
  },
  { id: "balok", label: "Balok Beton", kelompok: "III. Pekerjaan Struktur Beton",
    fields: [
      { key: "panjang", label: "Panjang total balok", unit: "m", default: 20 },
      { key: "lebar", label: "Lebar balok", unit: "m", default: 0.15 },
      { key: "tinggi", label: "Tinggi balok", unit: "m", default: 0.25 },
      { key: "koefBesi", label: "Koefisien besi beton", unit: "kg/m3", default: 130 }
    ],
    compute(v) {
      const volBeton = round3(v.panjang * v.lebar * v.tinggi);
      return [
        { uraian: "Beton balok", satuan: "m3", volume: volBeton },
        { uraian: "Bekisting balok", satuan: "m2", volume: round3((2 * v.tinggi + v.lebar) * v.panjang), matchHints: ["bekisting untuk balok"] },
        { uraian: "Pembesian balok", satuan: "kg", volume: round3(volBeton * v.koefBesi), matchHints: ["penulangan kolom, balok, ring balok, dan sloof"] }
      ];
    }
  },
  { id: "pelat", label: "Pelat Beton (Lantai/Dak)", kelompok: "III. Pekerjaan Struktur Beton",
    fields: [
      { key: "panjang", label: "Panjang pelat", unit: "m", default: 8 },
      { key: "lebar", label: "Lebar pelat", unit: "m", default: 6 },
      { key: "tebal", label: "Tebal pelat", unit: "m", default: 0.12 },
      { key: "koefBesi", label: "Koefisien besi beton", unit: "kg/m3", default: 100 }
    ],
    compute(v) {
      const volBeton = round3(v.panjang * v.lebar * v.tebal);
      return [
        { uraian: "Beton pelat lantai/dak", satuan: "m3", volume: volBeton },
        { uraian: "Bekisting pelat", satuan: "m2", volume: round3(v.panjang * v.lebar) }, // tidak ada item resmi "bekisting pelat" cor-di-tempat di dataset
        { uraian: "Pembesian pelat", satuan: "kg", volume: round3(volBeton * v.koefBesi), matchHints: ["penulangan slab", "manual"] }
      ];
    }
  },
  { id: "dinding", label: "Dinding (Pasangan Bata/Batako)", kelompok: "IV. Pekerjaan Dinding",
    fields: [
      { key: "panjang", label: "Panjang total dinding", unit: "m", default: 40 },
      { key: "tinggi", label: "Tinggi dinding", unit: "m", default: 3 },
      { key: "luasBukaan", label: "Luas bukaan pintu/jendela (dikurangi)", unit: "m2", default: 8 },
      { key: "sisiPlester", label: "Jumlah sisi diplester", unit: "sisi", default: 2 }
    ],
    compute(v) {
      const luasDinding = Math.max(0, round3(v.panjang * v.tinggi - v.luasBukaan));
      return [
        // Default dicocokkan ke dinding 1/2 bata (paling umum untuk rumah tinggal) -- kalau proyek pakai 1 bata penuh, koreksi manual setelah ditambahkan.
        { uraian: "Pasangan dinding bata/batako", satuan: "m2", volume: luasDinding, matchHints: ["dinding bata merah tebal 1/2 batu"] },
        { uraian: "Plesteran dinding", satuan: "m2", volume: round3(luasDinding * v.sisiPlester), matchHints: ["plesteran 1sp : 3pp tebal 15 mm"] },
        { uraian: "Acian dinding", satuan: "m2", volume: round3(luasDinding * v.sisiPlester), matchHints: ["pemasangan 1 m2 acian"] }
      ];
    }
  },
  { id: "atap", label: "Atap", kelompok: "V. Pekerjaan Atap",
    fields: [
      { key: "luasDenah", label: "Luas denah/proyeksi atap", unit: "m2", default: 80 },
      { key: "sudut", label: "Sudut kemiringan atap", unit: "derajat", default: 30 }
    ],
    compute(v) {
      const luasEfektif = round3(v.luasDenah / Math.cos(v.sudut * Math.PI / 180));
      return [
        { uraian: "Penutup atap", satuan: "m2", volume: luasEfektif }, // jenis penutup (genteng/spandek/dst) terlalu bervariasi harganya, sengaja tidak ditebak
        { uraian: "Rangka atap (kuda-kuda, reng, usuk)", satuan: "m2", volume: luasEfektif, matchHints: ["rangka atap genteng beton, kayu kelas ii"] }
      ];
    }
  },
  { id: "keramik", label: "Keramik Lantai", kelompok: "VI. Pekerjaan Lantai & Dinding Finishing",
    fields: [
      { key: "panjang", label: "Panjang ruang", unit: "m", default: 8 },
      { key: "lebar", label: "Lebar ruang", unit: "m", default: 6 },
      { key: "dikurangi", label: "Luas dikurangi (kolom, dst)", unit: "m2", default: 0 }
    ],
    compute(v) {
      return [
        { uraian: "Pemasangan keramik lantai", satuan: "m2", volume: Math.max(0, round3(v.panjang * v.lebar - v.dikurangi)), matchHints: ["lantai keramik uk. 40x40 cm"] }
      ];
    }
  },
  { id: "plafon", label: "Plafon", kelompok: "VII. Pekerjaan Plafon",
    fields: [
      { key: "panjang", label: "Panjang ruang", unit: "m", default: 8 },
      { key: "lebar", label: "Lebar ruang", unit: "m", default: 6 }
    ],
    compute(v) {
      return [
        { uraian: "Pemasangan plafon", satuan: "m2", volume: round3(v.panjang * v.lebar), matchHints: ["plafon papan gypsum tebal 9 mm"] }
      ];
    }
  },
  { id: "elektrikal", label: "Elektrikal", kelompok: "VIII. Pekerjaan Elektrikal",
    fields: [
      { key: "titikLampu", label: "Jumlah titik lampu", unit: "titik", default: 10 },
      { key: "titikStopKontak", label: "Jumlah titik stop kontak", unit: "titik", default: 8 },
      { key: "titikSaklar", label: "Jumlah titik saklar", unit: "titik", default: 6 },
      { key: "titikPanel", label: "Jumlah panel/MCB", unit: "unit", default: 1 }
    ],
    compute(v) {
      return [
        { uraian: "Instalasi titik lampu", satuan: "titik", volume: v.titikLampu, matchHints: ["titik instalasi lampu"] },
        { uraian: "Instalasi titik stop kontak", satuan: "titik", volume: v.titikStopKontak, matchHints: ["titik instalasi stop kontak"] },
        { uraian: "Instalasi titik saklar", satuan: "titik", volume: v.titikSaklar, matchHints: ["saklar tunggal"] },
        { uraian: "Pemasangan panel/MCB", satuan: "unit", volume: v.titikPanel, matchHints: ["mcb box"] }
      ];
    }
  },
  { id: "air_bersih", label: "Instalasi Air Bersih", kelompok: "IX. Pekerjaan Plumbing & Sanitasi",
    fields: [
      { key: "panjangPipa", label: "Panjang pipa distribusi", unit: "m", default: 30 },
      { key: "titikAir", label: "Jumlah titik kran/closet/wastafel", unit: "titik", default: 6 }
    ],
    compute(v) {
      return [
        // Default dicocokkan ke pipa PVC AW dia. 1/2" -- kalau jalur utama pakai diameter lain, koreksi manual.
        { uraian: "Pemasangan pipa air bersih", satuan: "m", volume: v.panjangPipa, matchHints: ["pipa pvc aw, dia. 1/2\""] },
        { uraian: "Instalasi titik air (kran/closet/wastafel)", satuan: "titik", volume: v.titikAir } // gabungan 3 jenis fixture beda harga, sengaja tidak ditebak
      ];
    }
  },
  { id: "septic_tank", label: "Septic Tank", kelompok: "IX. Pekerjaan Plumbing & Sanitasi",
    fields: [
      { key: "panjang", label: "Panjang septic tank", unit: "m", default: 1.5 },
      { key: "lebar", label: "Lebar septic tank", unit: "m", default: 1.2 },
      { key: "kedalaman", label: "Kedalaman septic tank", unit: "m", default: 1.5 },
      { key: "tebalTutup", label: "Tebal plat tutup beton", unit: "m", default: 0.1 }
    ],
    compute(v) {
      return [
        { uraian: "Galian septic tank", satuan: "m3", volume: round3(v.panjang * v.lebar * v.kedalaman), matchHints: ["penggalian", "tanah biasa", "sedalam 0 s.d. 1 m", "manual"] },
        { uraian: "Pasangan dinding bata septic tank", satuan: "m2", volume: round3(2 * (v.panjang + v.lebar) * v.kedalaman), matchHints: ["dinding bata merah tebal 1 batu campuran"] },
        { uraian: "Beton plat tutup septic tank", satuan: "m3", volume: round3(v.panjang * v.lebar * v.tebalTutup) } // mutu beton harus pilihan sendiri
      ];
    }
  },
  { id: "tangga", label: "Tangga", kelompok: "III. Pekerjaan Struktur Beton",
    fields: [
      { key: "jumlahAnak", label: "Jumlah anak tangga", unit: "buah", default: 15 },
      { key: "lebarTangga", label: "Lebar tangga", unit: "m", default: 1.0 },
      { key: "optrede", label: "Tinggi anak tangga (optrede)", unit: "m", default: 0.18 },
      { key: "antrede", label: "Lebar anak tangga (antrede)", unit: "m", default: 0.28 }
    ],
    compute(v) {
      // Volume per anak tangga didekati sebagai penampang segitiga siku
      // (optrede x antrede / 2) x lebar tangga -- pendekatan kasar yang umum
      // dipakai untuk estimasi awal beton tangga.
      const volBeton = round3(v.jumlahAnak * 0.5 * v.optrede * v.antrede * v.lebarTangga);
      return [
        { uraian: "Beton tangga", satuan: "m3", volume: volBeton }
      ];
    }
  }
];

const estimasiModal = document.getElementById("estimasiModal");
let estimasiPreviewItems = [];
function renderEstimasiFields() {
  const kat = ESTIMASI_KATEGORI.find(k => k.id === document.getElementById("est_kategori").value);
  const wrap = document.getElementById("est_fields");
  if (!kat) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = kat.fields.map(f => `
    <div class="field">
      <label>${escapeHtml(f.label)} (${escapeHtml(f.unit)})</label>
      <input type="text" inputmode="decimal" class="est-field-input" data-key="${escapeHtml(f.key)}" value="${f.default}">
    </div>
  `).join("");
  document.getElementById("est_previewWrap").style.display = "none";
  document.getElementById("est_tambahkanBtn").disabled = true;
  estimasiPreviewItems = [];
}
document.getElementById("rab_estimasiBtn").addEventListener("click", () => {
  const sel = document.getElementById("est_kategori");
  if (!sel.options.length) sel.innerHTML = ESTIMASI_KATEGORI.map(k => `<option value="${k.id}">${escapeHtml(k.label)}</option>`).join("");
  sel.value = ESTIMASI_KATEGORI[0].id;
  renderEstimasiFields();
  estimasiModal.classList.add("open");
});
document.getElementById("est_kategori").addEventListener("change", renderEstimasiFields);
document.getElementById("est_hitungBtn").addEventListener("click", () => {
  const kat = ESTIMASI_KATEGORI.find(k => k.id === document.getElementById("est_kategori").value);
  if (!kat) return;
  const v = {};
  document.querySelectorAll(".est-field-input").forEach(inp => {
    v[inp.dataset.key] = parseFloat((inp.value || "").replace(",", ".")) || 0;
  });
  const results = kat.compute(v).filter(r => r.volume > 0);
  estimasiPreviewItems = results.map(r => {
    const match = r.matchHints ? matchAhspByHint(r.matchHints) : null;
    return { ...r, ahspId: match ? match.id : "", hargaSatuan: match ? ahspHarga(match) : 0, kelompok: kat.kelompok };
  });
  const tbody = document.querySelector("#est_previewTable tbody");
  tbody.innerHTML = estimasiPreviewItems.length
    ? estimasiPreviewItems.map(it => `
        <tr>
          <td>${escapeHtml(it.uraian)}</td>
          <td>${escapeHtml(it.satuan)}</td>
          <td class="num">${it.volume}</td>
          <td class="num">${it.ahspId ? rupiah(it.hargaSatuan) : '<span class="muted">belum ada di AHSP</span>'}</td>
        </tr>
      `).join("")
    : '<tr class="empty-row"><td colspan="4">Semua volume hasil hitungan 0 — cek kembali dimensi yang diisi.</td></tr>';
  document.getElementById("est_previewWrap").style.display = "";
  document.getElementById("est_tambahkanBtn").disabled = estimasiPreviewItems.length === 0;
});
document.getElementById("est_tambahkanBtn").addEventListener("click", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (!rab || !estimasiPreviewItems.length) return;
  estimasiPreviewItems.forEach(it => {
    rab.items.push({
      id: uid(),
      uraian: it.uraian,
      satuan: it.satuan,
      volume: it.volume,
      hargaSatuan: it.hargaSatuan,
      ahspId: it.ahspId,
      kelompok: it.kelompok
    });
  });
  saveState();
  mirrorRabUpsert(rab, false);
  renderRabEditor();
  const belumAda = estimasiPreviewItems.filter(it => !it.ahspId).length;
  alert(`${estimasiPreviewItems.length} item ditambahkan ke RAB.` + (belumAda ? ` ${belumAda} di antaranya belum terhubung ke AHSP (harga Rp0) — isi manual di tabel RAB atau impor dulu template AHSP yang cocok.` : ""));
  renderEstimasiFields();
});

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
      <td>${escapeHtml(r.nomor || "-")}${r.revisiDariId ? ` <span class="muted" style="font-size:11px;">(Revisi ${r.revisiKe || 1})</span>` : ""}</td>
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
  if (currentRabId) flushAndDiscardSnapshot("rab", currentRabId);
  currentRabId = null;
  document.getElementById("rab_listView").style.display = "block";
  document.getElementById("rab_editorView").style.display = "none";
  renderRabList();
}
function showRabEditor(id) {
  currentRabId = id;
  const rab = state.proyekRab.find(r => r.id === id);
  openEditSnapshot("rab", id, rab);
  document.getElementById("rab_listView").style.display = "none";
  document.getElementById("rab_editorView").style.display = "block";
  renderRabEditor();
}
function renderRabEditor() {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (!rab) { showRabList(); return; }
  const kategoriSel = document.getElementById("rab_kategori");
  if (kategoriSel.options.length === 0) kategoriSel.innerHTML = KATEGORI_PEKERJAAN.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("");

  const rabRevisiNote = document.getElementById("rab_revisiNote");
  const rabAsal = rab.revisiDariId ? state.proyekRab.find(r => r.id === rab.revisiDariId) : null;
  if (rabAsal) {
    rabRevisiNote.style.display = "block";
    rabRevisiNote.innerHTML = `🔁 Revisi ke-${rab.revisiKe || 1} dari <a href="#" data-open-rab-asal="${rabAsal.id}">${escapeHtml(rabAsal.nomor)}</a>`;
  } else {
    rabRevisiNote.style.display = "none";
    rabRevisiNote.innerHTML = "";
  }

  if (document.activeElement.id !== "rab_nomor") document.getElementById("rab_nomor").value = rab.nomor || "";
  if (document.activeElement.id !== "rab_nama") document.getElementById("rab_nama").value = rab.nama || "";
  if (document.activeElement.id !== "rab_klien") document.getElementById("rab_klien").value = rab.klien || "";
  const rabKlienSel = document.getElementById("rab_klienId");
  rabKlienSel.innerHTML = '<option value="">Tidak dikaitkan</option>' + state.klien.map(k => `<option value="${k.id}">${escapeHtml(k.nama)}</option>`).join("");
  rabKlienSel.value = rab.klienId || "";
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
    tbody.innerHTML = groupItemsByKelompok(rab.items).map(group => {
      const header = group.kelompok ? `
        <tr class="kelompok-row">
          <td colspan="4"><strong>${escapeHtml(group.kelompok)}</strong></td>
          <td class="num"><strong>${rupiah(group.subtotal)}</strong></td>
          <td></td>
        </tr>
      ` : "";
      const rows = group.items.map(it => {
        const jumlah = (it.volume || 0) * (it.hargaSatuan || 0);
        return `
          <tr>
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
          </tr>
        `;
      }).join("");
      return header + rows;
    }).join("");
  }
  refreshRabTotals();
}
// Mengelompokkan item RAB berdasarkan field kelompok (section) -- item tanpa
// kelompok (kosong) ditampilkan tanpa header, di awal, sesuai urutan aslinya.
function groupItemsByKelompok(items) {
  const groups = [];
  const byKey = {};
  items.forEach(it => {
    const key = it.kelompok || "";
    if (!byKey[key]) {
      byKey[key] = { kelompok: key, items: [], subtotal: 0 };
      groups.push(byKey[key]);
    }
    byKey[key].items.push(it);
    byKey[key].subtotal += (it.volume || 0) * (it.hargaSatuan || 0);
  });
  return groups;
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
  let rowNum = 0;
  const itemsRows = groupItemsByKelompok(rab.items).map(group => {
    const header = group.kelompok ? `
      <tr><td colspan="5" style="background:#f3f3f3;"><strong>${escapeHtml(group.kelompok)}</strong></td><td class="r" style="background:#f3f3f3;"><strong>${rupiah(group.subtotal)}</strong></td></tr>
    ` : "";
    const rows = group.items.map(it => {
      rowNum++;
      return `
        <tr>
          <td class="c">${rowNum}</td>
          <td>${escapeHtml(it.uraian)}</td>
          <td class="c">${escapeHtml(it.satuan)}</td>
          <td class="r">${it.volume}</td>
          <td class="r">${rupiah(it.hargaSatuan)}</td>
          <td class="r">${rupiah((it.volume || 0) * (it.hargaSatuan || 0))}</td>
        </tr>
      `;
    }).join("");
    return header + rows;
  }).join("") || `<tr><td colspan="6" class="c">Belum ada item</td></tr>`;

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
document.getElementById("rab_pdfBtn").addEventListener("click", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (!rab) return;
  downloadPdfFromServer(document.getElementById("rab_pdfBtn"), `rab/${rab.id}`, `RAB-${rab.nomor || rab.id}`);
});
document.getElementById("rab_addBtn").addEventListener("click", () => {
  const rab = { id: uid(), nomor: nextRabNomor(), nama: "", klien: "", klienId: "", lokasi: "", kategori: KATEGORI_PEKERJAAN[0], tanggal: new Date().toISOString().slice(0, 10), ppn: 0, pph: 0.5, biayaLain: 0, items: [] };
  state.proyekRab.push(rab);
  saveState();
  mirrorRabUpsert(rab, true);
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
      mirrorRabDelete(delBtn.dataset.deleteRab, rab);
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
    mirrorRabUpsert(rab, false);
  });
});
document.getElementById("rab_klienId").addEventListener("change", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.klienId = document.getElementById("rab_klienId").value || ""; saveState(); mirrorRabUpsert(rab, false); }
});
document.getElementById("rab_kategori").addEventListener("change", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.kategori = document.getElementById("rab_kategori").value; saveState(); mirrorRabUpsert(rab, false); }
});
document.getElementById("rab_tanggal").addEventListener("change", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.tanggal = document.getElementById("rab_tanggal").value; saveState(); mirrorRabUpsert(rab, false); }
});
document.getElementById("rab_ppn").addEventListener("input", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.ppn = clampPercent(parseFloat(document.getElementById("rab_ppn").value) || 0); saveState(); mirrorRabUpsert(rab, false); refreshRabTotals(); }
});
document.getElementById("rab_pph").addEventListener("input", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.pph = clampPercent(parseFloat(document.getElementById("rab_pph").value) || 0); saveState(); mirrorRabUpsert(rab, false); refreshRabTotals(); }
});
attachNumberFormatting(document.getElementById("rab_biayaLain"));
document.getElementById("rab_biayaLain").addEventListener("input", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) { rab.biayaLain = parseNumberInput(document.getElementById("rab_biayaLain").value); saveState(); mirrorRabUpsert(rab, false); refreshRabTotals(); }
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
      mirrorRabUpsert(rab, false);
      renderRabEditor();
    }
  }
});
function createPenawaranFromRab(rab) {
  return {
    id: uid(), nomor: nextPenawaranNomor(), tanggal: new Date().toISOString().slice(0, 10),
    kepada: rab.klien || "", alamatKlien: "", perihal: rab.nama || "", kategori: rab.kategori || KATEGORI_PEKERJAAN[0],
    status: "draft", diskon: 0, ppn: rab.ppn || 0, pph: typeof rab.pph === "number" ? rab.pph : 0.5,
    biayaLain: rab.biayaLain || 0,
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
  mirrorPenawaranUpsert(pw, true);
  showPage("penawaran");
  showPwEditor(pw.id);
});
document.getElementById("rab_toProyekBtn").addEventListener("click", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (rab) offerCreateProyekFromDoc("rab", rab);
});
document.getElementById("rab_duplicateBtn").addEventListener("click", () => {
  const rab = state.proyekRab.find(r => r.id === currentRabId);
  if (!rab) return;
  if (!confirm(`Buat revisi baru dari RAB "${rab.nomor}"? Item dan data lain akan disalin — RAB asli tidak berubah.`)) return;
  const revisi = {
    ...rab,
    id: uid(),
    nomor: nextRabNomor(),
    tanggal: new Date().toISOString().slice(0, 10),
    proyekId: "",
    revisiDariId: rab.id,
    revisiKe: (rab.revisiKe || 0) + 1,
    items: rab.items.map(it => ({ ...it, id: uid() }))
  };
  state.proyekRab.push(revisi);
  saveState();
  mirrorRabUpsert(revisi, true);
  showRabEditor(revisi.id);
});
document.getElementById("rab_revisiNote").addEventListener("click", e => {
  const link = e.target.closest("[data-open-rab-asal]");
  if (link) { e.preventDefault(); showRabEditor(link.dataset.openRabAsal); }
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
    klienId: doc.klienId || "",
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
  if (kind === "rab") mirrorRabUpsert(doc, false); else mirrorPenawaranUpsert(doc, false);
  mirrorProyekUpsert(proj, null);
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
  const filterBrand = document.getElementById("pw_filterBrand").value;
  const tbody = document.querySelector("#pw_table tbody");
  tbody.innerHTML = "";
  let rows = state.penawaran.slice().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  if (search) rows = rows.filter(p => (p.nomor || "").toLowerCase().includes(search) || (p.kepada || "").toLowerCase().includes(search) || (p.perihal || "").toLowerCase().includes(search));
  if (filterStatus) rows = rows.filter(p => p.status === filterStatus);
  if (filterBrand) rows = rows.filter(p => (p.brand || "mitra") === filterBrand);
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Belum ada penawaran</td></tr>';
    return;
  }
  rows.forEach(p => {
    const { total } = penawaranTotals(p);
    const kadaluarsa = pwIsKadaluarsa(p, today);
    const isMr = p.brand === "mataresolusi";
    const tr = document.createElement("tr");
    if (kadaluarsa) tr.classList.add("pw-row-kadaluarsa");
    tr.innerHTML = `
      <td>${isMr ? '<span class="badge brand-mataresolusi" title="Mata Resolusi (Pembanding)">MR</span> ' : ""}${escapeHtml(p.nomor)}${p.revisiDariId ? ` <span class="muted" style="font-size:11px;">(Revisi ${p.revisiKe || 1})</span>` : ""}</td>
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
  if (currentPwId) flushAndDiscardSnapshot("penawaran", currentPwId);
  currentPwId = null;
  document.getElementById("pw_listView").style.display = "block";
  document.getElementById("pw_editorView").style.display = "none";
  renderPwList();
}
function showPwEditor(id) {
  currentPwId = id;
  const pw = state.penawaran.find(p => p.id === id);
  openEditSnapshot("penawaran", id, pw);
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
  const sumberPembanding = pw.sourcePenawaranId ? state.penawaran.find(p => p.id === pw.sourcePenawaranId) : null;
  if (asal) {
    revisiNote.style.display = "block";
    revisiNote.innerHTML = `🔁 Revisi ke-${pw.revisiKe || 1} dari <a href="#" data-open-pw-asal="${asal.id}">${escapeHtml(asal.nomor)}</a>`;
  } else if (sumberPembanding) {
    revisiNote.style.display = "block";
    revisiNote.innerHTML = `⚖️ Pembanding (Mata Resolusi${pw.markupPercent != null ? `, +${pw.markupPercent}%` : ""}) dari <a href="#" data-open-pw-asal="${sumberPembanding.id}">${escapeHtml(sumberPembanding.nomor)}</a>`;
  } else {
    revisiNote.style.display = "none";
    revisiNote.innerHTML = "";
  }
  document.getElementById("pw_pembandingBtn").style.display = pw.brand === "mataresolusi" ? "none" : "";
  document.getElementById("pw_editorView").querySelector("h1").textContent = pw.brand === "mataresolusi" ? "Edit Penawaran (Mata Resolusi)" : "Edit Penawaran";

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
  const pwBiayaLainInput = document.getElementById("pw_biayaLain");
  if (document.activeElement !== pwBiayaLainInput) pwBiayaLainInput.value = formatNumberInput(pw.biayaLain || 0);
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
  const brand = document.getElementById("pw_addBrandSel").value === "mataresolusi" ? "mataresolusi" : "mitra";
  const isMr = brand === "mataresolusi";
  const pw = {
    id: uid(), nomor: isMr ? nextMataResolusiPenawaranNomor() : nextPenawaranNomor(), tanggal: new Date().toISOString().slice(0, 10),
    kepada: "", alamatKlien: "", perihal: "", kategori: KATEGORI_PEKERJAAN[0], status: "draft",
    diskon: 0, ppn: 11, pph: 0.5, biayaLain: 0, items: [], syarat: defaultSyarat(), penutup: defaultPenutup(),
    brand,
    ttdNama: isMr ? MATA_RESOLUSI_INFO.ownerNama : state.ownerNama,
    ttdJabatan: isMr ? MATA_RESOLUSI_INFO.ownerJabatan : state.ownerJabatan
  };
  state.penawaran.push(pw);
  saveState();
  mirrorPenawaranUpsert(pw, true);
  showPwEditor(pw.id);
});
document.getElementById("pw_backBtn").addEventListener("click", showPwList);
document.getElementById("pw_search").addEventListener("input", renderPwList);
document.getElementById("pw_filterStatus").addEventListener("change", renderPwList);
document.getElementById("pw_filterBrand").addEventListener("change", renderPwList);
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
      mirrorPenawaranDelete(delBtn.dataset.deletePw, pw);
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
    mirrorPenawaranUpsert(pw, false);
  });
});
document.getElementById("pw_klienId").addEventListener("change", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.klienId = document.getElementById("pw_klienId").value || ""; saveState(); mirrorPenawaranUpsert(pw, false); }
});
document.getElementById("pw_tanggal").addEventListener("change", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.tanggal = document.getElementById("pw_tanggal").value; saveState(); mirrorPenawaranUpsert(pw, false); }
});
document.getElementById("pw_kategori").addEventListener("change", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.kategori = document.getElementById("pw_kategori").value; saveState(); mirrorPenawaranUpsert(pw, false); }
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
          const klienSebelum = { ...klien };
          klien.tahap = "Deal/SPK";
          if (!klien.riwayatKontak) klien.riwayatKontak = [];
          klien.riwayatKontak.push({ id: uid(), tanggal: new Date().toISOString().slice(0, 10), catatan: `Penawaran ${pw.nomor} disetujui — tahap otomatis diubah ke Deal/SPK` });
          mirrorKlienUpsert(klien, klienSebelum);
        }
        if (needProyek) {
          const { proj } = createProyekFromDoc("pw", pw);
          saveState();
          mirrorPenawaranUpsert(pw, false);
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
  mirrorPenawaranUpsert(pw, false);
  renderAll();
});
document.getElementById("pw_diskon").addEventListener("input", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.diskon = clampPercent(parseFloat(document.getElementById("pw_diskon").value) || 0); saveState(); mirrorPenawaranUpsert(pw, false); refreshPwTotals(); }
});
document.getElementById("pw_ppn").addEventListener("input", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.ppn = clampPercent(parseFloat(document.getElementById("pw_ppn").value) || 0); saveState(); mirrorPenawaranUpsert(pw, false); refreshPwTotals(); }
});
document.getElementById("pw_pph").addEventListener("input", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.pph = clampPercent(parseFloat(document.getElementById("pw_pph").value) || 0); saveState(); mirrorPenawaranUpsert(pw, false); refreshPwTotals(); }
});
attachNumberFormatting(document.getElementById("pw_biayaLain"));
document.getElementById("pw_biayaLain").addEventListener("input", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (pw) { pw.biayaLain = parseNumberInput(document.getElementById("pw_biayaLain").value); saveState(); mirrorPenawaranUpsert(pw, false); refreshPwTotals(); }
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
  mirrorPenawaranUpsert(pw, false);
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
      mirrorPenawaranUpsert(pw, false);
      renderPwEditor();
    }
  }
});

// ===== Cetak Penawaran (letterhead print) =====
function buildPenawaranPrintHtml(pw) {
  if (pw.brand === "mataresolusi") return buildMataResolusiPenawaranHtml(pw);
  const { subtotal, diskonValue, ppnValue, pphValue, total } = penawaranTotals(pw);
  const profil = { company: state.company, alamat: state.alamat || COMPANY_ADDRESS, telepon: state.telepon || COMPANY_PHONE, ownerNama: state.ownerNama, ownerJabatan: state.ownerJabatan };
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

  const todayIso = new Date().toISOString().slice(0, 10);
  let statusText, statusCls;
  if (pw.status === "disetujui") { statusText = "DISETUJUI"; statusCls = "ok"; }
  else if (pw.status === "ditolak") { statusText = "DITOLAK"; statusCls = "bad"; }
  else {
    const daysLeft = 14 - daysBetweenIso(pw.tanggal, todayIso);
    statusText = daysLeft < 0 ? "KADALUARSA" : `BERLAKU ${daysLeft} HARI LAGI`;
    statusCls = daysLeft < 0 ? "bad" : "ok";
  }

  const syaratCards = (pw.syarat || "").split("\n").filter(l => l.trim()).map((line, i) => {
    const m = line.match(/^\s*(\d+)[.)]\s*(.*)$/);
    const num = (m ? m[1] : String(i + 1)).padStart(2, "0");
    const text = m ? m[2] : line;
    return `<div class="pwmc-syarat-card"><span class="pwmc-syarat-num">${num}</span><span class="pwmc-syarat-text">${escapeHtml(text)}</span></div>`;
  }).join("");

  const showTtdImg = (pw.ttdNama || profil.ownerNama) === OWNER_TTD_NAMA;

  return `
    <div class="pwmc-doc">
      <div class="pwmc-header">
        <img class="pwmc-logo" src="${MITRA_LOGO_DATA_URI}" alt="logo">
        <div>
          <div class="pwmc-company">${escapeHtml(profil.company || "CV. Mitra Creative")}</div>
          <div class="pwmc-tagline">CONTRACTOR SIPIL &bull; ADVERTISING &bull; KONTRUKSI &bull; PENGADAAN BARANG DAN JASA</div>
          <div class="pwmc-address">${escapeHtml(profil.alamat)} &bull; ${escapeHtml(profil.telepon)}</div>
        </div>
      </div>
      <div class="pwmc-goldrule"></div>

      <div class="pwmc-title">SURAT PENAWARAN HARGA</div>
      <div class="pwmc-subtitle">${escapeHtml(pw.perihal || "Penawaran Harga")}</div>

      <div class="pwmc-meta-grid">
        <div class="pwmc-meta-cell"><div class="pwmc-meta-label">Nomor</div><div class="pwmc-meta-value">${escapeHtml(pw.nomor)}</div></div>
        <div class="pwmc-meta-cell"><div class="pwmc-meta-label">Tanggal</div><div class="pwmc-meta-value">${formatTanggal(pw.tanggal)}</div></div>
        <div class="pwmc-meta-cell"><div class="pwmc-meta-label">Lampiran</div><div class="pwmc-meta-value">1 (satu) berkas</div></div>
        <div class="pwmc-meta-cell"><div class="pwmc-meta-label">Perihal</div><div class="pwmc-meta-value">${escapeHtml(pw.perihal || "Penawaran Harga")}</div></div>
      </div>

      <div class="pwmc-kepada-label">KEPADA YTH.</div>
      <div class="pwmc-kepada-grid">
        <div class="pwmc-kepada-box">
          <div class="pwmc-kepada-nama">${escapeHtml(pw.kepada || "-")}</div>
          <div class="pwmc-kepada-alamat">${escapeHtml(pw.alamatKlien || "")}</div>
        </div>
        <div class="pwmc-status-box">
          <div class="pwmc-status-label">Status Penawaran</div>
          <div class="pwmc-status-value ${statusCls}">${statusText}</div>
        </div>
      </div>

      <p class="pwmc-p">Dengan hormat,<br>
      Bersama ini kami sampaikan penawaran harga untuk pekerjaan <strong>${escapeHtml(pw.perihal || "-")}</strong> dengan rincian sebagai berikut:</p>

      <div class="pwmc-section-label">Rincian Lingkup Pekerjaan</div>
      <table class="pwmc-table">
        <thead><tr><th>No</th><th>Uraian Pekerjaan</th><th class="c">Satuan</th><th class="r">Volume</th><th class="r">Harga Satuan</th><th class="r">Jumlah</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <table class="pwmc-summary">
        <tr><td>Subtotal</td><td class="r">${rupiah(subtotal)}</td></tr>
        ${pw.diskon ? `<tr><td>Diskon (${pw.diskon}%)</td><td class="r">- ${rupiah(diskonValue)}</td></tr>` : ""}
        ${pw.ppn ? `<tr><td>PPN (${pw.ppn}%)</td><td class="r">${rupiah(ppnValue)}</td></tr>` : ""}
        ${pw.biayaLain ? `<tr><td>Biaya Lain-lain</td><td class="r">${rupiah(pw.biayaLain)}</td></tr>` : ""}
        <tr class="pwmc-total-row"><td>Total Penawaran</td><td class="r">${rupiah(total)}</td></tr>
      </table>
      ${pw.pph ? `<p class="pwmc-p" style="font-size:11px; color:#777;">*Sudah termasuk PPh Final (${pw.pph}%) sebesar ${rupiah(pphValue)} sesuai Syarat &amp; Ketentuan di bawah.</p>` : ""}

      <div class="pwmc-syarat-label">Syarat &amp; Ketentuan</div>
      <div class="pwmc-syarat-grid">${syaratCards}</div>

      <p class="pwmc-p">${escapeHtml(pw.penutup || "")}</p>

      <div class="pwmc-signature">
        Hormat kami,<br>
        <strong>${escapeHtml(profil.company || "CV. Mitra Creative")}</strong>
        ${showTtdImg ? `<img class="ttd-img" src="${OWNER_TTD_DATA_URI}" alt="tanda tangan">` : `<div class="sign-space"></div>`}
        <strong>${escapeHtml(pw.ttdNama || profil.ownerNama)}</strong><br>
        ${escapeHtml(pw.ttdJabatan || profil.ownerJabatan)}
      </div>
    </div>
  `;
}
// Template Mata Resolusi -- SENGAJA bukan reskin warna dari template Mitra
// Creative di atas, tapi tata letak yang benar-benar beda: banner logo
// asli, garis pelangi 4 warna, kotak judul hitam "PENAWARAN HARGA
// PEKERJAAN / QUOTATION", grid meta 2x2 (Kepada/Tanggal/Pekerjaan/Lokasi),
// tabel item berkepala gelap. Meniru PERSIS dokumen penawaran Mata
// Resolusi sungguhan yang sudah pernah dipakai Owner (bukan cuma "gaya
// mirip"), supaya hasil aplikasi identik dengan yang biasa mereka kirim
// manual. Dipakai juga oleh server/lib/print.js (duplikasi persis, karena
// kode server tidak bisa import dari sini -- lihat catatan di sana).
function buildMataResolusiPenawaranHtml(pw) {
  const { subtotal, diskonValue, ppnValue, pphValue, total } = penawaranTotals(pw);
  const profil = MATA_RESOLUSI_INFO;
  const itemsRows = pw.items.map((it, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${escapeHtml(it.uraian)}<div class="mr-item-sub">${it.volume} ${escapeHtml(it.satuan)} &times; ${rupiah(it.hargaSatuan)}</div></td>
      <td class="r">${rupiah((it.volume || 0) * (it.hargaSatuan || 0))}</td>
    </tr>
  `).join("") || `<tr><td colspan="3" class="c">Belum ada item</td></tr>`;
  const showTtdImg = (pw.ttdNama || profil.ownerNama) === MATA_RESOLUSI_INFO.ownerNama;

  return `
    <div class="mr-doc">
      <img class="mr-banner" src="${MATA_RESOLUSI_BANNER_DATA_URI}" alt="mata.resolusi">
      <div class="mr-stripe">
        <span style="background:#D7263D;"></span><span style="background:#F3B61F;"></span>
        <span style="background:#15A9A1;"></span><span style="background:#5B3FD3;"></span>
      </div>

      <div class="mr-title-bar">
        <div class="mr-title-main">PENAWARAN HARGA PEKERJAAN</div>
        <div class="mr-title-sub">QUOTATION</div>
      </div>

      <div class="mr-meta-grid">
        <div class="mr-meta-cell">
          <div class="mr-meta-label">Kepada</div>
          <div class="mr-meta-value">${escapeHtml(pw.kepada || "-")}</div>
        </div>
        <div class="mr-meta-cell">
          <div class="mr-meta-label">Tanggal</div>
          <div class="mr-meta-value">Semarang, ${formatTanggal(pw.tanggal)}</div>
        </div>
        <div class="mr-meta-cell">
          <div class="mr-meta-label">Pekerjaan</div>
          <div class="mr-meta-value">${escapeHtml(pw.perihal || "-")}</div>
        </div>
        <div class="mr-meta-cell">
          <div class="mr-meta-label">Lokasi</div>
          <div class="mr-meta-value">${escapeHtml(pw.alamatKlien || "-")}</div>
        </div>
      </div>

      <p class="mr-p">Dengan hormat,<br>
      Bersama ini kami sampaikan penawaran harga untuk pekerjaan <strong>${escapeHtml(pw.perihal || "-")}</strong> di ${escapeHtml(pw.kepada || "-")}, dengan rincian sebagai berikut:</p>

      <div class="mr-section-label">RINCIAN PEKERJAAN &amp; SPESIFIKASI</div>
      <table class="mr-table">
        <thead><tr><th class="c">No.</th><th>Uraian Pekerjaan / Spesifikasi</th><th class="r">Nilai</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <table class="mr-summary">
        ${pw.diskon ? `<tr><td>Diskon (${pw.diskon}%)</td><td class="r">- ${rupiah(diskonValue)}</td></tr>` : ""}
        ${pw.ppn ? `<tr><td>PPN (${pw.ppn}%)</td><td class="r">${rupiah(ppnValue)}</td></tr>` : ""}
        ${pw.biayaLain ? `<tr><td>Biaya Lain-lain</td><td class="r">${rupiah(pw.biayaLain)}</td></tr>` : ""}
        <tr class="mr-total-row"><td>TOTAL HARGA PEKERJAAN</td><td class="r">${rupiah(total)}</td></tr>
      </table>

      <div class="mr-catatan">
        <strong>CATATAN:</strong> Harga di atas belum termasuk PPN${pw.pph ? "" : " dan PPh"}.
        ${pw.pph ? `<br>*Sudah termasuk PPh Final (${pw.pph}%) sebesar ${rupiah(pphValue)} sesuai Syarat &amp; Ketentuan di bawah.` : ""}
      </div>

      ${pw.syarat ? `
      <div class="mr-syarat">
        <strong>Syarat &amp; Ketentuan:</strong>
        <div class="mr-syarat-text">${pw.syarat.split("\n").map(l => `<div>${escapeHtml(l)}</div>`).join("")}</div>
      </div>
      ` : ""}

      <p class="mr-p mr-closing">${escapeHtml(pw.penutup || "Demikian surat penawaran harga ini kami sampaikan. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.")}</p>

      <div class="mr-signature">
        Hormat kami,
        ${showTtdImg ? `<img class="ttd-img" src="${MATA_RESOLUSI_TTD_DATA_URI}" alt="tanda tangan">` : `<div class="sign-space"></div>`}
        <strong>${escapeHtml(pw.ttdNama || profil.ownerNama)}</strong><br>
        ${escapeHtml(pw.ttdJabatan || profil.ownerJabatan)}<br>
        ${escapeHtml(profil.telepon)}
      </div>
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
// Dipakai bersama oleh semua tombol "Unduh PDF" (Penawaran/RAB/Slip Gaji,
// dst.) -- btn: elemen tombolnya sendiri (buat status "Membuat PDF..."),
// path: bagian setelah /api/pdf/ (mis. "penawaran/<id>"), filename: nama
// file .pdf yang didownload (tanpa ekstensi).
async function downloadPdfFromServer(btn, path, filename) {
  if (!sb || !currentSyncUser) {
    alert("Unduh PDF butuh login cloud (Pengaturan > Sinkronisasi Cloud) supaya server bisa mengambil data ini dengan aman.");
    return;
  }
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Membuat PDF...";
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Sesi login sudah habis, silakan login ulang.");
    const res = await fetch(`${PDF_SERVER_URL}/api/pdf/${path}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server membalas status ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename.replace(/[\\/]/g, "-")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Gagal membuat PDF: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}
document.getElementById("pw_pdfBtn").addEventListener("click", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (!pw) return;
  downloadPdfFromServer(document.getElementById("pw_pdfBtn"), `penawaran/${pw.id}`, `Penawaran-${pw.nomor || pw.id}`);
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
    nomor: pw.brand === "mataresolusi" ? nextMataResolusiPenawaranNomor() : nextPenawaranNomor(),
    tanggal: new Date().toISOString().slice(0, 10),
    status: "draft",
    proyekId: "",
    revisiDariId: pw.id,
    revisiKe: (pw.revisiKe || 0) + 1,
    items: pw.items.map(it => ({ ...it, id: uid() }))
  };
  state.penawaran.push(revisi);
  saveState();
  mirrorPenawaranUpsert(revisi, true);
  showPwEditor(revisi.id);
});
// "Pembanding" = salinan Penawaran Mitra Creative atas nama Mata Resolusi,
// dengan harga tiap item dinaikkan sekian persen (markup) supaya Mitra
// Creative terlihat lebih kompetitif di tender. Beda dari "Duplikat
// sebagai Revisi" -- ini bukan revisi dokumen yang sama, tapi dokumen
// brand lain yang berdiri sendiri (sourcePenawaranId, bukan revisiDariId).
document.getElementById("pw_pembandingBtn").addEventListener("click", () => {
  const pw = state.penawaran.find(p => p.id === currentPwId);
  if (!pw || pw.brand === "mataresolusi") return;
  const defaultMarkup = state.mataResolusiMarkupPercent ?? 5;
  const input = prompt(`Buat penawaran pembanding atas nama Mata Resolusi dari "${pw.nomor}". Berapa persen markup harga di atas Mitra Creative?`, String(defaultMarkup));
  if (input === null) return;
  const markup = parseFloat(input.replace(",", "."));
  if (!isFinite(markup) || markup < 0) { alert("Persen markup tidak valid."); return; }
  const factor = 1 + markup / 100;
  const pembanding = {
    ...pw,
    id: uid(),
    nomor: nextMataResolusiPenawaranNomor(),
    tanggal: new Date().toISOString().slice(0, 10),
    status: "draft",
    proyekId: "",
    revisiDariId: "",
    revisiKe: 0,
    brand: "mataresolusi",
    markupPercent: markup,
    sourcePenawaranId: pw.id,
    ttdNama: MATA_RESOLUSI_INFO.ownerNama,
    ttdJabatan: MATA_RESOLUSI_INFO.ownerJabatan,
    items: pw.items.map(it => ({ ...it, id: uid(), hargaSatuan: Math.round((it.hargaSatuan || 0) * factor) }))
  };
  state.penawaran.push(pembanding);
  saveState();
  mirrorPenawaranUpsert(pembanding, true);
  showPwEditor(pembanding.id);
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
  renderKpiActiveSubtab();
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
  const mrMarkupInput = document.getElementById("settingsMataResolusiMarkup");
  if (document.activeElement !== mrMarkupInput) mrMarkupInput.value = state.mataResolusiMarkupPercent ?? 5;
  const targetOmzetInput = document.getElementById("settingsTargetOmzet");
  if (document.activeElement !== targetOmzetInput) targetOmzetInput.value = formatNumberInput(state.targetOmzetBulanan || 0);
  const targetLabaInput = document.getElementById("settingsTargetLaba");
  if (document.activeElement !== targetLabaInput) targetLabaInput.value = formatNumberInput(state.targetLababersihBulanan || 0);
  document.title = `${state.company || "Laporan Keuangan"} — Laporan Keuangan`;
}

// ===== Peran & akses tim (Owner / Admin / Marketing) =====
// null = akses penuh ke semua halaman. Kalau login sebagai anggota tim,
// hanya halaman yang terdaftar di sini yang boleh diakses.
const ROLE_PAGE_ACCESS = {
  owner: null,
  admin: ["dashboard", "klien", "kasUsaha", "laporan", "kpi", "proyek", "karyawan", "stok", "pemasok", "ahsp", "rab", "penawaran", "pengaturan"],
  marketing: ["klien", "ahsp", "rab", "penawaran", "pengaturan"]
};
function canAccessPage(name) {
  const allowed = ROLE_PAGE_ACCESS[currentTeamRole];
  return !allowed || allowed.includes(name);
}
function applyRoleAccess() {
  document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
    btn.style.display = canAccessPage(btn.dataset.page) ? "" : "none";
  });
  const hideAngkaSensitif = currentTeamRole !== "owner";
  document.querySelectorAll("#ku_saldoAwal, #ku_saldoAkhir, #dashSaldoPribadi").forEach(el => {
    const card = el.closest(".stat-card");
    if (card) card.style.display = hideAngkaSensitif ? "none" : "";
  });
  const penggajianTab = document.querySelector('[data-subtab="penggajian"][data-subtab-page="ky"]');
  if (penggajianTab) {
    penggajianTab.style.display = currentTeamRole === "owner" ? "" : "none";
    if (currentTeamRole !== "owner" && penggajianTab.classList.contains("active")) showSubtab("ky", "daftar");
  }
  ["settingsApprovalPanel", "settingsDataPanel"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = currentTeamRole === "owner" ? "" : "none";
  });
  const activePage = document.querySelector(".page.active");
  const activeName = activePage ? activePage.id.replace("page-", "") : null;
  if (activeName && !canAccessPage(activeName)) {
    showPage(canAccessPage("klien") ? "klien" : "dashboard");
  }
}

// ===== Navigation =====
function showPage(name) {
  if (!canAccessPage(name)) return;
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  document.getElementById(`page-${name}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === name));
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarBackdrop").classList.remove("open");
  location.hash = name;
}
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    showPage(btn.dataset.page);
    if (btn.dataset.page === "aktivitas") renderActivityLog(true);
  });
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
  refreshTxnStatusOptions();
  const desiredStatus = existing ? (existing.status || "lunas") : "lunas";
  const statusSel = document.getElementById("txn_status");
  if ([...statusSel.options].some(o => o.value === desiredStatus)) statusSel.value = desiredStatus;
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

// Opsi status dibatasi sesuai Tipe supaya kombinasi yang tidak masuk akal
// tidak pernah bisa dipilih -- "Piutang/Pending (belum cair)" cuma relevan
// untuk transaksi Masuk (uang belum diterima), dan "Menunggu Persetujuan"
// cuma relevan untuk transaksi Keluar (pengeluaran besar perlu approval
// Owner). Tanpa ini, kasSummary() bisa salah tafsir kombinasi yang tidak
// wajar (mis. Keluar+Pending tetap langsung mengurangi saldo walau
// labelnya bilang "belum cair").
function refreshTxnStatusOptions() {
  const tipe = document.getElementById("txn_tipe").value;
  const statusSel = document.getElementById("txn_status");
  const current = statusSel.value;
  const options = tipe === "Keluar"
    ? [["lunas", "Lunas / Dibayar"], ["menunggu_persetujuan", "Menunggu Persetujuan (Keluar besar)"]]
    : [["lunas", "Lunas / Diterima"], ["pending", "Piutang / Pending (belum cair)"]];
  statusSel.innerHTML = options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  statusSel.value = options.some(([v]) => v === current) ? current : "lunas";
}
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
document.getElementById("txn_tipe").addEventListener("change", refreshTxnStatusOptions);
document.getElementById("txn_tipe").addEventListener("change", maybeSuggestApprovalStatus);
attachNumberFormatting(document.getElementById("txn_jumlah"));

document.getElementById("txnForm").addEventListener("submit", e => {
  e.preventDefault();
  const jumlah = parseNumberInput(document.getElementById("txn_jumlah").value);
  if (jumlah <= 0) { alert("Jumlah harus lebih dari 0."); return; }
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
    jumlah,
    keterangan: document.getElementById("txn_keterangan").value.trim(),
    kategori: document.getElementById("txn_kategori").value.trim(),
    extra: document.getElementById("txn_extra").value.trim(),
    catatan: document.getElementById("txn_catatan").value.trim()
  };
  if (book === "kasUsaha") txn.proyekId = document.getElementById("txn_proyekId").value || "";
  const idx = arr.findIndex(t => t.id === id);
  if (idx >= 0) arr[idx] = txn; else arr.push(txn);
  saveState();
  mirrorKasTxnUpsert(book, txn, existing);
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
        const deleted = state[book].transactions.find(x => x.id === delBtn.dataset.delete);
        state[book].transactions = state[book].transactions.filter(x => x.id !== delBtn.dataset.delete);
        saveState();
        mirrorKasTxnDelete(book, delBtn.dataset.delete, deleted);
        renderAll();
      }
    } else if (approveBtn) {
      const book = approveBtn.dataset.book;
      const t = state[book].transactions.find(x => x.id === approveBtn.dataset.approve);
      if (t && confirm(`Setujui pengeluaran ${rupiah(t.jumlah)} ini? Saldo Kas Perusahaan akan langsung berkurang.`)) {
        const sebelum = { ...t };
        t.status = "lunas";
        saveState();
        mirrorKasTxnUpsert(book, t, sebelum);
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
document.getElementById("pr_search").addEventListener("input", renderProyekList);
document.getElementById("pr_filterStatus").addEventListener("change", renderProyekList);
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
  mirrorProyekUpsert(proj, existing);
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
      const deleted = state.proyek.find(x => x.id === delBtn.dataset.deleteProyek);
      state.proyek = state.proyek.filter(x => x.id !== delBtn.dataset.deleteProyek);
      mirrorProyekDelete(delBtn.dataset.deleteProyek, deleted);
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
  const terminTxn = {
    id: uid(),
    proyekId: p.id,
    tipe: "Masuk",
    status: document.getElementById("tm_status").value,
    tanggal, jumlah, keterangan,
    kategori: "Pendapatan Jasa",
    extra: p.nama,
    catatan: "Termin dicatat dari Margin Proyek"
  };
  state.kasUsaha.transactions.push(terminTxn);
  saveState();
  mirrorKasUsahaUpsert(terminTxn);
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
    mirrorKasUsahaDelete(delBtn.dataset.deleteTermin);
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
  const bmQty = parseFloat((document.getElementById("bm_qty").value || "").replace(",", ".")) || 0;
  if (bmQty < 0) { alert("Qty tidak boleh negatif."); return; }
  const id = document.getElementById("bm_id").value;
  const item = {
    id: id || uid(),
    nama: document.getElementById("bm_nama").value.trim(),
    qty: bmQty,
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
  mirrorProyekUpsert(p);
  state.stok.forEach(s => mirrorStokUpsert(s));
  mirrorSyncBelanjaMaterialKas(item);
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
      mirrorProyekUpsert(p);
      state.stok.forEach(s => mirrorStokUpsert(s));
      mirrorKasUsahaDeleteBySumberBelanja(bid);
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
  mirrorProyekUpsert(p);
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
  const subkonBayarTxn = {
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
  };
  state.kasUsaha.transactions.push(subkonBayarTxn);
  saveState();
  mirrorKasUsahaUpsert(subkonBayarTxn);
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
      mirrorProyekUpsert(p);
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
  mirrorProyekUpsert(p);
  document.getElementById("pfr_tanggal").value = "";
  document.getElementById("pfr_persen").value = "";
  document.getElementById("pfr_keterangan").value = "";
  renderProyekDetail();
});
document.getElementById("pf_rencanaTable").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-rencana]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (delBtn && p && confirm("Hapus target progress ini?")) {
    p.progressRencana = (p.progressRencana || []).filter(r => r.id !== delBtn.dataset.deleteRencana);
    saveState();
    mirrorProyekUpsert(p);
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
  mirrorProyekUpsert(p);
  document.getElementById("pfa_tanggal").value = "";
  document.getElementById("pfa_persen").value = "";
  document.getElementById("pfa_catatan").value = "";
  renderProyekDetail();
});
document.getElementById("pf_realisasiTable").addEventListener("click", e => {
  const delBtn = e.target.closest("[data-delete-realisasi]");
  const p = state.proyek.find(x => x.id === currentProyekId);
  if (delBtn && p && confirm("Hapus laporan realisasi progress ini?")) {
    p.progressRealisasi = (p.progressRealisasi || []).filter(r => r.id !== delBtn.dataset.deleteRealisasi);
    saveState();
    mirrorProyekUpsert(p);
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
  mirrorProyekUpsert(p);
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
      mirrorProyekUpsert(p);
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
    const nilai = parseNumberInput(input.value);
    state[book].saldoAwal = nilai;
    saveState();
    mirrorSaldoAwalUpsert(book, nilai);
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

// ===== Cetak Kas Perusahaan / Kas Pribadi =====
function buildKasPrintHtml(book) {
  const cfg = bookConfig[book];
  const p = cfg.prefix;
  const sum = kasSummary(book);
  const search = (document.getElementById(`${p}_search`)?.value || "").toLowerCase();
  const filterTipe = document.getElementById(`${p}_filterTipe`)?.value || "";
  const filterStatus = document.getElementById(`${p}_filterStatus`)?.value || "";
  let rows = state[book].transactions.slice().sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));
  if (search) rows = rows.filter(t => (t.keterangan || "").toLowerCase().includes(search) || (t.extra || "").toLowerCase().includes(search) || (t.kategori || "").toLowerCase().includes(search));
  if (filterTipe) rows = rows.filter(t => t.tipe === filterTipe);
  if (filterStatus) rows = rows.filter(t => (t.status || "lunas") === filterStatus);

  const statusLabel = { lunas: "Lunas", pending: "Piutang", menunggu_persetujuan: "Menunggu Persetujuan" };
  const bodyRows = rows.length ? rows.map(t => `
    <tr>
      <td>${formatTanggal(t.tanggal)}</td>
      <td>${escapeHtml(t.keterangan)}</td>
      <td>${escapeHtml(t.kategori || "-")}</td>
      <td>${escapeHtml(t.extra || "-")}</td>
      <td class="c">${t.tipe}</td>
      ${book === "kasUsaha" ? `<td class="c">${statusLabel[t.status || "lunas"]}</td>` : ""}
      <td class="r">${rupiah(t.jumlah)}</td>
    </tr>
  `).join("") : `<tr><td colspan="${book === "kasUsaha" ? 7 : 6}" class="c">Tidak ada transaksi</td></tr>`;

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
    <h3 style="text-align:center; margin:6px 0 16px; letter-spacing:.5px;">${book === "kasUsaha" ? "BUKU KAS PERUSAHAAN" : "BUKU KAS PRIBADI"}</h3>
    <table class="doc-summary-table" style="margin-bottom:16px;">
      <tr><td>Saldo Awal</td><td class="r">${rupiah(sum.saldoAwal)}</td></tr>
      <tr><td>Total Pemasukan</td><td class="r">${rupiah(sum.masukLunas)}</td></tr>
      <tr><td>Total Pengeluaran</td><td class="r">${rupiah(sum.keluarLunas)}</td></tr>
      <tr class="total-row"><td>Saldo Akhir</td><td class="r">${rupiah(sum.saldoAkhir)}</td></tr>
    </table>
    <table class="doc-items">
      <thead><tr>
        <th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>${cfg.extraLabel}</th><th class="c">Tipe</th>
        ${book === "kasUsaha" ? '<th class="c">Status</th>' : ""}
        <th class="r">Jumlah</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p style="font-size:11px; color:#777; margin-top:10px;">Dicetak ${formatTanggal(new Date().toISOString().slice(0, 10))} — ${rows.length} transaksi.</p>
  `;
}
document.getElementById("ku_printBtn").addEventListener("click", () => {
  document.getElementById("printArea").innerHTML = buildKasPrintHtml("kasUsaha");
  document.body.classList.add("printing-quote");
  window.print();
});
document.getElementById("kp_printBtn").addEventListener("click", () => {
  document.getElementById("printArea").innerHTML = buildKasPrintHtml("kasPribadi");
  document.body.classList.add("printing-quote");
  window.print();
});

// ===== Settings =====
document.getElementById("settingsCompanyName").addEventListener("input", e => {
  state.company = e.target.value;
  saveState();
  mirrorCompanyProfileUpsert();
  document.getElementById("companyNameLabel").textContent = state.company || "Perusahaan Saya";
  document.title = `${state.company || "Laporan Keuangan"} — Laporan Keuangan`;
});
document.getElementById("settingsAlamat").addEventListener("input", e => { state.alamat = e.target.value; saveState(); mirrorCompanyProfileUpsert(); });
document.getElementById("settingsTelepon").addEventListener("input", e => { state.telepon = e.target.value; saveState(); mirrorCompanyProfileUpsert(); });
document.getElementById("settingsOwnerNama").addEventListener("input", e => { state.ownerNama = e.target.value; saveState(); mirrorCompanyProfileUpsert(); });
document.getElementById("settingsOwnerJabatan").addEventListener("input", e => { state.ownerJabatan = e.target.value; saveState(); mirrorCompanyProfileUpsert(); });
attachNumberFormatting(document.getElementById("settingsApprovalThreshold"));
document.getElementById("settingsApprovalThreshold").addEventListener("input", e => { state.approvalThreshold = parseNumberInput(e.target.value); saveState(); mirrorCompanyProfileUpsert(); });
attachNumberFormatting(document.getElementById("settingsTargetOmzet"));
document.getElementById("settingsTargetOmzet").addEventListener("input", e => { state.targetOmzetBulanan = parseNumberInput(e.target.value); saveState(); mirrorCompanyProfileUpsert(); });
attachNumberFormatting(document.getElementById("settingsTargetLaba"));
document.getElementById("settingsTargetLaba").addEventListener("input", e => { state.targetLababersihBulanan = parseNumberInput(e.target.value); saveState(); mirrorCompanyProfileUpsert(); });
document.getElementById("settingsMataResolusiMarkup").addEventListener("input", e => {
  const v = parseFloat((e.target.value || "0").replace(",", "."));
  state.mataResolusiMarkupPercent = isFinite(v) && v >= 0 ? v : 0;
  saveState();
  mirrorCompanyProfileUpsert();
});
document.getElementById("exportJsonBtn").addEventListener("click", () => {
  // Panel "Data" ini sudah disembunyikan lewat CSS untuk non-Owner
  // (applyRoleAccess), tapi itu cuma tampilan -- guard di sini memastikan
  // klik yang dipaksa lewat console/DevTools tetap ditolak di kode, bukan
  // cuma tersembunyi di layar.
  if (currentTeamRole !== "owner") { alert("Hanya Owner yang bisa export backup."); return; }
  downloadFile(`backup-keuangan-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(state, null, 2), "application/json");
});

// ===== Backup Otomatis (Fase 0.2) =====
// Riwayat backup ditulis oleh server (service role, lihat server/lib/backup.js),
// bukan oleh klien -- di sini cuma baca daftarnya (RLS app_backups sudah
// Owner-only) & unduh isinya kalau diminta, sama seperti Export Backup manual.
async function renderBackupHistory() {
  const tbody = document.querySelector("#backupHistoryTable tbody");
  if (!sb || !targetCompanyId) { tbody.innerHTML = '<tr class="empty-row"><td colspan="2">-</td></tr>'; return; }
  try {
    const { data, error } = await sb.from("app_backups").select("id,created_at").eq("company_id", targetCompanyId).order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    if (!data || !data.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="2">Belum ada backup otomatis -- backup pertama dibuat dalam 24 jam ke depan.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(row => `
      <tr>
        <td>${new Date(row.created_at).toLocaleString("id-ID")}</td>
        <td><button class="icon-btn" data-download-backup="${row.id}" title="Unduh">⬇️</button></td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="2">Gagal memuat riwayat backup: ${escapeHtml(err.message)}</td></tr>`;
  }
}
document.getElementById("backupHistoryTable").addEventListener("click", async e => {
  const btn = e.target.closest("[data-download-backup]");
  if (!btn) return;
  btn.disabled = true;
  try {
    const { data, error } = await sb.from("app_backups").select("data,created_at").eq("id", btn.dataset.downloadBackup).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Backup tidak ditemukan.");
    const tanggal = new Date(data.created_at).toISOString().slice(0, 10);
    downloadFile(`backup-otomatis-${tanggal}.json`, JSON.stringify(data.data, null, 2), "application/json");
  } catch (err) {
    alert("Gagal mengunduh backup: " + err.message);
  } finally {
    btn.disabled = false;
  }
});
// ===== Fase 0.5: halaman "Aktivitas Tim" (Owner-only) =====
let aktivitasOffset = 0;
const AKTIVITAS_PAGE_SIZE = 50;
let aktivitasFiltersReady = false;
async function populateAktivitasFilters() {
  if (aktivitasFiltersReady || !sb || !targetCompanyId) return;
  aktivitasFiltersReady = true;
  const modulSel = document.getElementById("akt_filterModul");
  modulSel.innerHTML = '<option value="">Semua Modul</option>' + Object.keys(ACTIVITY_MODULE_LABELS).map(m => `<option value="${m}">${escapeHtml(ACTIVITY_MODULE_LABELS[m])}</option>`).join("");
  try {
    const { data, error } = await sb.from("team_members").select("member_id,member_email").eq("owner_id", targetCompanyId).eq("status", "active");
    if (error) throw error;
    const anggotaSel = document.getElementById("akt_filterAnggota");
    const opsi = [`<option value="${targetCompanyId}">Owner</option>`]
      .concat((data || []).filter(r => r.member_id).map(r => `<option value="${r.member_id}">${escapeHtml(r.member_email)}</option>`));
    anggotaSel.innerHTML = '<option value="">Semua Anggota</option>' + opsi.join("");
  } catch (err) { /* best-effort -- filter anggota tetap "Semua" kalau gagal */ }
}
function aktivitasWaktuRentang() {
  const mulai = document.getElementById("akt_mulai").value;
  const selesai = document.getElementById("akt_selesai").value;
  return { mulai, selesai };
}
function renderAktivitasRow(row) {
  const waktu = new Date(row.created_at).toLocaleString("id-ID");
  const aksiLabel = { create: "Tambah", update: "Ubah", delete: "Hapus" }[row.action] || row.action;
  return `
    <tr data-aktivitas-id="${row.id}" style="cursor:pointer;">
      <td>${waktu}</td>
      <td>${escapeHtml(row.actor_email)} <span class="muted">(${escapeHtml(ROLE_LABELS[row.actor_role] || row.actor_role)})</span></td>
      <td>${escapeHtml(ACTIVITY_MODULE_LABELS[row.module] || row.module)}</td>
      <td>${aksiLabel}</td>
      <td>${escapeHtml(row.summary)}</td>
    </tr>
  `;
}
async function renderActivityLog(reset) {
  const tbody = document.querySelector("#aktivitasTable tbody");
  if (!sb || !targetCompanyId) { tbody.innerHTML = '<tr class="empty-row"><td colspan="5">-</td></tr>'; return; }
  await populateAktivitasFilters();
  if (reset !== false) { aktivitasOffset = 0; tbody.innerHTML = ""; }
  try {
    let q = sb.from("activity_log").select("*").eq("company_id", targetCompanyId).order("created_at", { ascending: false });
    const anggota = document.getElementById("akt_filterAnggota").value;
    const modul = document.getElementById("akt_filterModul").value;
    const { mulai, selesai } = aktivitasWaktuRentang();
    if (anggota) q = q.eq("actor_id", anggota);
    if (modul) q = q.eq("module", modul);
    if (mulai) q = q.gte("created_at", mulai);
    if (selesai) q = q.lte("created_at", selesai + "T23:59:59");
    q = q.range(aktivitasOffset, aktivitasOffset + AKTIVITAS_PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    if (aktivitasOffset === 0 && !rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Belum ada aktivitas tercatat pada rentang/filter ini.</td></tr>';
    } else {
      tbody.insertAdjacentHTML("beforeend", rows.map(renderAktivitasRow).join(""));
    }
    aktivitasOffset += rows.length;
    document.getElementById("akt_loadMoreBtn").style.display = rows.length < AKTIVITAS_PAGE_SIZE ? "none" : "";
  } catch (err) {
    if (aktivitasOffset === 0) tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Gagal memuat log aktivitas: ${escapeHtml(err.message)}</td></tr>`;
  }
}
document.getElementById("akt_filterBtn").addEventListener("click", () => renderActivityLog(true));
document.getElementById("akt_loadMoreBtn").addEventListener("click", () => renderActivityLog(false));
const aktivitasDetailModal = document.getElementById("aktivitasDetailModal");
document.getElementById("aktivitasTable").addEventListener("click", async e => {
  const tr = e.target.closest("[data-aktivitas-id]");
  if (!tr || !sb) return;
  try {
    const { data, error } = await sb.from("activity_log").select("*").eq("id", tr.dataset.aktivitasId).maybeSingle();
    if (error) throw error;
    if (!data) return;
    document.getElementById("aktivitasDetailTitle").textContent = `${ACTIVITY_MODULE_LABELS[data.module] || data.module} — ${escapeHtml(data.actor_email)}`;
    const diff = data.diff;
    let bodyHtml;
    if (data.action === "delete") {
      bodyHtml = `<p class="muted">Data yang dihapus:</p><pre style="white-space:pre-wrap; font-size:12px;">${escapeHtml(JSON.stringify(diff, null, 2))}</pre>`;
    } else if (diff && Object.keys(diff).length) {
      bodyHtml = `<table class="tbl"><thead><tr><th>Field</th><th>Sebelum</th><th>Sesudah</th></tr></thead><tbody>${
        Object.keys(diff).map(f => `<tr><td>${escapeHtml(f)}</td><td>${escapeHtml(JSON.stringify(diff[f].from))}</td><td>${escapeHtml(JSON.stringify(diff[f].to))}</td></tr>`).join("")
      }</tbody></table>`;
    } else {
      bodyHtml = `<p class="muted">${escapeHtml(data.summary)}</p>`;
    }
    document.getElementById("aktivitasDetailBody").innerHTML = bodyHtml;
    aktivitasDetailModal.classList.add("open");
  } catch (err) { /* best-effort -- diam kalau gagal buka detail */ }
});

// Selain slip gaji, beberapa field lain juga tersimpan sebagai satu kolom
// array utuh yang MENUMPUK dari waktu ke waktu dan TIDAK punya tombol hapus
// di UI (jadi seharusnya tidak pernah menyusut secara wajar): absensi
// karyawan & riwayat perubahan harga AHSP. Kalau file yang diimpor ternyata
// salinan lama yang belum sempat mencatat sebagian riwayat itu, gabungkan
// (union berdasarkan id) dengan data yang ada di state SEBELUM impor,
// supaya tidak ada yang hilang. Dokumen Proyek (SPK/BAST) dan riwayat
// transaksi Stok BISA dihapus manual oleh pengguna lewat UI, jadi tidak
// aman digabung begitu saja (bisa "menghidupkan lagi" entri yang memang
// sengaja dihapus) -- untuk keduanya dipakai aturan yang sama seperti slip
// gaji: pertahankan data lama HANYA kalau versi yang diimpor kosong sama
// sekali untuk proyek/barang itu.
function mergeArrById(lama, baru) {
  const map = new Map();
  (lama || []).forEach(item => { if (item && item.id) map.set(item.id, item); });
  (baru || []).forEach(item => { if (item && item.id) map.set(item.id, item); });
  return Array.from(map.values());
}
function preserveIfEmpty(lama, baru) {
  return (baru || []).length ? baru : (lama || []);
}
function preserveHistoryFieldsOnImport(sebelum, sesudah) {
  const karyawanLama = new Map((sebelum.karyawan || []).map(k => [k.id, k]));
  (sesudah.karyawan || []).forEach(k => {
    const old = karyawanLama.get(k.id);
    if (old) k.absensi = mergeArrById(old.absensi, k.absensi);
  });
  const ahspLama = new Map((sebelum.ahsp || []).map(a => [a.id, a]));
  (sesudah.ahsp || []).forEach(a => {
    const old = ahspLama.get(a.id);
    if (old) a.riwayatHarga = mergeArrById(old.riwayatHarga, a.riwayatHarga);
  });
  const proyekLama = new Map((sebelum.proyek || []).map(p => [p.id, p]));
  (sesudah.proyek || []).forEach(p => {
    const old = proyekLama.get(p.id);
    if (old) p.dokumen = preserveIfEmpty(old.dokumen, p.dokumen);
  });
  const stokLama = new Map((sebelum.stok || []).map(s => [s.id, s]));
  (sesudah.stok || []).forEach(s => {
    const old = stokLama.get(s.id);
    if (old) s.transactions = preserveIfEmpty(old.transactions, s.transactions);
  });
}
// Impor Backup mengganti seluruh state lokal sekaligus, jadi
// migrateXIfNeeded() (yang cuma jalan sekali, dan berhenti kalau tabel
// relasionalnya sudah pernah terisi apa pun) tidak akan otomatis
// mencerminkan data yang baru diimpor. mirrorAllToRelational() melakukan
// hal yang sama seperti mirrorXUpsert() di setiap titik mutasi normal,
// tapi untuk SELURUH isi state sekaligus setelah impor -- upsert per item,
// jadi aman digabung (merge) dengan data yang sudah ada di cloud, tidak
// menimpa/menghapus apa pun yang tidak ada di file yang diimpor.
async function mirrorAllToRelational() {
  if (!sb || !targetCompanyId) return;
  await mirrorCompanyProfileUpsert();
  // Catatan Fase 0.5: setiap mirrorXUpsert di bawah SENGAJA dipanggil
  // dengan tepat 1 argumen (bukan diteruskan langsung ke .forEach, yang
  // akan menyisipkan index array sebagai argumen kedua) -- parameter
  // "existing" yang undefined berarti "jangan catat ke Log Aktivitas",
  // karena ini re-mirror massal (impor/migrasi), bukan aksi satu pengguna.
  (state.klien || []).forEach(k => mirrorKlienUpsert(k));
  (state.ahsp || []).forEach(a => mirrorAhspUpsert(a));
  (state.proyekRab || []).forEach(r => mirrorRabUpsert(r));
  (state.penawaran || []).forEach(p => mirrorPenawaranUpsert(p));
  (state.proyek || []).forEach(p => mirrorProyekUpsert(p));
  (state.karyawan || []).forEach(k => {
    mirrorKaryawanUpsert(k);
    // karyawan_gaji.slip_gaji tersimpan sebagai SATU kolom array utuh
    // (bukan baris per slip), jadi upsert-nya MENIMPA seluruhnya, bukan
    // menggabung. Kalau file yang diimpor kebetulan tidak membawa data
    // slip gaji karyawan ini (mis. dari salinan lain yang belum pernah
    // dipakai untuk penggajian dia), jangan timpa riwayat asli yang
    // sudah ada di cloud dengan array kosong -- impor cuma untuk
    // MENAMBAH, bukan menghapus riwayat gaji yang sudah tercatat.
    if ((k.slipGaji || []).length) mirrorKaryawanGajiUpsert(k);
  });
  (state.stok || []).forEach(s => mirrorStokUpsert(s));
  (state.gudang || []).forEach(g => mirrorGudangUpsert(g));
  (state.pemasok || []).forEach(pm => mirrorPemasokUpsert(pm));
  (state.kasUsaha.transactions || []).forEach(t => mirrorKasUsahaUpsert(t));
  (state.kasPribadi.transactions || []).forEach(t => mirrorKasPribadiUpsert(t));
  await mirrorSaldoAwalUpsert("kasUsaha", state.kasUsaha.saldoAwal || 0);
  await mirrorSaldoAwalUpsert("kasPribadi", state.kasPribadi.saldoAwal || 0);
}
document.getElementById("importJsonInput").addEventListener("change", e => {
  if (currentTeamRole !== "owner") {
    alert("Hanya Owner yang bisa import backup.");
    e.target.value = "";
    return;
  }
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.kasUsaha || !imported.kasPribadi || !imported.proyek) throw new Error("format tidak sesuai");
      const sebelumImpor = state;
      state = withDefaults(imported);
      preserveHistoryFieldsOnImport(sebelumImpor, state);
      currentRabId = null;
      currentPwId = null;
      currentStokId = null;
      await mirrorAllToRelational();
      logBulkImportActivity({
        klien: (state.klien || []).length,
        ahsp: (state.ahsp || []).length,
        rab: (state.proyekRab || []).length,
        penawaran: (state.penawaran || []).length,
        proyek: (state.proyek || []).length,
        karyawan: (state.karyawan || []).length,
        stok: (state.stok || []).length,
        gudang: (state.gudang || []).length,
        pemasok: (state.pemasok || []).length,
        kasUsahaTransaksi: (state.kasUsaha.transactions || []).length,
        kasPribadiTransaksi: (state.kasPribadi.transactions || []).length
      });
      saveState();
      state = await hydrateSensitiveFields(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  if (currentTeamRole !== "owner") { alert("Hanya Owner yang bisa reset semua data."); return; }
  if (confirm("Yakin ingin menghapus SEMUA data dan mengembalikan ke data awal? Tindakan ini tidak bisa dibatalkan. Sebaiknya Export Backup dulu.")) {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    saveState();
    renderAll();
    alert("Data telah direset.");
  }
});

// ===== Cloud Sync UI wiring =====
function showSyncAuthMsg(text) {
  const el = document.getElementById("sync_authMsg");
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}
if (sb) {
  sb.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      if (!currentSyncUser || currentSyncUser.id !== session.user.id) handlePostLoginSync(session.user);
    } else {
      currentSyncUser = null;
      currentTeamRole = "owner";
      targetCompanyId = null;
      unsubscribeRealtime();
      updateSyncUI();
      applyRoleAccess();
    }
  });
  sb.auth.getSession().then(({ data }) => {
    if (data && data.session && data.session.user) handlePostLoginSync(data.session.user);
  }).catch(() => {});
} else {
  showSyncAuthMsg("Fitur sinkronisasi cloud tidak tersedia saat ini (gagal memuat pustaka Supabase). Aplikasi tetap berfungsi normal secara lokal.");
}
document.getElementById("sync_sendCodeBtn").addEventListener("click", async () => {
  if (!sb) { showSyncAuthMsg("Fitur cloud sync tidak tersedia (gagal memuat pustaka Supabase)."); return; }
  const email = document.getElementById("sync_email").value.trim();
  if (!email) { showSyncAuthMsg("Isi email terlebih dahulu."); return; }
  const btn = document.getElementById("sync_sendCodeBtn");
  btn.disabled = true;
  showSyncAuthMsg("Mengirim kode...");
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectTo } });
  btn.disabled = false;
  if (error) { showSyncAuthMsg("Gagal mengirim kode: " + error.message); return; }
  document.getElementById("sync_codeEmailLabel").textContent = email;
  document.getElementById("sync_step_email").style.display = "none";
  document.getElementById("sync_step_code").style.display = "block";
  document.getElementById("sync_code").value = "";
  showSyncAuthMsg("Kode terkirim. Cek email Anda (termasuk folder Spam).");
});
document.getElementById("sync_verifyCodeBtn").addEventListener("click", async () => {
  if (!sb) { showSyncAuthMsg("Fitur cloud sync tidak tersedia (gagal memuat pustaka Supabase)."); return; }
  const email = document.getElementById("sync_email").value.trim();
  const code = document.getElementById("sync_code").value.trim();
  if (!code) { showSyncAuthMsg("Isi kode 6 digit yang dikirim ke email."); return; }
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
  showSyncAuthMsg(error ? "Gagal verifikasi: " + error.message : "");
});
document.getElementById("sync_backToEmailBtn").addEventListener("click", () => {
  document.getElementById("sync_step_code").style.display = "none";
  document.getElementById("sync_step_email").style.display = "block";
  showSyncAuthMsg("");
});
document.getElementById("sync_logoutBtn").addEventListener("click", async () => {
  if (!sb) return;
  if (!confirm("Keluar dari akun cloud sync? Data di perangkat ini tetap tersimpan lokal.")) return;
  await sb.auth.signOut();
});
document.getElementById("sync_nowBtn").addEventListener("click", () => pushStateToCloud());

// ===== Anggota Tim (Owner mengundang Admin/Marketing) =====
function showTeamMsg(text) {
  const el = document.getElementById("team_msg");
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}
async function renderTeamMembers() {
  const tbody = document.querySelector("#team_table tbody");
  if (!tbody || !sb || !currentSyncUser) return;
  try {
    const { data, error } = await sb.from("team_members").select("*").eq("owner_id", currentSyncUser.id).order("created_at", { ascending: true });
    if (error) throw error;
    const rows = data || [];
    tbody.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${escapeHtml(r.member_email)}</td>
        <td>${escapeHtml(ROLE_LABELS[r.role] || r.role)}</td>
        <td>${r.status === "active" ? "Aktif" : "Menunggu login pertama"}</td>
        <td>
          <button class="btn-ghost" data-send-instruksi="${r.id}" data-email="${escapeHtml(r.member_email)}" data-role="${escapeHtml(r.role)}" data-wa="${escapeHtml(r.member_whatsapp || "")}">💬 Kirim Instruksi</button>
          <button class="btn-ghost" data-remove-team="${r.id}">Hapus</button>
        </td>
      </tr>
    `).join("") : `<tr><td colspan="4" class="muted">Belum ada anggota tim yang diundang.</td></tr>`;
    tbody.querySelectorAll("[data-remove-team]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Hapus anggota tim ini? Mereka tidak akan bisa lagi mengakses data perusahaan setelah ini.")) return;
        const { error: delErr } = await sb.from("team_members").delete().eq("id", btn.dataset.removeTeam);
        if (delErr) { showTeamMsg("Gagal menghapus: " + delErr.message); return; }
        renderTeamMembers();
      });
    });
    tbody.querySelectorAll("[data-send-instruksi]").forEach(btn => {
      btn.addEventListener("click", () => {
        sendInviteInstruction(btn.dataset.email, btn.dataset.role, btn.dataset.wa);
      });
    });
  } catch (err) {
    showTeamMsg("Gagal memuat daftar anggota tim: " + err.message);
  }
}
document.getElementById("team_inviteBtn").addEventListener("click", async () => {
  if (!sb || !currentSyncUser) return;
  const email = document.getElementById("team_newEmail").value.trim().toLowerCase();
  const whatsapp = document.getElementById("team_newWhatsapp").value.trim();
  const role = document.getElementById("team_newRole").value;
  if (!email) { showTeamMsg("Isi email anggota yang mau diundang."); return; }
  showTeamMsg("Mengundang...");
  let { error } = await sb.from("team_members").insert({ owner_id: currentSyncUser.id, member_email: email, member_whatsapp: whatsapp || null, role, status: "pending" });
  if (error && /member_whatsapp|schema cache/i.test(error.message)) {
    ({ error } = await sb.from("team_members").insert({ owner_id: currentSyncUser.id, member_email: email, role, status: "pending" }));
  }
  if (error) { showTeamMsg("Gagal mengundang: " + error.message); return; }
  document.getElementById("team_newEmail").value = "";
  document.getElementById("team_newWhatsapp").value = "";
  renderTeamMembers();
  await sendInviteInstruction(email, role, whatsapp);
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
