-- ============================================================================
-- CV Mitra Creative — Laporan Keuangan
-- Fix 30: Rahasiakan data upah/pinjaman karyawan sepenuhnya dari non-Owner
--
-- Hasil audit menyeluruh menemukan dua kebocoran data sensitif:
--
-- 1. Blob cadangan app_state masih bisa DIBACA semua anggota tim aktif
--    (termasuk Marketing) lewat API langsung -- padahal isinya memuat
--    upah karyawan, pinjaman awal, uang makan/bon harian, serta modul
--    Proyek/Stok/Pemasok yang seharusnya tertutup untuk Marketing.
--    Perbaikan: kebijakan SELECT app_state dipersempit kembali ke
--    Owner-only. INSERT/UPDATE tim dibiarkan (blob tetap ditulis semua
--    peran sebagai umpan Backup Otomatis; pushStateToCloud() tidak pernah
--    membaca balik hasil upsert-nya, jadi tidak butuh izin SELECT).
--
-- 2. Kolom upah di tabel karyawan (upah_harian, tarif_lembur,
--    uang_makan_harian, gaji_bulanan, target_bulanan, persen_bonus,
--    pinjaman_awal) plus uangMakan/bon per hari di dalam kolom absensi
--    (jsonb) bisa dibaca DAN diubah Admin -- bertentangan dengan aturan
--    "data gaji & pinjaman rahasia Owner" yang sudah ditegakkan di slip
--    gaji (karyawan_gaji, Owner-only) sejak Fase D. Ini juga menyalahi
--    niat desain awal tabelnya sendiri ("Nominal gaji TIDAK di sini").
--    Perbaikan: kolom-kolom nominal itu DIPINDAH ke karyawan_gaji
--    (RLS Owner-only): nilai lama disalin, lalu kolom di karyawan
--    dinolkan dan kunci uangMakan/bon dibuang dari setiap catatan
--    absensi. Data dasar karyawan (nama, jabatan, kehadiran, lembur,
--    lokasi, selfie) tetap bisa diakses Admin seperti biasa.
--
-- Aman dijalankan berkali-kali (idempotent): penyalinan hanya terjadi
-- kalau masih ada nilai bukan-nol di karyawan; setelah dinolkan, run
-- berikutnya tidak menyalin apa-apa (tidak akan menimpa nilai asli
-- di karyawan_gaji dengan nol).
--
-- Cara pakai: SQL Editor > New query > tempel semua > Run.
-- ============================================================================

-- ---------- 1. app_state: baca kembali khusus Owner ----------
drop policy if exists "Owner & anggota tim aktif bisa lihat data perusahaan" on app_state;
drop policy if exists "Pengguna hanya bisa lihat datanya sendiri" on app_state;
create policy "Pengguna hanya bisa lihat datanya sendiri" on app_state for select
  using (auth.uid() = user_id);

-- ---------- 2. karyawan_gaji: rumah baru untuk nominal upah ----------
alter table karyawan_gaji add column if not exists upah_harian numeric not null default 0;
alter table karyawan_gaji add column if not exists tarif_lembur numeric not null default 0;
alter table karyawan_gaji add column if not exists uang_makan_harian numeric not null default 0;
alter table karyawan_gaji add column if not exists gaji_bulanan numeric not null default 0;
alter table karyawan_gaji add column if not exists target_bulanan numeric not null default 0;
alter table karyawan_gaji add column if not exists persen_bonus numeric not null default 0;
alter table karyawan_gaji add column if not exists pinjaman_awal numeric not null default 0;
-- uangMakan/bon per tanggal: { "2026-08-24": {"uangMakan": 50000, "bon": 0}, ... }
alter table karyawan_gaji add column if not exists absensi_gaji jsonb not null default '{}';

-- ---------- 3. Salin nilai lama dari karyawan ke karyawan_gaji ----------
do $$
declare
  k record;
  gaji_map jsonb;
begin
  for k in select * from karyawan loop
    -- Baris karyawan_gaji mungkin belum ada (karyawan yang belum pernah
    -- digaji) -- buat dulu supaya nominalnya punya tempat.
    insert into karyawan_gaji (id, company_id, karyawan_id)
      values (k.id, k.company_id, k.id)
      on conflict (id) do nothing;

    -- Kumpulkan uangMakan/bon per tanggal dari catatan absensi lama.
    select coalesce(jsonb_object_agg(
        e->>'tanggal',
        jsonb_strip_nulls(jsonb_build_object('uangMakan', e->'uangMakan', 'bon', e->'bon'))
      ), '{}'::jsonb)
      into gaji_map
      from jsonb_array_elements(
        coalesce(case when jsonb_typeof(k.absensi) = 'array' then k.absensi end, '[]'::jsonb)
      ) e
      where (e ? 'uangMakan' or e ? 'bon') and e->>'tanggal' is not null;

    -- Hanya salin kalau sumbernya masih membawa nilai (guard idempotensi:
    -- setelah langkah 4 menolkan karyawan, run ulang tidak menyalin nol).
    if coalesce(k.upah_harian,0) <> 0 or coalesce(k.tarif_lembur,0) <> 0
       or coalesce(k.uang_makan_harian,0) <> 0 or coalesce(k.gaji_bulanan,0) <> 0
       or coalesce(k.target_bulanan,0) <> 0 or coalesce(k.persen_bonus,0) <> 0
       or coalesce(k.pinjaman_awal,0) <> 0 then
      update karyawan_gaji set
        upah_harian = k.upah_harian,
        tarif_lembur = k.tarif_lembur,
        uang_makan_harian = k.uang_makan_harian,
        gaji_bulanan = k.gaji_bulanan,
        target_bulanan = k.target_bulanan,
        persen_bonus = k.persen_bonus,
        pinjaman_awal = k.pinjaman_awal,
        updated_at = now()
      where id = k.id;
    end if;
    if gaji_map <> '{}'::jsonb then
      update karyawan_gaji set
        absensi_gaji = coalesce(absensi_gaji, '{}'::jsonb) || gaji_map,
        updated_at = now()
      where id = k.id;
    end if;
  end loop;
end $$;

-- ---------- 4. Bersihkan nominal dari tabel karyawan (terbaca Admin) ----------
update karyawan set
  upah_harian = 0, tarif_lembur = 0, uang_makan_harian = 0,
  gaji_bulanan = 0, target_bulanan = 0, persen_bonus = 0, pinjaman_awal = 0
where coalesce(upah_harian,0) <> 0 or coalesce(tarif_lembur,0) <> 0
   or coalesce(uang_makan_harian,0) <> 0 or coalesce(gaji_bulanan,0) <> 0
   or coalesce(target_bulanan,0) <> 0 or coalesce(persen_bonus,0) <> 0
   or coalesce(pinjaman_awal,0) <> 0;

update karyawan set absensi = (
  select coalesce(jsonb_agg(e - 'uangMakan' - 'bon'), '[]'::jsonb)
  from jsonb_array_elements(absensi) e
)
where jsonb_typeof(absensi) = 'array'
  and exists (
    select 1 from jsonb_array_elements(absensi) e
    where e ? 'uangMakan' or e ? 'bon'
  );

-- Cara pakai: SQL Editor > New query > tempel semua > Run.
