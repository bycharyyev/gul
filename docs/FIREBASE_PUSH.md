# Firebase push notifications

The application uses Firebase project `gulyaly-push-20260920` (`Gulyaly`). Firebase configuration
files and service-account credentials are deliberately excluded from Git.

## Android

1. In Firebase Console, add an Android app with package name `pro.gulyaly.app`.
2. Download `google-services.json` to `apps/mobile/android/app/google-services.json`.
3. Do not force-add that file: `.gitignore` excludes it.
4. Build with `flutter build apk --debug` or the normal release pipeline.

The application requests `POST_NOTIFICATIONS` on Android 13+, registers the FCM token after login,
updates it when Firebase rotates it, shows foreground messages on the `gulyaly_general` channel,
and handles notification taps carrying a safe in-app `route` value.

## iOS

1. In Firebase Console, add an iOS app with bundle id `pro.gulyaly.gulyalyMobile`.
2. Download `GoogleService-Info.plist` to `apps/mobile/ios/Runner/GoogleService-Info.plist`.
3. In Apple Developer, enable Push Notifications for the App ID and create an APNs authentication
   key. Upload that key in Firebase Console → Project settings → Cloud Messaging.
4. Open `Runner.xcworkspace` on macOS and confirm the Push Notifications capability and Background
   Modes → Remote notifications are enabled. The tracked entitlements and `Info.plist` already
   contain the required values.

An iOS build cannot be produced or signed on Windows. Validate it on macOS with:

```bash
cd apps/mobile
flutter build ios --no-codesign
```

## API credentials

The API accepts either Google Application Default Credentials or a base64-encoded service-account
JSON supplied only through the environment:

```text
FIREBASE_PROJECT_ID=gulyaly-push-20260920
FIREBASE_SERVICE_ACCOUNT_BASE64=<base64 of the complete service-account JSON>
```

On PowerShell, produce the value without writing another plaintext copy:

```powershell
$bytes = [IO.File]::ReadAllBytes('firebase-service-account.json')
[Convert]::ToBase64String($bytes)
```

Put the result in `/opt/gul/.env` on the VPS and recreate the API container. Never place it in a
GitHub variable, command history, issue, log, or committed `.env` file. A GitHub Actions secret is
appropriate only if the deployment workflow needs the value directly.

## API

- `POST /api/notifications/devices` registers or refreshes the current user's device.
- `DELETE /api/notifications/devices/:token` removes only a token owned by the current user.
- `POST /api/notifications/test` is ADMIN-only and limited to three requests per minute.

Test request after a real device has logged in and registered its token:

```bash
curl -X POST https://api.gulyaly.com/api/notifications/test \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"userId":"REAL_USER_ID","title":"Gulyaly test","body":"Push delivery works","data":{"route":"/home"}}'
```

A successful HTTP response proves only that FCM accepted the request. Completion requires checking
that the notification appears on a real Android device and a real iPhone in foreground, background,
and terminated states, and that tapping it opens the requested route.

## Verification

```bash
pnpm --filter @topup-hub/api typecheck
pnpm --filter @topup-hub/api test -- --runInBand src/notifications
cd apps/mobile
flutter analyze
flutter test
flutter build apk --debug
```

Production deployment also runs `prisma migrate deploy`, creating the `PushToken` table before the
new API starts serving traffic. Invalid and unregistered FCM tokens are removed after a failed send;
token values are never written to application logs.

## Notification format and events

Every push carries `category`, `title`, `body`, `route`, and optionally `imageUrl` and `tag`
(`apps/api/src/notifications/push-message.ts`). Android receives a **data-only** message and the app
draws the notification itself (`push_notification_builder.dart`): the picture becomes a round
centre-cropped large icon, the Gulyaly mark is the status-bar icon, and there is one channel per
category so a person can silence one section. A system-drawn notification cannot show a round
contact-style picture, which is why the `notification` block is not used. iOS receives a normal
alert with `mutable-content`; showing the picture there needs a notification service extension
(not built yet).

| Category | Who is notified | Picture |
|---|---|---|
| `orders` | the buyer, when a top-up order completes or fails | service logo (e.g. PUBG Mobile UC) |
| `gallery` | the buyer on status change; the shop owner on a new order | product photo |
| `cargo` | the shipment owner on meaningful status changes | Gulyaly logo |
| `support` | the customer, on a reply from platform support | Gulyaly logo |
| `chat` | other members of a group or channel; either side of a shop conversation | group picture or sender avatar |
| `feed` | a post's author on a like, or on a comment once moderation publishes it | commenter avatar |

Producers call one fire-and-forget method on `PushEventsService` after their own write succeeds; it
never throws. Every event has a unit test; only the top-up order path has been exercised on a real
phone so far.

## Things that stop a notification arriving on Android

- **A freshly installed app is in the "stopped" state** until it is opened once; Android delivers
  nothing to it before that.
- **Swiping the app away is fine, "Force stop" is not.** A force-stopped app receives no push until
  the user opens it again.
- **Xiaomi/MIUI and some other vendors** restrict background apps. On those phones the user may need
  to enable "Autostart" and set battery saver to "No restrictions" for Gulyaly, otherwise data
  messages can be held back. This is a reason to keep a `notification` block fallback under review
  if delivery on such phones proves unreliable.

## App updates (Remote Config)

The API never blocks an old app: it keeps working against the server, and the app is only asked
(or, for a security fix, required) to update. Set these in the Firebase console -> Remote Config and
publish. The app reads them at start (at most every 3 hours) and running apps get changes at once.

| Level | Parameters | What people see |
|---|---|---|
| 1. Recommended | `latest_app_version` = `1.1.0` | Dismissible card "a new version is available" with an update button, on builds below it |
| 2. Required by a date | `min_app_version` = `1.0.8` and `update_deadline` = `2026-10-05T00:00:00Z` | Card "required by 05.10.2026" until the deadline, then a blocking screen. The screen appears on time even if the app stays open |
| 3. Urgent | `min_app_version` = `1.0.8`, `update_deadline` empty | Blocking "update the app" screen straight away (a security fix) |

`update_url` (https) is where the update button leads. Precedence: the minimum wins over the
recommendation. A malformed version is ignored; a malformed deadline counts as "now", so a typo can
never delay an urgent fix. To lift a block, publish an empty value or a lower version.

`maintenance_message` shows a dismissible notice to every user while it is non-empty.

For a leak in the **API**, fix the endpoint on the server: that protects old apps too. The update
levels above are for problems inside the app itself.

## Other Firebase services in the app

All run on the free Spark plan. Crashlytics, Analytics and Performance collect **in release builds
only**, so a developer's device never pollutes the production data.

| Service | What it does here | Notes |
|---|---|---|
| Crashlytics | Fatal Flutter and platform errors, tied to the opaque user id | A test crash reached the console on 2026-09-21 |
| Analytics | Lifecycle events and the opaque user id | Never a phone, name, e-mail or notification token |
| Performance | Start-up and screen timing | SDK only; the Gradle plugin was left out because it hung the release build, so per-request network timing is not collected |
| Remote Config | The update levels above and `maintenance_message` | Fetched at most every 3 hours; a running app receives changes at once. Free up to 100,000 fetches a day |

Parameters (Firebase console, Remote Config): `min_app_version`, `latest_app_version`,
`update_deadline`, `update_url`, `maintenance_message`. All default to empty, which means "off".

