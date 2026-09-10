# Mobile app — architecture

The Gulyaly customer app ([`apps/mobile`](../apps/mobile), package `gulyaly_mobile`). This
document is the decision record: what the layers are, and why each non-obvious choice was made.

Running it: [MOBILE_SETUP.md](MOBILE_SETUP.md). What the backend can and cannot do:
[MOBILE_API_MAP.md](MOBILE_API_MAP.md) and [MOBILE_API_GAPS.md](MOBILE_API_GAPS.md).

**Status: all six phases complete.** Skeleton, networking, secure storage, authentication and
routing; home, order history and detail, profile; the top-up flow; the gift catalogue and its
checkout; referral and support; release hardening and accessibility.

**Notifications were not built — there is no backend for them at all** (GAP 1). That is the one
part of the brief that is a server project, not a mobile one.

---

## Layers

```
lib/
  app/          providers.dart, router.dart, app.dart, shell.dart  -- wiring, no domain logic
  core/
    config/     AppConfig                                -- --dart-define only
    errors/     AppException, ErrorMapper                -- the single error type the UI sees
    format/     Money, Dates                             -- decimal-string parsing, locale output
    l10n/       Strings, StringsScope                    -- ru / en / tkm
    network/    ApiClient, AuthInterceptor, TokenRefresher
    storage/    TokenStore (Keychain / EncryptedSharedPreferences)
    theme/      AppTheme                                 -- palette shared with apps/web
    widgets/    AsyncView, EmptyState, ErrorBanner, RemoteImage, Skeleton, StatusChip
  features/
    auth/       data/  domain/ (User)  presentation/ (login, register, splash, controller)
    home/       data/  domain/ (CatalogService, Promo)  presentation/ (+ widgets/)
    orders/     data/  domain/ (OrderSummary)  presentation/ (list, detail)
    profile/    data/  domain/ (EmailStatus, ReferralSummary)  presentation/ (+ 3 forms)
    topup/      data/  domain/ (Rate, PaymentMethodOption, TopupEstimate)  presentation/
    gallery/    data/  domain/ (GalleryProduct, GalleryCategory)  presentation/ (list, product, checkout)
    support/    data/  domain/ (SupportThread, SupportMessage)  presentation/ (chat, controller)
```

The dependency direction is one-way: `presentation` → `data` → `core`. A screen never sees Dio, a
`DioException`, or a raw JSON map; a repository never sees a widget.

---

## The decisions worth recording

### Riverpod, hand-written notifiers

State is Riverpod 2 with plain `StateNotifier`s. Riverpod's code generation is deliberately not
used: it adds a `build_runner` step to every change for providers that are three lines each.

**The provider cycle.** `ApiClient` must tell `AuthController` when a session dies; `AuthController`
needs `ApiClient` to make requests. The cycle is broken by handing the client a callback that
resolves the controller lazily at call time (`ref.read`, not `ref.watch`). Dart still refuses to
*infer* a top-level type through the cycle (`top_level_cycle`), so all three providers carry
explicit variable type annotations — that is why they look verbose.

### Single-flight token refresh

The backend rotates refresh tokens single-use: a successful refresh revokes the token that was
presented. Five parallel requests hitting 401 at once would therefore fire five refreshes, the
first would succeed, and the other four would present a revoked token and sign the user out
mid-session.

`TokenRefresher` holds one in-flight future; every concurrent caller awaits the same one:

```dart
Future<AuthTokens?> refresh() =>
    _inFlight ??= _performRefresh().whenComplete(() => _inFlight = null);
```

This is correctness, not an optimisation, and it is covered by a test that starts five refreshes
before any can complete and asserts exactly one HTTP call.

**Refresh failures are classified, not lumped together.** A 401/403 means the token is spent —
clear it. Anything else (offline, 500) is transient and the tokens are kept: signing someone out
because their train entered a tunnel is a worse bug than a retry.

The refresh call goes out on a **separate Dio instance without the auth interceptor**, so a 401 on
the refresh itself cannot recurse into another refresh.

