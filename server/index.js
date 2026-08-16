require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Situs statis (GitHub Pages) yang boleh memanggil server ini. Bisa diisi
// beberapa origin dipisah koma lewat env var, untuk dev lokal + produksi.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || "https://mitracreative38.github.io")
  .split(",")
  .map(o => o.trim())
  .concat(["http://localhost:8947", "http://localhost:8000"]);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[startup] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset di environment -- endpoint yang butuh akses database akan gagal sampai ini diisi.");
}

// service_role key melewati RLS -- HANYA dipakai di server ini, tidak pernah
// dikirim ke frontend. Dipakai untuk operasi lintas-perusahaan (mis. cek
// semua follow-up klien yang jatuh tempo hari ini untuk pengingat WA/email).
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    supabaseConfigured: !!supabaseAdmin,
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});

module.exports = app;
