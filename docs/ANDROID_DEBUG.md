# Android Debugging Guide

## Running on a Physical Device via USB

### Prerequisites

- USB debugging enabled on device (Settings → Developer Options → USB Debugging)
- Device connected via USB

### Verify device is connected

```bash
adb devices
```

### Run the app

```bash
pnpm android
```

This builds and installs the debug app directly to the connected device. First build is slower; subsequent runs use the Metro dev server with hot reload.

### Screen mirroring with scrcpy

Mirror your Android screen to your Mac:

```bash
brew install scrcpy
```

Run with default settings:

```bash
scrcpy
```

If you get a capture/encoding error (common on OnePlus and some devices):

```bash
scrcpy --video-codec=h264 --video-encoder='c2.android.avc.encoder'
```

Or try with lower resolution:

```bash
scrcpy --video-codec=h264 -m1024
```

## Google Sign-In (SHA-1 Setup)

Google Sign-In on Android requires the SHA-1 fingerprint of the signing key to be registered in the Google Cloud Console. Without it, you get `DEVELOPER_ERROR`.

### Get SHA-1 for local debug builds

```bash
cd android && ./gradlew signingReport
```

This prints the SHA-1 for the auto-generated debug keystore.

If `~/.android/debug.keystore` exists, you can also run:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```

### Get SHA-1 for EAS builds (production/preview)

```bash
eas credentials --platform android
```

This shows the SHA-1 of the EAS signing key used for distributed builds.

### Register SHA-1 in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Find or create an **Android** OAuth 2.0 Client ID
3. Set package name: `com.chetanjain.kharcha`
4. Add the SHA-1 fingerprint(s) from above
5. Save

You need to add **both** SHA-1s if you want Google Sign-In to work in both local debug builds and EAS-distributed builds.

## Building APKs

### Debug APK (via EAS)

```bash
pnpm build:android:preview
```

Downloads from EAS after build completes.

### Release APK (local, no Metro needed)

```bash
npx expo run:android --variant release
```

Installs directly to USB-connected device. Works without Metro dev server.