### Tokens live in the platform keystore

`flutter_secure_storage` with `encryptedSharedPreferences: true` on Android and
`first_unlock` accessibility on iOS. Never `SharedPreferences` — a refresh token there is readable
by anything that can read the app's files, which on a rooted device is everything. Tokens are
cached in memory as well, because every request reads the access token and a keystore round-trip
per request is a real cost on Android.

### One error type, one place that creates it

`ErrorMapper` turns every `DioException` and non-2xx response into an `AppException` with a
coarse `AppErrorKind` the UI can branch on. Two details that came from production bugs on the web
client:

- Nest's `ValidationPipe` returns `message` as an **array**, not a string. Reading it as a string
  produced `"a,b"` with no space and silently broke error translation app-wide. `extractMessage`
  handles both shapes.
- The backend's own message wins over any generic client copy when one is present — it is already
  localised and specific ("Неверный код" beats "Что-то пошло не так").

### Logging never includes bodies or headers

The request logger prints method, path and status. Request bodies carry passwords and OTP codes;
the `Authorization` header carries a bearer token. A log that is safe everywhere is worth more
than one that is occasionally richer. Logging is off entirely when `APP_ENV=production`.

### Routing: the guard is a pure function

`AuthStatus` has three states, not two — `unknown` exists so the router parks on the splash while
the stored session is validated, instead of flashing the login screen at an already-signed-in
user. The whole guard is `guardRoute({status, location})`, a pure function, so the routing rules
are unit-tested without pumping a widget tree.

Screens never navigate after a successful login: the status flips, and the router's redirect
moves. A `context.go` in the callback as well would race it.

### Session restore is started, not awaited

`main()` fires `restore()` without awaiting it. Awaiting would hold the native splash for a full
`/auth/me` round-trip — up to 30 s on a bad connection — with nothing on screen. Instead the app
paints immediately and the router moves when the status resolves. `restoreSession()` is written to
never throw, including the keystore read: a device whose keystore is unavailable (it happens after
some OS upgrades) must land on the login screen, not a splash that never ends.

### Localisation is a map, not ARB

`ru` / `en` / **`tkm`** — note `tkm`, not the ISO `tk`; the API validates
`@IsIn(["ru","en","tkm"])` and rejects `tk`, so the app must not "correct" it on the way out.

Copy is resolved through `StringsScope` (an `InheritedWidget`), not `Localizations.localeOf`,
because `flutter_localizations` has no `tkm` and asking `GlobalMaterialLocalizations` to load it
fails. Material's own widgets get `materialLocale` instead, which maps `tkm` → `ru`. A test asserts
all three locales define exactly the same key set, since a key added to `ru` alone would silently
render Russian to an English speaker with nothing failing.

Moving to gen-l10n later is a swap: `Strings.of(context).get(key)` is the same call shape.

### Client-side validation mirrors the backend's own rules

Phone `@Length(6, 20)`, registration password `@Length(8, 72)` — the same bounds the DTOs enforce,
so the common mistake is caught without a round-trip and without an English class-validator string
reaching the user. Login does **not** enforce the 8-character minimum: that rule belongs on
registration, and applying it at login would lock out anyone whose password predates it.

The phone field filters to `[0-9+]` with an `inputFormatter`. `keyboardType: phone` is only a
hint — a hardware keyboard, a paste, or a swipe keyboard can all deliver letters. This is the same
class of bug that reached production on the web password-reset form.

### Double submission is stopped in the controller, not only the button

The submit button disables itself while `busy`, but a fast double-tap can land two gestures before
the first rebuild. `AuthController._run` refuses to start while a request is in flight, so two taps
can never create two accounts.

---

## Phase 2 decisions

### Money arrives as strings, and the client never does arithmetic on it

Verified against production: **Prisma serialises every `Decimal` as a JSON string** —
`{"minAmountTmt":"5"}`, `{"priceTmt":"350"}`, `{"feePercent":"0"}`. A handful of endpoints that
build their response by hand (`/referrals/me`) send a real number instead. `Money.tryParse`
accepts both; typing these as `num` is a runtime crash on the first order screen.

