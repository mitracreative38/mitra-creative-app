# Build Android & iOS apps

This project is a static web app (`www/`) wrapped with [Capacitor](https://capacitorjs.com)
so the exact same HTML/CSS/JS ships three ways:

- **Website** — `www/` deployed to GitHub Pages by `.github/workflows/deploy.yml`.
- **Android app** — native project in `android/`.
- **iOS app** — native project in `ios/`.

There is no framework/bundler for the app itself — `www/app.js`, `www/data.js`,
`www/style.css`, `www/index.html` are edited directly, same as before. The only
generated file is `www/mobile-init.bundle.js`, a small bundle (built from
`src/mobile-init.js` with esbuild) that wires up the status bar, splash screen,
and the Android hardware back button — it's a no-op when the page runs as a
plain website.

Building the actual `.apk`/`.aab` (Android) or `.ipa` (iOS) requires platform
SDKs this sandbox does not have (Android Studio / Xcode), so that last step
has to happen on your own machine.

## 1. One-time setup (on your machine)

```bash
npm install
```

## 2. After editing www/app.js, www/style.css, www/index.html, etc.

Re-copy the web assets into both native projects:

```bash
npm run sync
```

(`npm run sync` = rebuild `mobile-init.bundle.js` + `npx cap sync`.)

## 3. Android — build with Android Studio

Requires [Android Studio](https://developer.android.com/studio) (bundles the
Android SDK) and a JDK 17+.

```bash
npm run android:open   # opens android/ in Android Studio
```

In Android Studio: let Gradle sync finish, then **Run ▶** to install on a
connected device/emulator, or **Build > Generate Signed App Bundle / APK**
to produce a release `.aab`/`.apk` for the Play Store.

Command-line alternative (needs `ANDROID_HOME` set to an installed SDK):

```bash
cd android
./gradlew assembleDebug      # unsigned debug APK
./gradlew bundleRelease      # release AAB (needs a signing config)
```

## 4. iOS — build with Xcode (macOS only)

Requires a Mac with [Xcode](https://developer.apple.com/xcode/) installed.

```bash
npm run ios:open   # opens ios/App/App.xcodeproj in Xcode
```

The iOS project uses Swift Package Manager for the Capacitor plugins (no
CocoaPods step needed). In Xcode:

1. Select the **App** target → **Signing & Capabilities** → choose your Apple
   Developer team (needed to run on a real device or submit to the App Store).
2. **Product > Run** to install on a connected iPhone/iPad or the Simulator.
3. **Product > Archive** to produce a build for TestFlight / App Store
   Connect submission.

## App identity

- App name: **CV Mitra Creative**
- Bundle/Application ID: `com.mitracreative.keuangan`
- To change either, edit `capacitor.config.json` and update:
  - Android: `android/app/src/main/res/values/strings.xml` and
    `android/app/build.gradle` (`applicationId`).
  - iOS: the **App** target's Bundle Identifier in Xcode.

## Regenerating icons/splash screens

Source images are generated from `resources/generate-source-images.js`
(a plain blue "MC" mark matching the sidebar brand mark in the web app).
To regenerate icons/splash after changing that script or swapping in real
artwork (replace `resources/icon.png` / `resources/splash.png` directly):

```bash
npm run assets
npm run sync
```

## Offline behaviour

Two features — **Import BOQ (.xlsx)** and **Baca dari Gambar (OCR)** — load
`jszip` and `tesseract.js` from a CDN (`www/index.html`), so those two
features need an internet connection on the device. Everything else
(dashboard, kas, proyek, karyawan, stok, AHSP, RAB, penawaran, printing) runs
fully offline since all data is stored locally on-device via `localStorage`.
