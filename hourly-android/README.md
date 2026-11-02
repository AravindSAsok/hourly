# Hourly Android wrapper

A small native Kotlin application that opens the existing deployed Hourly site in Android WebView. It does not build or change the Next.js app, Supabase project, database, or authentication logic.

## Project layout

```text
.github/workflows/build-android.yml
hourly-android/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/aravind/hourly/MainActivity.kt
│       └── res/
├── gradle/wrapper/
│   ├── gradle-wrapper.jar
│   └── gradle-wrapper.properties
├── build.gradle.kts
├── gradle.properties
├── gradlew
├── gradlew.bat
└── settings.gradle.kts
```

The workflow lives at the repository root because GitHub only discovers workflows under the root `.github/workflows` directory. Android source and build output stay under `hourly-android/`.

## Build locally

Requirements for a local build: JDK 17, Android SDK platform 36 with build tools 36.0.0, and an internet connection for the first build. The checked-in Gradle Wrapper downloads Gradle 9.6.1 and verifies its official SHA-256 before running it; a separate Gradle installation is not needed. GitHub Actions installs the Android SDK automatically.

From the repository root:

```powershell
cd hourly-android
.\gradlew.bat assembleDebug
```

On macOS or Linux:

```sh
cd hourly-android
chmod +x ./gradlew
./gradlew assembleDebug
```

The local debug APK is `hourly-android/app/build/outputs/apk/debug/app-debug.apk`.

## GitHub Actions

Pushing to `main` builds and uploads `Hourly-Android-Debug-APK`. To run it manually, open the repository's **Actions** tab, select **Build Hourly Android APK**, choose **Run workflow** on `main`, and leave **Build a signed release APK** unchecked for a debug-only run. Artifacts are retained for 30 days. Download the APK artifact from the completed run's **Artifacts** section and unzip it.

The workflow uses JDK 17, Android SDK platform 36, Android Gradle Plugin 9.5.0, and Gradle 9.6.1. It does not require a local Android Studio installation.

## Optional signed release APK

Create a keystore once and keep a secure backup. Never commit the keystore or its passwords:

```sh
keytool -genkeypair -v -keystore hourly-release.jks -alias hourly -keyalg RSA -keysize 4096 -validity 10000
```

Add these repository **Actions secrets** under **Settings → Secrets and variables → Actions**:

- `ANDROID_KEYSTORE_BASE64`: the keystore file encoded as one base64 string.
- `ANDROID_KEYSTORE_PASSWORD`: the keystore password.
- `ANDROID_KEY_ALIAS`: the alias supplied to `keytool`.
- `ANDROID_KEY_PASSWORD`: the key password.

On Windows PowerShell, copy the encoded keystore directly to the clipboard with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("hourly-release.jks")) | Set-Clipboard
```

On macOS or Linux, use `base64 -w 0 hourly-release.jks` (on macOS, use `base64 hourly-release.jks` and remove any line breaks before saving the secret).

Then run the workflow manually and check **Build a signed release APK**. When all four secrets are present, the workflow also uploads `Hourly-Android-Release-APK`. If signing is not configured, the debug build still completes and the release build is skipped with a notice. Keep the same keystore for every release update; a different signing key cannot update an installed release.

## Install and update on an Android phone

1. Download and unzip the `Hourly-Android-Debug-APK` artifact, or build the debug APK locally.
2. Transfer `app-debug.apk` to the phone and open it from Files or Downloads.
3. If Android prompts, allow that file app to install unknown apps, then confirm the install.
4. Open **Hourly** and sign in with the website's existing account.

GitHub debug artifacts are signed with a runner-generated debug key. A later run may use a different key, so Android may require uninstalling the previous debug APK before installing a new one; uninstalling also removes this app's local WebView session. For in-place updates, configure release signing and install the signed release artifact on the first install, then keep using that same keystore.

Pushing an update to `main` starts another debug build. You can also run a release build manually after configuring signing. Existing website updates appear in the wrapper automatically because it loads the deployed URL.

## Git commands

From the repository root, commit and push the wrapper and workflow:

```sh
git add .github/workflows/build-android.yml hourly-android
git commit -m "Add Hourly Android WebView wrapper"
git push origin main
```

## Scope and current limitations

- The wrapper loads `https://hourly-psi.vercel.app/dashboard`; the website handles login, registration, sessions, breaks, history, reports, and CSV export.
- WebView cookies and DOM storage are left intact and flushed during normal lifecycle events. No JavaScript bridge is exposed and TLS errors are rejected.
- HTML file inputs open Android's file picker. Downloads use Android DownloadManager and save to the device's Downloads folder. Android 9 and earlier require storage permission for public Downloads.
- Links on the Hourly host and common auth-provider hosts stay in WebView; other web links, `mailto:`, and `tel:` links use Android's normal apps.
- Email confirmation and password-reset links opened from an email app will normally open in the browser. Making Android route them back into this WebView automatically requires a verified Android App Link, which in turn requires a domain association file on the existing website. This project does not modify that website. A link opened or pasted inside the WebView can still use its existing callback route.
- WebView support does not guarantee that every third-party identity provider permits embedded sign-in. The current Hourly code uses email/password and same-site confirmation/reset routes.
- Device/emulator verification has not been performed in this workspace. The Android build can be produced by the GitHub workflow; successful CI status is visible on the workflow run.
