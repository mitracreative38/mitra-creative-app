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

async function submitPing(supabaseAdmin, deviceToken, { lat, lng, accuracy, capturedAt } = {}) {
  const token = String(deviceToken || "").trim();
  if (!token) return { error: "device_token wajib diisi." };
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { error: "lat/lng tidak valid." };
  }

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

async function cleanupOldLokasiPekerja(supabaseAdmin) {
  const cutoff = new Date(Date.now() - PING_RETENTION_MS).toISOString();
  const { error } = await supabaseAdmin.from("lokasi_pekerja").delete().lt("captured_at", cutoff);
  if (error) console.error("[pekerjaTracking] gagal bersihkan lokasi lama:", error.message);
}

module.exports = { pairDevice, submitPing, cleanupOldLokasiPekerja };
