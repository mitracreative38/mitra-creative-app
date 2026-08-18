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

module.exports = { pairDevice, submitPing, submitAbsenApp, cleanupOldLokasiPekerja, ABSENSI_SELFIE_BUCKET };
