// Native-shell glue code for the Capacitor-wrapped mobile app.
// Bundled to www/mobile-init.bundle.js (see package.json "build:mobile-init").
// No-ops entirely when running as a plain website (Capacitor.isNativePlatform() === false).
import { Capacitor, registerPlugin } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App } from "@capacitor/app";

// Lokasi Pekerja (Fase 1.5): @capacitor-community/background-geolocation
// tidak menyertakan JS bridge sendiri (cuma kode native + tipe TS) --
// registerPlugin() di sini mendaftarkannya lewat nama plugin native-nya
// ("BackgroundGeolocation", lihat android/src/.../AndroidManifest.xml
// paket plugin itu). Diekspos ke window supaya app.js (skrip biasa, bukan
// modul) bisa memanggilnya tanpa perlu tahu apa pun soal Capacitor --
// window.__pekerjaGeo.isNative menentukan app.js pakai jalur ini
// (lacak tetap jalan walau di-minimize/layar mati, lewat foreground
// service) atau jalur cadangan navigator.geolocation biasa (browser
// polos, atau kalau plugin gagal dimuat -- cuma jalan selagi tab/app
// benar-benar di layar depan).
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
window.__pekerjaGeo = {
  isNative: Capacitor.isNativePlatform(),
  addWatcher: (options, callback) => BackgroundGeolocation.addWatcher(options, callback),
  removeWatcher: (id) => BackgroundGeolocation.removeWatcher({ id }),
  openSettings: () => BackgroundGeolocation.openSettings()
};

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  if (Capacitor.getPlatform() === "android") {
    StatusBar.setBackgroundColor({ color: "#f9f9f7" }).catch(() => {});
  }

  window.addEventListener("load", () => {
    setTimeout(() => SplashScreen.hide(), 300);
  });

  // Map the Android hardware/gesture back button onto the app's own
  // navigation stack (close modal > leave editor/detail view > go to
  // dashboard > exit app) instead of the WebView's default history.back().
  App.addListener("backButton", () => {
    const openModal = document.querySelector(".modal-backdrop.open");
    if (openModal) {
      if (typeof window.closeModals === "function") window.closeModals();
      return;
    }
    const rabEditor = document.getElementById("rab_editorView");
    if (rabEditor && rabEditor.style.display !== "none" && typeof window.showRabList === "function") {
      window.showRabList();
      return;
    }
    const pwEditor = document.getElementById("pw_editorView");
    if (pwEditor && pwEditor.style.display !== "none" && typeof window.showPwList === "function") {
      window.showPwList();
      return;
    }
    const stokRiwayat = document.getElementById("stok_riwayatView");
    if (stokRiwayat && stokRiwayat.style.display !== "none" && typeof window.showStokList === "function") {
      window.showStokList();
      return;
    }
    const activePage = document.querySelector(".nav-item.active");
    if (activePage && activePage.dataset.page !== "dashboard" && typeof window.showPage === "function") {
      window.showPage("dashboard");
      return;
    }
    App.exitApp();
  });
}