Note this contradicts `packages/types` (`amountTmt: z.number()`), which is a latent bug on the web
side, not a mobile one — flagged, not touched.

Separately: **every monetary value is displayed, never computed.** The backend owns `rateApplied`,
`feeAmount`, `amountCharged` and `referralDiscountTmt`. A second implementation on the client
would eventually disagree with the server about what someone owes, and that is the one bug a
payments product cannot ship.

`tryParse` returns null rather than 0 for a missing field, because "no fee" and "zero fee" are
different lines on a receipt.

### The order list joins two pipelines, and one of them omits its relation

`/orders/me` returns bare rows: a `serviceId` and **no `service` relation**, so the operator name
has to be joined in from `/catalog/services`. `/gallery/orders/me` does include its product. The
two are merged and sorted newest-first, because a customer thinks in "my orders", not in "the
top-up pipeline" and "the gallery pipeline" — the row's icon and semantic label keep them
distinguishable.

Neither endpoint paginates (GAP 2). Everything loads. Correct at today's volume, and the list
layer is shaped so adopting a cursor is a repository change, not a UI rewrite.

### The carousel does not advance by itself

An auto-rotating carousel must carry pause/stop controls, must stop on focus, and must freeze
under reduced motion — and even done correctly it moves content out from under people who read
slowly. Manual swiping removes the entire problem class; the page indicator makes it obvious there
is more.

### Status is an icon, a word and a colour — in that order

Roughly one man in twelve cannot separate the red from the green in a status pill. `StatusChip`
always renders a glyph and a translated word; colour is the third signal, never the only one. A
status this build has never seen renders the server's own value rather than a lookup key, and
never crashes the list.

### Nothing is fetched that nothing renders

`/social-links` was in the first draft of `HomeRepository` and is not any more: no screen shows it
yet, and opening an external URL needs a launcher this build does not ship. It belongs with the
support screen in Phase 5. A request no screen uses is charged to the customer's data plan on
every home load.

### Feature data is keyed to the session

Every feature provider watches `user.id`. Without it, signing out and signing in as someone else
on the same device would show the previous account's orders until something happened to
invalidate the cache.

### Phase 3/4 destinations say so

Tapping an operator tile or a promo shows "coming in the next update" rather than opening a screen
that cannot complete a purchase. Per §52 of the brief, the app must not imply a payment path the
backend does not have — the only registered provider is `ManualPaymentProvider`, and the order
detail screen says exactly that when an order is awaiting payment.

---

## Phase 3 decisions

### The estimate is labelled an estimate

There is no quote endpoint (GAP 10), so the form mirrors `OrdersService.create`'s arithmetic
locally — `subtotal = amountTmt × rate`, `fee = subtotal × feePercent/100`, both rounded the same
way — and shows the result as `≈ 132,50 RUB` under a heading that says "estimate". A test pins the
rounding to the server's, down to the kopeck.

It can only differ in the customer's favour: an available referral balance is deducted server-side
at creation time, so the real figure comes out lower. The order screen then shows the server's
`amountCharged`, which is the number that counts.

### Nothing about the order is computed on the way out

`POST /orders` carries exactly the five fields `CreateOrderDto` declares — `serviceId`,
`paymentMethodId`, `recipientIdentifier`, `amountTmt`, `currency`. No rate, no fee, no total. A
test asserts the request body's key set for precisely this reason.

### `/payments/orders/:id/initiate` is deliberately not called

The only registered provider is `manual`: `initiate` returns
`{ providerRef: "manual_<uuid>", redirectUrl: null }`, and the admin confirmation path never reads
the `Payment` row it writes. The shipped web storefront does not call it either, so both clients
behave the same. When a real gateway is registered this is the one line that changes — initiate
then, and follow the `redirectUrl`.

The button therefore says **"Create order"**, not "Pay 132,50 RUB". The web storefront's
`Pay {amount} {currency}` label promises a charge the manual flow does not perform.

