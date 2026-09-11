# `/.well-known/assetlinks.json`

Android reads this file over HTTPS to decide whether `gulyaly.pro` and the app `pro.gulyaly.app`
belong to the same owner. Until it answers 200 with a matching fingerprint, an invite link
(`/i/<code>`) or a referral link (`/r/<code>`) opens in the browser rather than in the app, and
the `autoVerify` intent filter silently fails verification at install time with no visible error.

## Why two fingerprints

Both are for the same package, and both are legitimate signers of a build a person may have:

- `C1:A9:E0:…:AA:D5` — the **Play app signing key**. Google holds the private half and signs every
  APK it serves, so this is what a store install is signed with. Read from Play Console →
  Защищено Google Play → Подписи приложений.
- `56:C6:27:…:C9:47:CD` — our **upload key** (`~/.gulyaly/upload-keystore.jks`). Nothing from the
  store carries it, but every release APK we build and side-load for testing does. Listing it
  means app links work on a test device too, which is the only place we can check them before a
  release goes out.

Listing a key here grants it nothing beyond opening our own links; the risk of the extra entry is
lower than the cost of not being able to test the feature.

## This file alone does nothing

It is one half of the handshake. The other half is an `<intent-filter android:autoVerify="true">`
in `apps/mobile/android/app/src/main/AndroidManifest.xml` for `https://gulyaly.pro/i/*` and
`/r/*`, plus routing for the incoming link. That half ships with a mobile release; this half is
deployed first on purpose, because Android verifies the domain at install time and a missing file
means the verification fails for every install that happened before it appeared.

## Checking it

```bash
curl -s https://gulyaly.pro/.well-known/assetlinks.json
```

The content type must be `application/json` and there must be no redirect — Android follows
neither a 301 nor an HTML error page.
