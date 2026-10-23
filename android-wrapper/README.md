# Android APK

The APK is generated in CI (GitHub Actions) with Capacitor, so no Android Studio or laptop is needed.
It wraps your deployed Vercel site, so the APK uses the exact same app and design.

1. Deploy to Vercel first and copy the URL (e.g. https://worldscope.vercel.app).
2. GitHub repo → Actions → "Build Android APK" → Run workflow → paste the URL.
3. When it finishes, open the run → Artifacts → `WorldScope-debug-apk` → download, unzip, install the .apk.

Package: `com.lorddenish.worldscope`. This builds a **debug-signed** APK (no secrets in the repo).
For a Play Store release you would add your own keystore through GitHub Secrets.
No APK exists until the workflow has run successfully.