### Recipient validation comes from the server

Each service carries a `validationRegex` the backend compiles and enforces. The app applies that
same pattern rather than hardcoding a Turkmen phone format per operator — the two would drift the
first time an operator changed. Two guards around it: an empty string is treated as *no pattern*
(the admin console writes `""` for unset, and an empty regex matches everything), and a pattern
Dart cannot compile is skipped rather than blocking every order for that operator over the
catalogue's own bad data.

`inputType` picks the keyboard: `PHONE` gets the dialpad and a digits-only filter; `ACCOUNT_ID`
gets a text keyboard, because forcing digits on an alphanumeric id is a trap.

### Currencies come from the service's rates, not the enum

`CurrencyCode` has six values, but `POST /orders` rejects any currency the service has no enabled
`Rate` for. The picker is built from `GET /catalog/services/:id/rates`, so it cannot offer a
choice the server will refuse. Switching operator clears the chosen currency and the recipient for
the same reason.

### Amounts accept both decimal separators

`25,5` and `25.5` both parse. People here type the comma, and a form that rejects it blames the
user for a locale difference.

---

## Phase 4 decisions

### The API map was wrong, and filtering belongs on the server

`GET /gallery/products` **does** take `categoryId`, `sellerId` and `search` — an earlier note in
`MOBILE_API_MAP.md` said it took none. `search` is a case-insensitive `contains` across `name` and
`sku`; verified live, Cyrillic included (`?search=роз` → 1 result, `?search=FLW` → 2). The map is
corrected and the app filters server-side. Filtering a downloaded list would work today at five
products and quietly stop working when the catalogue is real.

Search is debounced 350 ms. Without it, typing "роз" is three requests racing each other back.

### One product per order, no cart

`POST /gallery/orders` takes exactly one `productId` and creates one order with one delivery and
one status. A client-side cart would turn a single purchase into N orders, N deliveries and N
statuses — not what the customer thinks they bought. That is GAP 4's recommendation and this
follows it rather than faking the feature.

### No price is sent

`CreateGalleryOrderDto` has no price field: the server reads it from the product. A test asserts
the request body's key set contains neither `amountTmt` nor `priceTmt`. A client that can name its
own price is a client that can be told to name zero.

### The product screen fetches a whole list to show one row

There is no `GET /gallery/products/:id` (GAP 3), so `loadProduct` fetches the unfiltered list and
picks the row out of it. Wasteful and honest — inventing the endpoint would be worse, and the
screen normally opens from a list that already holds the object. A product disabled between the
list and the tap resolves to null and says so, rather than rendering a blank screen.

### A gift order's detail had a race, now fixed

`orderDetailProvider` used to read `ordersProvider`'s **cached** value. After creating a gift
order the list is invalidated and still refetching, so the lookup missed and the fallback called
`GET /orders/:id` — the *top-up* endpoint — with a gallery order id, which 404s. It now awaits the
list (guarded, so a failing list still lets a top-up be fetched directly), and the checkout awaits
the refetch before navigating.

### Categories fail soft

If `/gallery/categories` fails the catalogue still browses, just unfiltered. Losing a filter is
not worth losing the shop.

---

## Phase 5 decisions

### Notifications were not built

The brief asks for a notification list, an unread count and mark-read. **None of it exists on the
backend** — no `/notifications` route, no `Notification` model, no device-token storage, no push
credentials (GAP 1). Sellers get Telegram messages; customers get email. Neither is reachable from
a mobile client.

So the app ships no bell icon and no badge. A notification centre backed by nothing would be an
empty screen that never fills, and faking it against a polled order list would be a different
feature wearing its name. This is the one part of the brief that is a backend project, not a
mobile one.

### Support polling is tied to the visible screen, because fetching has a side effect

There is no `?sinceMessageId=`, no SSE and no push (GAP 7/12), so the chat polls
`GET /support/thread` every 15 seconds. Three rules keep that honest:

* it runs only while the screen is mounted **and** the app is in the foreground —
  `WidgetsBindingObserver` stops it on `paused`;
