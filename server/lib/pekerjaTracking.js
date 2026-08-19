// Pelacakan Lokasi Pekerja (Fase 1.5) -- HP pekerja lapangan tidak login
// lewat Supabase Auth sama sekali (mereka tidak selalu punya email aktif
// seperti Admin/Marketing). Sebagai gantinya, HP "dipasangkan" (paired)
// sekali lewat kode 6-digit yang dibuat Owner/Admin dari halaman
// Karyawan (insert langsung ke tabel pekerja_device lewat RLS normal,
// tidak lewat server ini). Dua fungsi di file ini -- pairDevice &
// submitPing -- HARUS lewat service role (supabaseAdmin) karena
// pemanggilnya (HP pekerja) tidak pernah punya access token Supabase
// sama sekali, cuma kode pairing lalu device_token sebagai kredensial.
const crypto = require("crypto");

const PING_RETENTION_MS = 14 * 24 * 60 * 60 * 1000; // simpan riwayat lokasi 14 hari

async function pairDevice(supabaseAdmin, pairingCode) {
  const code = String(pairingCode || "").trim();
  if (!code) return { error: "Kode pairing wajib diisi." };

  const { data: device, error } = await supabaseAdmin
    .from("pekerja_device")
    .select("*")
    .eq("pairing_code", code)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  if (!device) return { error: "Kode tidak ditemukan atau sudah dipakai." };
  if (new Date(device.expires_at).getTime() < Date.now()) {
    return { error: "Kode sudah kadaluarsa, minta kode baru dari Owner/Admin." };
  }

  const deviceToken = crypto.randomBytes(32).toString("hex");
  const { error: secretErr } = await supabaseAdmin
    .from("pekerja_device_secret")
    .insert({ device_id: device.id, device_token: deviceToken });
  if (secretErr) throw secretErr;

  const { error: updateErr } = await supabaseAdmin
    .from("pekerja_device")
    .update({ status: "paired", paired_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", device.id);
  if (updateErr) throw updateErr;

  const { data: karyawan } = await supabaseAdmin
    .from("karyawan")
    .select("nama")
    .eq("id", device.karyawan_id)
    .maybeSingle();

  return {
    deviceToken,
    karyawanNama: karyawan ? karyawan.nama : "Pekerja"
  };
}

// Dipakai bersama oleh submitPing & submitAbsenApp -- keduanya butuh
// menerjemahkan device_token (satu-satunya kredensial HP pekerja) jadi
// baris pekerja_device yang masih aktif (status paired).
async function resolveDeviceByToken(supabaseAdmin, deviceToken) {
  const token = String(deviceToken || "").trim();
  if (!token) return { error: "device_token wajib diisi." };

  const { data: secret, error: secretErr } = await supabaseAdmin
    .from("pekerja_device_secret")
    .select("device_id")
    .eq("device_token", token)
    .maybeSingle();
  if (secretErr) throw secretErr;
  if (!secret) return { error: "Perangkat tidak dikenali, perlu pairing ulang." };

  const { data: device, error: deviceErr } = await supabaseAdmin
    .from("pekerja_device")
    .select("id, company_id, karyawan_id, status")
    .eq("id", secret.device_id)
    .maybeSingle();
  if (deviceErr) throw deviceErr;
  if (!device || device.status !== "paired") {
    return { error: "Perangkat sudah dicabut, hubungi Owner/Admin." };
  }
  return { device };
}

async function submitPing(supabaseAdmin, deviceToken, { lat, lng, accuracy, capturedAt } = {}) {
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { error: "lat/lng tidak valid." };
  }
  const { device, error: resolveErr } = await resolveDeviceByToken(supabaseAdmin, deviceToken);
  if (resolveErr) return { error: resolveErr };

  const { error: insertErr } = await supabaseAdmin.from("lokasi_pekerja").insert({
    company_id: device.company_id,
    karyawan_id: device.karyawan_id,
    device_id: device.id,
    lat,
    lng,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    captured_at: capturedAt ? new Date(capturedAt).toISOString() : new Date().toISOString()
  });
  if (insertErr) throw insertErr;

  return { ok: true };
}

const ABSENSI_SELFIE_BUCKET = "absensi-selfie";
// Aplikasi ini dipakai perusahaan konstruksi berbasis Jawa Tengah (WIB,
// UTC+7, tidak ada DST) -- dipakai murni untuk menghitung jam lembur
// (Absen Pulang lewat aplikasi) supaya "jam kerja selesai" perusahaan
// (mis. 17:00) dibandingkan terhadap jam WIB yang sesungguhnya,
// terlepas dari zona waktu server ini berjalan.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

async function submitAbsenApp(supabaseAdmin, deviceToken, { jenis, selfieBase64 } = {}) {
  if (jenis !== "masuk" && jenis !== "pulang") {
    return { error: "jenis harus 'masuk' atau 'pulang'." };
  }
  if (!selfieBase64 || typeof selfieBase64 !== "string") {
    return { error: "Foto selfie wajib disertakan." };
  }
  const { device, error: resolveErr } = await resolveDeviceByToken(supabaseAdmin, deviceToken);
  if (resolveErr) return { error: resolveErr };

  const base64Data = selfieBase64.includes(",") ? selfieBase64.split(",").pop() : selfieBase64;
  const buffer = Buffer.from(base64Data, "base64");
  const path = `${device.company_id}/${device.karyawan_id}/${Date.now()}-${jenis}.jpg`;
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(ABSENSI_SELFIE_BUCKET)
    .upload(path, buffer, { contentType: "image/jpeg" });
  if (uploadErr) throw uploadErr;

  const { data: karyawan, error: karyawanErr } = await supabaseAdmin
    .from("karyawan")
    .select("id, absensi")
    .eq("id", device.karyawan_id)
    .maybeSingle();
  if (karyawanErr) throw karyawanErr;
  if (!karyawan) return { error: "Data karyawan tidak ditemukan." };

  const now = new Date();
  const tanggal = now.toISOString().slice(0, 10);
  const absensi = Array.isArray(karyawan.absensi) ? karyawan.absensi.slice() : [];
  const idx = absensi.findIndex(a => a.tanggal === tanggal);
  const rec = idx >= 0 ? { ...absensi[idx] } : { id: `absen-${Date.now()}`, tanggal, hadir: true, jamLembur: 0 };
  rec.hadir = true;
  rec.viaBiometrik = true;

  if (jenis === "masuk") {
    rec.jamMasuk = now.toISOString();
    rec.selfieMasukPath = path;
  } else {
    rec.jamPulang = now.toISOString();
    rec.selfiePulangPath = path;
    const { data: profile } = await supabaseAdmin
      .from("company_profile")
      .select("jam_kerja_selesai")
      .eq("company_id", device.company_id)
      .maybeSingle();
    const jamSelesai = (profile && profile.jam_kerja_selesai) || "17:00";
    const [hh, mm] = jamSelesai.split(":").map(Number);
    const nowWIB = new Date(now.getTime() + WIB_OFFSET_MS);
    const cutoffWIB = new Date(Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate(), hh, mm, 0, 0));
    const cutoffUtc = new Date(cutoffWIB.getTime() - WIB_OFFSET_MS);
    const lemburMs = now.getTime() - cutoffUtc.getTime();
    if (lemburMs > 0) rec.jamLembur = Math.round((lemburMs / 3600000) * 100) / 100;
  }

  if (idx >= 0) absensi[idx] = rec; else absensi.push(rec);
  const { error: updateErr } = await supabaseAdmin
    .from("karyawan")
    .update({ absensi, updated_at: now.toISOString() })
    .eq("id", device.karyawan_id);
  if (updateErr) throw updateErr;

  return { ok: true, tanggal, jenis };
}

