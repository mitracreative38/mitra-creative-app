// Bundel lokal untuk fitur Absensi QR Code (Fase 1.7) -- SENGAJA dibundel
// & dilayani dari server sendiri (bukan CDN eksternal) supaya tetap jalan
// walau koneksi ke CDN diblokir/lambat, konsisten dengan filosofi aplikasi
// ini yang offline-first. Dua library:
// - qrcode (npm): membuat gambar QR (kartu ID pekerja) -- window.QRCode
// - jsqr (npm): membaca/decode QR dari frame kamera -- window.jsQR
import QRCode from "qrcode";
import jsQR from "jsqr";

window.QRCode = QRCode;
window.jsQR = jsQR;
