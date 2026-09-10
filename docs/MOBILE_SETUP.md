# Mobile app — setup and running

The Flutter customer app lives in [`apps/mobile`](../apps/mobile). It is **not** part of the pnpm
workspace and **not** part of the deploy pipeline — `.github/workflows/deploy.yml` excludes
`apps/mobile/**` from its `paths:` trigger, so mobile work never rebuilds or redeploys the three
web services.

## Toolchain

| Tool | Version this was built and verified against |
| --- | --- |
| Flutter | 3.38.5 (stable) |
| Dart | 3.10.4 |
| Android SDK | 35 |

```bash
flutter --version
```

`flutter doctor` must be green for the Android toolchain. iOS builds need a Mac; nothing in the
code is Android-specific, but the iOS side has not been run.

## First run

```bash
cd apps/mobile && flutter pub get
```

The app needs a running API. Start the backend the usual way from the repo root:

```bash
docker compose up -d && pnpm --filter @topup-hub/api dev
```

Then, against the local API from an **Android emulator**:

```bash
cd apps/mobile && flutter run
```

`10.0.2.2` is the emulator's route to the host machine — `localhost` inside the emulator is the
emulator itself. That is the development default, so no flags are needed for the common case.

### Pointing at another environment

Configuration comes from `--dart-define` only; nothing environment-specific is committed in source.

```bash
flutter run --dart-define=APP_ENV=staging
```

```bash
flutter run --dart-define=APP_ENV=production --dart-define=API_BASE_URL=https://api.gulyaly.pro/api
```

**On a physical device, always pass these.** With no `--dart-define` the environment is
`development`, whose default host is `http://10.0.2.2:4000/api` — the emulator's view of the
host machine, and nothing at all on a real phone. The app then fails every request instantly and
the symptom looks like a server outage rather than a build mistake. Outside production the splash
prints the base URL it tried, which is the quickest way to spot it.

```bash
```

| Define | Default | Notes |
| --- | --- | --- |
| `APP_ENV` | `development` | `development` \| `staging` \| `production`. Also gates request logging. |
| `API_BASE_URL` | per-environment (see [`app_config.dart`](../apps/mobile/lib/core/config/app_config.dart)) | Must include the `/api` suffix — it is part of the path on this backend, not the host. |

**A physical device on the same Wi-Fi** cannot reach `10.0.2.2`. Pass the machine's LAN address
and add that exact origin to the API's `CORS_ORIGINS`:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.42:4000/api
```

## Checks

```bash
cd apps/mobile && flutter analyze
```

```bash
cd apps/mobile && flutter test
```

Both must be clean before a commit. There is no CI job for the mobile app yet — worth adding.

### Before shipping

```bash
cd apps/mobile && flutter build apk --release
```

**Run this, not just the debug build.** The debug variant hides an entire class of problem: it
inherits `INTERNET` from Flutter's own debug manifest, signs with the debug key by design, and
skips R8 and the release resource merge. Every one of the release blockers fixed in Phase 6 was
invisible to `--debug` and obvious on the first `--release`.

## Building

```bash
cd apps/mobile && flutter build apk --debug
```

### Release

A release build is signed with a real key or not at all — there is deliberately **no fallback to
the debug key**, because a debug-signed APK cannot go to Play and, if sideloaded, is signed by a
key that ships with every Android SDK on earth.

Create the keystore once, on the machine that will cut releases:

```bash
keytool -genkey -v -keystore ~/gulyaly-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias gulyaly
```

**Back that file up somewhere that survives the laptop.** Losing it means losing the ability to
ship an update Play will accept — the only remedy is publishing a new app under a new id.

Then copy `apps/mobile/android/key.properties.example` to `apps/mobile/android/key.properties`
and fill it in. That file and any `*.jks` / `*.keystore` are git-ignored; the passwords never
enter the repository.

```bash
cd apps/mobile && flutter build appbundle --release --dart-define=APP_ENV=production
```

An App Bundle rather than an APK: Play requires it, and it ships each device only the code and
resources it needs. R8 is on for release (`isMinifyEnabled` + `isShrinkResources`), so add any
new reflection-reached class to `android/app/proguard-rules.pro`.

Add `--obfuscate --split-debug-info=build/symbols` when you are ready to keep symbol files — the
Dart stack traces in crash reports are then unreadable without them, so archive that directory
alongside each release.

### Store identity

| | |
| --- | --- |
| Application id | `pro.gulyaly.app` |
| Display name | Gulyaly (Android and iOS) |

The application id is permanent after the first publish. It was changed from the scaffolded
`pro.gulyaly.gulyaly_mobile` before release for exactly that reason.

## What secrets go in the app

None. There is no server secret a mobile binary can keep — anything shipped in an APK is readable
by anyone who downloads it. `AppConfig` carries only the API base URL and the environment name.
Tokens are runtime values and live in the platform keystore, never in source, never in
`SharedPreferences`, and never in a log line.