async function cleanupOldLokasiPekerja(supabaseAdmin) {
  const cutoff = new Date(Date.now() - PING_RETENTION_MS).toISOString();
  const { error } = await supabaseAdmin.from("lokasi_pekerja").delete().lt("captured_at", cutoff);
  if (error) console.error("[pekerjaTracking] gagal bersihkan lokasi lama:", error.message);
}

// ===== Fase 1.9: Alat yang sedang dibawa pekerja (pengingat di HP + swakembali) =====
// Cuma pengingat -- TIDAK menghalangi Absen Pulang. Pekerja boleh menandai
// kembali sendiri (jumlah + kondisi fisik saat itu), tapi cuma untuk
// peminjaman atas namanya sendiri (dicek via device.karyawan_id, bukan dari
// input klien manapun) -- Owner/Admin tetap bisa memantau lewat tabel
// riwayat peminjaman Alat yang sudah ada (kolom Kondisi Kembali) + Realtime
// (tabel "alat" sudah ada di REALTIME_RELATIONAL_TABLES).
async function getAlatDipinjamPekerja(supabaseAdmin, deviceToken) {
  const { device, error: resolveErr } = await resolveDeviceByToken(supabaseAdmin, deviceToken);
  if (resolveErr) return { error: resolveErr };

  const { data: alatRows, error } = await supabaseAdmin
    .from("alat")
    .select("id, nama, peminjaman")
    .eq("company_id", device.company_id);
  if (error) throw error;

  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  (alatRows || []).forEach(a => {
    (a.peminjaman || []).forEach(p => {
      if (p.karyawanId === device.karyawan_id && !p.tanggalKembali) {
        items.push({
          alatId: a.id, alatNama: a.nama, peminjamanId: p.id, jumlah: p.jumlah || 0,
          tanggalPinjam: p.tanggalPinjam || "", rencanaKembali: p.rencanaKembali || "",
          terlambat: !!(p.rencanaKembali && p.rencanaKembali < today)
        });
      }
    });
  });
  items.sort((a, b) => (a.tanggalPinjam || "").localeCompare(b.tanggalPinjam || ""));
  return { items };
}