* a poll never shows a spinner and never clears what is on screen; a failed poll is swallowed once
  the thread has loaded, because a dropped packet must not replace a readable conversation with an
  error page;
* overlapping fetches collapse into one, so a slow request cannot stack up behind the timer.

The lifecycle rule is not only about battery. `getMyThread` **marks staff messages
`readByCustomer: true` as a side effect of reading** — polling in the background would mark
messages read while the phone is in someone's pocket.

A sent message triggers a refetch rather than being appended locally: the server owns ids and
timestamps, and a locally built message would disagree with the very next poll.

### An unknown sender role is never "mine"

Chat bubbles are sided by sender. A `senderRole` this build has not been taught about renders on
the *other* side — showing someone else's message where the user's own messages appear would look
like something they wrote themselves.

Side is not the only signal: the squared-off corner points at the sender, so the two are still
distinguishable in grayscale, and staff/seller bubbles carry a written label.

### The referral screen does not name a number

`ReferralSettings.customerRewardTmt` is only readable through an ADMIN/MANAGER route, so the app
has no honest figure for "how much do I get?" and says the shop sets the amount instead. Inventing
a number would be a promise the product might not keep. Written up as GAP 11, along with the
related problem that the app cannot tell whether the programme is switched on at all.

The share sheet sends the **code**, not a link: there is no landing route that captures a referral
code yet (GAP 6), so a URL would be a promise the web app cannot keep.

---

## Phase 6 decisions

### The release build could not have worked at all

Flutter's project template declares `android.permission.INTERNET` **only in the debug and profile
manifests**, for the tool's own hot-reload channel. `main/AndroidManifest.xml` had none — so a
release build shipped without it, and this app is nothing but an API client. Every request on a
store build would have failed. The permission now lives in `main`, where all three build types
inherit it.

Three more things the same audit found, all of them defaults nobody had revisited:

* **the app was called `gulyaly_mobile` on the home screen** — the label was still the package
  name, on Android and (as "Gulyaly Mobile") on iOS;
* **the release build was signed with the debug key** — the scaffold's `TODO` fallback. That APK
  cannot go to Play, and sideloaded it is signed by a key that ships in every Android SDK.
  Signing now reads `android/key.properties` (git-ignored) and there is deliberately **no
  fallback**;
* **the application id was `pro.gulyaly.gulyaly_mobile`.** An application id is permanent after
  the first publish, so before release was the only free moment to make it `pro.gulyaly.app`.

**All five had the same root cause: the release build had never been run.**  It took three
attempts to get one out, and neither failure was in app code: first `--` inside an XML comment in
the two resource files added above (illegal XML, compiled only by the release resource merge),
then the Gradle daemon crashing outright — Flutter's template sets `-Xmx8G -XX:MaxMetaspaceSize=4G`
in `gradle.properties`, which is more than an ordinary machine can reserve, and R8 (release only)
is what finally asks for it. Lowered to 3 GB, which also fits a typical 7 GB CI runner. Every phase verified
itself with `flutter build apk --debug`, and the debug variant hides exactly these problems — it
inherits INTERNET from Flutter's own debug manifest, signs with the debug key by design, and skips
R8 entirely. `flutter build apk --release` is now part of the pre-release checklist in
[MOBILE_SETUP.md](MOBILE_SETUP.md), and it earned its place immediately: the first run also failed
on `--` inside an XML comment in the two resource files added above, which is illegal XML and
which only the release resource merge compiles.

### Cleartext is off everywhere except one host, in debug only

`network_security_config.xml` sets `cleartextTrafficPermitted="false"` as the base policy. The
single exception is `10.0.2.2` / `localhost` — the emulator's route to a developer's own machine,
where the API runs over plain HTTP. User-installed CA certificates are trusted only inside
`<debug-overrides>`, which the platform applies **only to a debuggable application** — a release
build carries no `android:debuggable` flag, so that block is inert there. (The block is not
stripped from the file; it simply never applies. Verified on the built release manifest.)

