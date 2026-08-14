// Native-shell glue code for the Capacitor-wrapped mobile app.
// Bundled to www/mobile-init.bundle.js (see package.json "build:mobile-init").
// No-ops entirely when running as a plain website (Capacitor.isNativePlatform() === false).
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App } from "@capacitor/app";

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