async function kembalikanAlatPekerja(supabaseAdmin, deviceToken, { alatId, peminjamanId, jumlahDikembalikan, kondisiKembali, catatan } = {}) {
  const { device, error: resolveErr } = await resolveDeviceByToken(supabaseAdmin, deviceToken);
  if (resolveErr) return { error: resolveErr };
  if (!alatId || !peminjamanId) return { error: "Data alat tidak lengkap." };
  const jumlah = Number(jumlahDikembalikan);
  if (!jumlah || jumlah <= 0) return { error: "Jumlah dikembalikan harus lebih dari 0." };
  if (!["Baik", "Rusak", "Hilang"].includes(kondisiKembali)) return { error: "Kondisi kembali tidak valid." };

  const { data: alat, error: alatErr } = await supabaseAdmin
    .from("alat")
    .select("id, peminjaman")
    .eq("id", alatId)
    .eq("company_id", device.company_id)
    .maybeSingle();
  if (alatErr) throw alatErr;
  if (!alat) return { error: "Alat tidak ditemukan." };

  const peminjaman = Array.isArray(alat.peminjaman) ? alat.peminjaman.slice() : [];
  const idx = peminjaman.findIndex(p => p.id === peminjamanId);
  if (idx < 0) return { error: "Riwayat peminjaman tidak ditemukan." };
  const p = peminjaman[idx];
  // Verifikasi kepemilikan dari device.karyawan_id (hasil resolveDeviceByToken),
  // BUKAN dari input klien -- pekerja tidak bisa menandai kembali peminjaman
  // atas nama orang lain.
  if (p.karyawanId !== device.karyawan_id) return { error: "Peminjaman ini bukan atas nama Anda." };
  if (p.tanggalKembali) return { error: "Peminjaman ini sudah ditandai kembali." };
  if (jumlah > (p.jumlah || 0)) return { error: `Jumlah melebihi yang sedang Anda pinjam (${p.jumlah}).` };

  const now = new Date().toISOString().slice(0, 10);
  if (jumlah === p.jumlah) {
    peminjaman[idx] = { ...p, tanggalKembali: now, kondisiKembali, catatan: (catatan || "").trim() };
  } else {
    // Kembalikan sebagian -- sisa jumlah tetap tercatat "masih dipinjam" di
    // record asli, bagian yang dikembalikan dipecah jadi record baru supaya
    // kondisi fisiknya tercatat terpisah (mis. 1 unit Baik, 1 unit Rusak).
    peminjaman[idx] = { ...p, jumlah: p.jumlah - jumlah };
    peminjaman.push({
      id: "kb-" + crypto.randomBytes(8).toString("hex"), karyawanId: p.karyawanId, proyekId: p.proyekId || "",
      jumlah, tanggalPinjam: p.tanggalPinjam, rencanaKembali: p.rencanaKembali || "",
      tanggalKembali: now, kondisiKembali, catatan: (catatan || "").trim()
    });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("alat")
    .update({ peminjaman, updated_at: new Date().toISOString() })
    .eq("id", alatId);
  if (updateErr) throw updateErr;

  return { ok: true };
}

module.exports = {
  pairDevice, submitPing, submitAbsenApp, cleanupOldLokasiPekerja, ABSENSI_SELFIE_BUCKET,
  getAlatDipinjamPekerja, kembalikanAlatPekerja
};