Verified on the merged release manifest of an actual `--release` build:

```
android:label="Gulyaly"
android:name="android.permission.INTERNET"
android:allowBackup="false"
android:usesCleartextTraffic="false"
android:networkSecurityConfig="@xml/network_security_config"
package="pro.gulyaly.app"
```

The resulting APK is **51.9 MB against 176 MB for debug**, and contains no signature block at all —
which is the proof that the debug-key fallback is really gone.

### Nothing is backed up

`allowBackup="false"` plus explicit `data_extraction_rules.xml`. The app stores exactly one thing:
the refresh token, in EncryptedSharedPreferences whose key lives in the hardware Keystore — which
is *not* part of a cloud backup. A restored copy would be undecryptable at best and a live session
on someone else's device at worst. Signing in again costs a second.

### R8 is on, and logging is stripped

`isMinifyEnabled` + `isShrinkResources` for release, with keep rules for the Flutter embedding and
`androidx.security.crypto` (both reached reflectively). `proguard-rules.pro` also strips
`android.util.Log` d/v/i calls outright — the app never logs a body or a header, but an accidental
future one should not reach a user's device log either.

### The lints were doing less than they looked

`flutter_lints` alone tolerates a dangling future, a `BuildContext` used after an `await`, and a
missing `const`. All three are now errors or lints: `unawaited_futures` and
`use_build_context_synchronously` as **errors**, plus the `prefer_const_*` family, `close_sinks`,
`cancel_subscriptions` and `require_trailing_commas`. The existing code came through with one
finding, which is the point of turning them on before the codebase grows.

### Four layout bugs at the largest system text size

`test/a11y/text_scale_test.dart` pumps real screens at `TextScaler.linear(2.0)` on a 360dp phone —
Android's accessibility slider reaches 2.0, and Russian and Turkmen copy is longer than the
English these layouts were eyeballed in. A Flutter overflow is a framework error, so "it pumps
cleanly" is the whole assertion. It found:

| Where | What |
| --- | --- |
| `StatusChip` | the status word overflowed its own pill — unreadable for exactly the person who enlarged the text |
| `OrderTile` | a four-figure amount beside a long operator name overflowed the row by 173px |
| `EstimateCard` | "К оплате" and the total no longer share a line; now a `Wrap` |
| `ProductCard` | a fixed 0.66 aspect ratio clipped the card; the grid cell is now sized from the text scale and the photo yields the space, not the words |

The one thing not fixed by flexing text: amounts are **wrapped, never ellipsised**. Truncating a
number the customer is checking is worse than a second line.

### The security sweep found nothing to change

Three `developer.log` calls, all inside the API client's log interceptor, which is only installed
when `APP_ENV != production`, and which prints method, path and status — never a body or a header.
No hardcoded host outside `AppConfig`. The strings `accessToken` / `refreshToken` appear in
exactly four files, all in the network and storage layers: no screen can reach a token.

---

## The Crystal redesign

The first six phases built a correct app that looked like a form: flat white cards on flat grey,
a hard-edged bottom slab, a referral panel shouting at the top of Home. Correct is not the same as
finished.

### Three ideas, applied everywhere

* **An ambient ground.** Soft violet/rose/teal radial washes replace flat grey, painted **once at
  the app root** rather than per screen. Surfaces now sit *on* something instead of merging into
  it.
* **Translucent surfaces.** Cards are white at 78–86% over that wash with a hairline light border.
  Depth comes from layering, not from a shadow drawn on nothing.
* **Air.** 20–28dp radii, a wider spacing rhythm, a heavier and tighter type scale.

The brand hues did not change. A customer moving between `gulyaly.pro` and the app has to
recognise one product.

### Real blur is used in exactly one place

`BackdropFilter` is the most expensive thing in this design language. It is on the floating
navigation bar and nowhere else — that surface overlaps scrolling content, which is what makes
glass read as glass. Every other "glass" surface is translucency over the ambient ground, which
costs nothing. A phone that stutters while scrolling a product grid has not been made to feel
premium; it has been made to feel cheap.

### The banner advances itself, with every obligation met

Auto-advance was asked for, and it is the one carousel behaviour with real accessibility duties
attached. All of them are implemented, and each has a test:

| Duty | How |
| --- | --- |
| A visible pause control | A labelled 44dp button on the card — not a hidden gesture |
| Stops on interaction | A drag pauses the timer permanently; content must not slide away mid-read |
| Never runs under reduced motion | `MediaQuery.disableAnimationsOf` gates the timer entirely |
| No timer when it changes nothing | A single banner has no timer and no controls |

Transition is a 650ms eased drift rather than a hard slide: eight seconds apart, a slide reads as
the screen jumping on its own.

### Stories became their own shape

They used to render through the same carousel as the banner — two identical components stacked on
one screen, with no way to tell what either was for. Now they are a row of tall portrait cards
with a brand ring, opening full screen. No auto-advance there: that row is browsed, not watched,
and motion belongs to the banner above it.

### The navigation bar is soft, and knows who you are

A floating pill inset from the edges, frosted, with a sliding indicator — instead of a full-width
slab with a hard top line. Five destinations, each keeping its label.

The profile destination shows the customer's **own avatar** when they have one. A face is
recognised faster than any glyph and answers "am I signed in as me" without a tap. With no photo
the person icon stays; an empty circle would read as a broken image.

Avatars are editable from Profile: gallery, camera, or remove. The picker downscales to 1024px
before upload because `POST /avatar` rejects anything over 5 MB and a modern phone camera exceeds
that — sending the original would mean a long upload on a mobile connection ending in a rejection,
which is the worst possible order of events.

### Referrals live in one place now

The balance card was the loudest thing on Home and is not what anyone opens the app to do. It is
gone from there; the profile's referral card is the single home for the code, the balance and the
stats. One place means one answer to "where is my code".

### Legal pages: a reader, not a browser

Privacy, offer and FAQ come from `GET /content-pages/:slug` — the same text the website renders,
with per-locale variants and a fallback to the base language, because an untranslated override
means "not written yet", not "empty page".

The text is wrapped in a small theme-matched stylesheet and shown in a WebView with
**`onNavigationRequest` returning `prevent` for everything**. Pointing the WebView at
`gulyaly.pro/pages/privacy` would have dragged the site's header, footer and menu into the app —
someone asked to read one page, not to browse the storefront inside a tab. JavaScript is off and
the content is escaped, so an admin-authored page cannot execute anything.

### Social links open outside

`GET /social-links`, rendered as chips on Profile, opened with `url_launcher` in the real app or
browser. Instagram and TikTok both detect an embedded WebView and refuse to sign anyone in, so an
in-app browser here would be a link that visibly fails. Non-`http(s)` URLs are refused outright:
a CMS field must not be able to fire arbitrary intents.

This also closes the old "no external-link launcher" gap — `EXTERNAL_URL` promos now work too.

### Unavailable data hides or offers a retry, never breaks the page

* Social links fail **soft to an empty list** and render nothing. An error about something nobody
  was looking for is noise on the screen someone opened to sign out.
* An empty banner or story list removes its section rather than leaving a blank band.
* An empty legal page says so instead of showing a white screen the customer will read as a bug.
* Everything with a real failure — the home payload, a legal page, the catalogue — keeps the
  `AsyncView` retry it already had.

---

## Testing

167 tests, `flutter analyze` clean under the stricter rule set, debug APK builds.

| Area | What it pins down |
| --- | --- |
| `token_refresher_test` | five concurrent 401s → exactly one refresh; 401 clears, 500 does not |
| `error_mapper_test` | status → kind; string **and** array `message`; retryability |
| `user_test` | serialization, missing optional fields, unknown role, value equality |
| `auth_controller_test` | restore, login success/failure, double-tap guard, logout when storage fails |
| `router_guard_test` | every (status × location) pair, including unknown routes |
| `login_screen_test` | validation before any request, digit filtering, disabled-while-busy, error copy |
| `strings_test` | locale normalisation, `tkm` → `ru` for Material, locale key parity |
| `strings_usage_test` | scans `lib/` — no key defined but unused, none used but undefined |
| `money_test` | string **and** numeric decimals, null ≠ 0, grouping, `tkm` fallback |
| `promo_test` | schedule window, `isActive`, unknown link types, `""` treated as absent |
| `order_test` | both pipelines' shapes, optional money fields, unknown status preserved |
| `orders_repository_test` | catalogue join, deleted service, merge order, undated rows last |
| `orders_screen_test` | skeleton → data, status word rendered, empty state, retry on failure |
| `topup_estimate_test` | the server's formula and rounding, both decimal separators, rate/method parsing |
| `topup_repository_test` | the request body carries exactly the five DTO fields and nothing computed |
| `topup_screen_test` | server regex enforced, bounds enforced, live estimate, lands on the order |
| `gallery_repository_test` | filters go to the server, no price in the order body, missing product → null |
| `gallery_screen_test` | category filtering, 350 ms search debounce, two distinct empty states |
| `gallery_checkout_test` | required fields, details sent, input survives a failure, lands on the order |
| `support_message_test` | the three sender roles, an unknown role is never "mine", the `{thread, messages}` envelope |
| `support_controller_test` | failed poll keeps the conversation, overlapping fetches collapse, send refetches |
| `referral_screen_test` | never names a reward, seller cannot rename, bound checked before the request |
| `a11y/text_scale_test` | six real screens pumped at 2× system text with no overflow |
| `promo_carousel_test` | auto-advance, wrap-around, reduced motion, pause, drag-to-stop, single slide |
| `legal_page_test` | locale fallback to the base language, unwritten page, unusable social URLs |

Widget tests override the *repository* provider rather than the HTTP layer, so nothing touches the
platform keystore — `flutter_secure_storage` has no implementation in a unit-test binding.

**Two real bugs came out of this.**

The "Нет аккаунта? Зарегистрироваться" row overflowed by 23 px: the Russian copy plus a 48 dp
minimum tap target does not fit a `Row` at phone width, and Turkmen is longer still. Both auth
screens now use `Wrap`.

`strings_usage_test` found five string keys defined and never rendered — including `home.social`,
which was the tell that `HomeRepository` was fetching `/social-links` on every load for a section
that does not exist.

**And a third, in Phase 3.** `topup_screen_test` could not make the submit button do anything. The
cause was real, not a test artifact: the `Form` sat *inside* a lazy `ListView`, so scrolling the
fields out of view disposed them, `formKey.currentState` became null, and pressing submit silently
did nothing. Reachable on any short phone with the keyboard up. Both the top-up form and the three
profile forms now put `Form` outside a `SingleChildScrollView`.

---

## Not done yet

- **No release signing key.** `flutter build apk --release` cannot produce a distributable build.
  (`--debug` does build and is run after each phase.)
- **No external-link launcher**, so `/social-links` and `EXTERNAL_URL` promos cannot be opened.
  Every other promo type now routes to a real screen.
- **No cart** — deliberate, see GAP 4. Single-product checkout only.
- **No notifications and no push** — there is no backend for either (GAP 1). Not a mobile task.
- **Support is polled, not pushed** (GAP 7/12), and every poll transfers the whole thread.
- **No payment instructions exist to show** — see GAP 9. The app says payment is confirmed
  manually, which is true and still leaves the customer without a way to pay.
- **No CI job.** `analyze` and `test` are run by hand. Worth a workflow once Phase 2 lands.
- **No crash reporting**, no analytics.
- **iOS is unverified** — the project scaffolds it, nothing has been built or run on a Mac.
- **No password recovery** — see GAP 8 in [MOBILE_API_GAPS.md](MOBILE_API_GAPS.md); it is
  email-keyed and most customers have no email on file.
- `freezed` / `json_serializable` are declared in `pubspec.yaml` but unused: Phase 1's one model is
  hand-written, and generation earns its keep once there are dozens.
