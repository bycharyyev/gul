# Email (REG.RU Mail-1)

Outgoing transactional mail (order confirmations, status updates), email verification, and
marketing broadcasts (newsletter).

## How application code sends mail

`emailService.sendTemplate(kind, { toEmail, userId, locale, variables })`. Business logic names
an `EmailKind` and hands over variables — it never builds HTML and never touches SMTP or the
queue. Everything else (sender identity, consent rules, queue priority, which locale's template
to use) is derived from the kind via `EMAIL_KINDS` in `apps/api/src/email/email-kinds.ts`.

### Verified addresses

`User.email` is only set once a code mailed to it comes back (`AUTH_EMAIL_VERIFICATION`, in
`email-verification.service.ts`, exposed at `/api/account/email/{request,confirm}`). Order mail
goes only to a verified address: an unverified one is most likely a typo, and mail to a stranger
who then marks it spam costs sending reputation. The code is 6 digits, hashed at rest, never
logged, valid 10 minutes, capped at 5 attempts with a 60s resend cooldown and 5 requests/hour.

### Password recovery

`/auth/password-reset/request` + `/auth/password-reset/confirm` (`PasswordResetService`). Until
this existed there was no recovery at all — `change-password` needs the current password and login
is phone + password with no second factor, so forgetting it meant permanent lockout.

Security properties worth not regressing:

- **`request` always answers identically** whether the account exists, is unverified, is blocked,
  or hit a rate limit. The endpoint is unauthenticated, so any observable difference makes it a
  membership oracle. `confirm` *is* specific, since by then the caller has proven they hold a code.
- An unverified address is never a route in — it is not proof of control.
- **Every refresh token is revoked on success.** A reset is the moment where the old password must
  be assumed compromised.
- Codes hashed at rest, never logged, 15-min TTL, 5-attempt cap (which rejects even the correct
  code, or it merely slows guessing), 60s resend cooldown, 5/hour, plus a tighter IP throttle than
  other auth routes since each request sends mail.
- `ACCOUNT_PASSWORD_CHANGED` follows, so the account holder learns about a reset they did not
  request. It can never fail the reset itself.

### Seller notifications

`SELLER_NEW_ORDER`, `SELLER_ORDER_CANCELLED` and `SELLER_PAYOUT`, sent from `EmailService`
alongside the existing Telegram messages in gallery order creation, order cancellation and
withdrawal approval.

Email **complements** Telegram rather than replacing it: a seller who never linked a chat
previously received no notification at all. Both are fire-and-forget — neither may fail the
operation that triggered it — and each carries a stable job id so a replayed event notifies once.
Only cancellation is mailed among the status transitions; mailing every intermediate state would
train sellers to ignore the notifications. Delivery is to the seller's verified account address
only, same rule as customer mail.

`SELLER_APPLICATION_RECEIVED` / `SELLER_APPROVED` / `SELLER_REJECTED` fire from
`SellersService`. The application form now **requires** an email, because between "applied" and
"logged in" there was previously no channel at all — Telegram linking needs an approved `Seller`
to issue a code. An approved seller was never told they were approved and a rejected one never
learned why, which is a broken acquisition funnel rather than a missing template.

Two details that are easy to get wrong:

- The address is carried onto the created `User` as **unverified**. Typing it into a form is not
  proof of control, so order and payout mail stays gated on verification; the approval email
  asks them to confirm it.
- `User.email` is unique, so an address already used by another account would otherwise make the
  entire approval fail. The account is created without it instead — approval must not hinge on
  an address collision.

### Templates

Content lives in the `EmailTemplate` table — one row per (kind, locale, version), with
`DRAFT`/`ACTIVE`/`ARCHIVED` status and exactly one ACTIVE per (kind, locale). Locales are
`ru`/`en`/`tkm` (matching `packages/i18n`, so `tkm` not the ISO `tk`). Resolution order is the
user's locale → `EMAIL_DEFAULT_LOCALE` (default `ru`, logs `EMAIL_LOCALE_FALLBACK`) → the
built-in copy compiled into the image (logs `EMAIL_TEMPLATE_BUILTIN_FALLBACK`, recorded as
version 0).

`default-templates.ts` seeds the built-ins once, on boot, for any (kind, locale) with no row.
Existing rows are never overwritten — once a template is in the database the admin panel owns it,
and a deploy must not revert wording someone edited in production.

Managed via `/api/admin/mail/templates` (list/get/preview/save/activate/archive; editing is
ADMIN-only, every save creates a new DRAFT version, and activating archives the version it
replaces so already-sent content stays intact).

**Templating is deliberately not a language.** Only `{{dotted.path}}` plus a presence-only
section `{{#path}}...{{/path}}` for genuinely optional content. No expressions, no calls, no
prototype access; anything else is rejected at save time. A missing required variable throws
*before* SMTP, so a broken template is an alertable error rather than a customer receiving a
literal `{{user.firstName}}`.

### Deploy-window constraint

`deploy.yml` starts the new image and health-checks it **before** running `prisma migrate
deploy`, so a bad build rolls back without ever touching the database. The cost is that new code
runs against the old schema for a minute or two on any deploy that adds a table. Anything that
touches a new table at boot must therefore be non-fatal — this already caused one rollback.
Seeding, template lookup and the consent checks all tolerate a missing table (suppression fails
open so a password reset is never blocked; consent fails closed so unreadable state is never
mistaken for opt-in). Run `restart-api.yml` after such a deploy to let once-at-boot work run
against the migrated schema.

## Architecture

```
Flutter/Web -> Gulyaly API -> business transaction ---+--> EmailOutbox row (same commit)
                                                      |
                                       EmailOutboxProcessor (5s poll, SKIP LOCKED)
                                                      |
                                                      v
                                      EmailService.sendTemplate() -> consent + template
                                                      |
                        +-----------------------------+-----------------------------+
                        v                             v                             v
                 email-critical              email-transactional             email-marketing
                        |                             |                             |
                        +-----------------------------+-----------------------------+
                                                      |
                                    EmailProcessor workers (per-lane rate limit)
                                                                              |
                                                                              v
                                                                     EmailService.sendNow()
                                                                              |
                                                                    SMTP over TLS (Nodemailer)
                                                                              |
                                                                              v
                                                              REG.RU SMTP (mail.hosting.reg.ru:465)
                                                                              |
                                                                              v
                                                        Gmail / Yandex / Mail.ru / Outlook / ...
```

- `EmailService` (`apps/api/src/email/email.service.ts`) is the only place that knows about SMTP.
  Controllers/other services call `sendOrderCreated`, `sendOrderStatusUpdate`,
  `sendMarketingBroadcast`, or `sendTest` — none of them touch SMTP or the queue directly.
- Sends are never made inline inside an HTTP request. Order mail goes through the outbox; other
  kinds enqueue directly. Three BullMQ queues share the Redis instance that already ran
  `topup-queue` — no second queue technology was introduced.
- **Two independent transporters**: "main" (transactional — order mail, REG.RU) and "marketing"
  (newsletter — kept on the old self-hosted Postfix relay, its own SASL login and DKIM
  (`news2026._domainkey.newsletter.gulyaly.pro`), so spam complaints on a broadcast can't affect
  transactional deliverability). Every `MAIL_*_MARKETING` env var falls back to its non-marketing
  counterpart when unset. `sendMarketingBroadcast` is explicitly the only marketing feature —
  no campaign/segmentation system was added; a real ESP is the right tool if that's ever needed.

## REG.RU SMTP config

Confirmed from REG.RU's own docs (not assumed):
[Настройка почтовых клиентов](https://help.reg.ru/support/hosting/nastroyka-pochty-regru/nastroyka-pochty-i-pochtovykh-kliyentovv/nastroyka-pochtovykh-kliyentovv).

| Setting | Value |
|---|---|
| Host | `mail.hosting.reg.ru` |
| Port | `465` (SSL/TLS, used here) — `587` (STARTTLS) also works |
| Login | full mailbox address, e.g. `noreply@gulyaly.pro` |
| Password | the mailbox password set in ISPmanager |

No self-signed cert / cert pinning needed — REG.RU's mail host has a real, publicly trusted
certificate, so `MAIL_TLS_CA_BASE64`/`MAIL_TLS_SERVERNAME` stay empty for the main transporter.

## Required environment variables

Set on the server only (`/opt/gul/.env`), never in Flutter/frontend, never committed. See
`apps/api/.env.example` for the full annotated list. The ones that matter for this cutover:

```
MAIL_HOST="mail.hosting.reg.ru"
MAIL_PORT="465"
MAIL_SECURE="true"
MAIL_USER="noreply@gulyaly.pro"
MAIL_PASS="<mailbox password from ISPmanager>"
MAIL_FROM="Gulyaly <noreply@gulyaly.pro>"

# Keeps the newsletter on the old relay unchanged when MAIL_HOST above moves to REG.RU —
# without these, marketing would silently try to auth against REG.RU with the old relay's
# SASL credentials and fail.
MAIL_HOST_MARKETING="<old self-hosted relay IP/host>"
MAIL_PORT_MARKETING="587"
MAIL_SECURE_MARKETING="false"
MAIL_USER_MARKETING="newsletter"
MAIL_PASS_MARKETING="<unchanged, existing value>"
MAIL_TLS_CA_BASE64_MARKETING="<unchanged, existing value>"
MAIL_TLS_SERVERNAME_MARKETING="<unchanged, existing value>"
```

**Applied in production** on both hosts. `MAIL_REPLY_TO` is set to `support@gulyaly.pro`, since
the per-kind sender identities (`orders@`, `seller@`, `info@`) are unattended and have no
mailboxes — REG.RU accepts them in `From`, but a reply to one would bounce.

## DNS

`gulyaly.pro`'s authoritative DNS is Timeweb (not REG.RU) — see `CLAUDE.md`'s "DNS management"
section. REG.RU's own automatic DNS/DKIM wizard only works when NS points at REG.RU itself, which
we deliberately don't do, so every record below was added manually via `manage-dns.yml`
(`.github/workflows/manage-dns.yml`, Timeweb Cloud API).

| Record | Value | Status |
|---|---|---|
| A `gulyaly.pro` | `DEPLOY_HOST` (site/API, unrelated to mail) | unchanged |
| MX `gulyaly.pro` | `10 mx1.hosting.reg.ru`, `15 mx2.hosting.reg.ru` | live (replaced the old unused `mx1/mx2.timeweb.ru` defaults) |
| SPF (apex TXT) | `v=spf1 include:_spf.timeweb.ru a:mail.gulyaly.pro include:_spf.hosting.reg.ru ~all` | live (merged into the existing record, not a second SPF record) |
| DMARC `_dmarc.gulyaly.pro` | `v=DMARC1; p=quarantine; pct=100; adkim=r; aspf=r` | unchanged, already in place |
| DKIM `dkim._domainkey.gulyaly.pro` | 2048-bit key generated by ISPmanager | live (published manually — see below) |

Only `include:_spf.hosting.reg.ru` was added to SPF (not REG.RU's generic
`a mx ip4:<hosting-ip>` example from their docs) — the app authenticates via SMTP AUTH to REG.RU's
real relay rather than sending directly off our own hosting IP, so only REG.RU's outbound
infrastructure needs authorizing.

### DKIM — published manually

REG.RU's DKIM/DMARC self-service wizard
([Настройка DKIM и DMARC](https://help.reg.ru/support/pochta-i-servisy/pochta-regru/kak-nastroit-dkim-i-dmarc-dlya-pochty))
only auto-publishes records when NS points at `ns1/ns2.hosting.reg.ru`. `gulyaly.pro` stays on
Timeweb NS, so that path was unavailable.

What worked: registering `gulyaly.pro` as a mail domain in ISPmanager with "Enable DKIM" ticked
generates the keypair and then *shows* the exact record to add by hand, precisely because it
detects external DNS. That value was published via `manage-dns.yml`
(`add-dkim-record-regru`), selector `dkim`.

REG.RU also offered a `_dmarc` record with `p=none`. It was **not** added — a DMARC record
already exists at `p=quarantine`, and a second one would be invalid.

## Queues

Three queues, each with its own worker: `email-critical`, `email-transactional`,
`email-marketing`. The lane is chosen from the kind's `priority` in `EMAIL_KINDS`.

Not one queue with a priority field — priority only orders what a worker picks up *next*, which
does nothing once the worker is already busy, so a large broadcast could still delay a
password-reset code. Separate workers give critical mail capacity marketing cannot consume.

**Queue names use hyphens, never colons.** BullMQ builds its Redis keys as `bull:<name>:<...>`
and rejects a name containing `:` in its constructor. This is guarded by
`src/queue/queue.module.spec.ts` — it once passed every test (they all mock the queue objects)
and then failed at container startup in production, rolling a deploy back.

## Quota

`EmailQuotaService` holds an atomic per-day counter in Redis, checked against `EMAIL_DAILY_LIMIT`
(REG.RU's documented 3000/24h account cap; 15000 with a dedicated IPv4).

- `INCR` first and roll back on refusal, rather than read-then-check: two hosts share the counter
  and a check-then-act would let both through the last slot. The counter *is* the reservation.
- Ceilings by lane: marketing stops at 60% of the day's budget, ordinary transactional at 85%,
  critical may use 100%. A runaway notification loop therefore cannot leave a customer unable to
  receive an OTP.
- Claimed at send time, not enqueue time — a job can sit in the queue across midnight, and
  holding a reservation over that would charge the wrong day.
- Released again when the message never reached the server (connection/auth failure). A permanent
  5xx keeps the slot: REG.RU did process that message.
- Fails **open** if Redis is unreachable. The queue lives in Redis too, so if it is truly down
  nothing is being processed anyway; better than turning it into a confusing "quota" error.

## Idempotency

Job ids are the dedup mechanism — BullMQ refuses a second job with an id it already holds.

- order mail: `order:{orderId}:{kind}`
- broadcasts: `broadcast:{hash of subject+body}:{userId}`

So a replayed business event, a retried request, or a double-submitted broadcast sends once.

## Suppression

`EmailSuppression` holds addresses we must stop mailing. Populated automatically from permanent
SMTP rejections — REG.RU exposes no bounce webhook or API, so a 5xx at submission is the only
bounce signal available — and manually by staff via `/admin/mail/suppressions`. The first reason
recorded for an address wins, so a `HARD_BOUNCE` is never downgraded by a later duplicate.

Checked for marketing and ordinary transactional mail; **deliberately not** for authentication or
security mail (`EMAIL_KINDS[kind].respectsSuppression`) — unsubscribing from a newsletter, or an
old bounce, must never block a password reset the user just asked for. Verifying an address
clears any suppression on it: someone has just proven they control it.

## Outbox

Order mail is not queued directly by the code that changes the order. Instead an `EmailOutbox`
row is written **inside the same transaction** as the business change, and
`EmailOutboxProcessor` (a 5s poll) turns rows into sends.

The reason: "update the order, then queue the email" has a window where the process can die
between the commit and the enqueue, losing the notification with no trace. Committing the
obligation with the change removes that window.

- The row records only *that* an email is owed (kind + orderId). The dispatcher calls the same
  `EmailService` method the callers used to call directly, so recipient/locale/template
  resolution is not duplicated and reflects the order's state at dispatch, not a stale snapshot.
- Claiming is `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`. Both hosts poll the
  same table; `SKIP LOCKED` is what makes them take disjoint batches instead of blocking on each
  other or double-sending.
- `idempotencyKey` is unique and doubles as the BullMQ job id, so even a row dispatched twice
  yields one email.
- After 5 failed attempts a row stays `FAILED` and visible rather than retrying forever.

## Consent and preferences

`EmailPreference` is the single source of truth for marketing consent — marketing is explicit
opt-in, off by default. Users manage it on the account page
(`GET`/`PATCH /account/email/preferences`); opting back in clears the unsubscribe stamp, without
which the send path would keep treating them as unsubscribed whatever the checkbox said.

Only the optional categories are settable. Transactional and security mail has no toggle on
purpose: it is not something a user can switch off while holding an account.

`User.marketingOptOut` is the legacy flag this replaced. It is still written on unsubscribe so
nothing that reads it goes stale, but it no longer decides anything.

## Retention

`EmailRetentionProcessor` sweeps daily:

| Table | Kept | Why |
|---|---|---|
| `EmailLog` | 180 days | Holds recipient addresses — a privacy liability and an unbounded table otherwise. Long enough to investigate a complaint. |
| `EmailOutbox` (DISPATCHED only) | 30 days | Pure bookkeeping once sent. **FAILED rows are never swept** — those are what a human still needs to see. |
| `EmailVerification` (consumed) | 7 days | Hashed and useless after a few days. |

## Admin

`admin.gulyaly.pro/mail` — settings, logs, test send, broadcast, suppression list, health.

`admin.gulyaly.pro/mail/templates` — the template editor. Browse by kind and locale; edit
subject, preheader, HTML and plain text; preview at desktop and mobile widths in both MIME parts;
activate or archive a version. Saving always creates a new `DRAFT` version rather than editing in
place, and the help panel lists exactly the variables the selected kind declares (the renderer
rejects anything else at save time).

The HTML preview renders in a `sandbox=""` iframe — the markup is admin-authored but must not run
scripts against the admin session, and an iframe is also the only way to show it at a true device
width. Note that such an iframe has an opaque origin, so it renders correctly but does not appear
in automated screenshots.

## Health

`GET /admin/mail/health` reports whether credentials are *present* (never their values), performs
a real TLS+AUTH handshake via nodemailer `verify()` so a wrong password surfaces before a customer
misses an OTP, and returns quota usage plus per-queue depth.

## Alerts

`EmailAlertProcessor` checks every 5 minutes (after a 60s startup delay) and mails `ALERT_EMAIL`
when something is newly wrong:

| Condition | Suppressed for |
|---|---|
| SMTP configured but `verify()` fails | 6h |
| `MAIL_HOST` unset | 6h |
| Daily quota past 70% / 85% / 95% | until the quota resets at UTC midnight |
| ≥20 failed jobs in one queue | 6h |

Only the highest quota threshold crossed fires, not all of them. Deduplication is a Redis
`SET key NX EX ttl` claim, so of the two hosts only one sends, and a condition that persists is
reported once rather than every five minutes. If Redis is unreachable the alert is **suppressed**
rather than sent — without dedup the same outage would mail on every poll.

Alert mail goes straight through the transporter, bypassing the queue, the quota and the
consent/suppression checks. Each exclusion is deliberate: an alert about an exhausted quota must
not be blocked by that quota, an alert about a stuck queue must not sit in it, and the recipient
is an operator rather than a customer.

**Known limit:** an SMTP outage cannot be reported over SMTP. That alert is still attempted (the
failure may be partial) but every condition is also logged at error level as `EMAIL_ALERT <key>`,
which is the signal a log-based monitor should watch. A channel independent of our own mail path
would be the real fix.

See also [EMAIL_DELIVERABILITY.md](EMAIL_DELIVERABILITY.md) for the reputation posture,
Google Postmaster Tools setup, and why BIMI is deliberately not enabled yet.

## DNS check

```bash
pnpm --filter @topup-hub/api email:dns-check
```

Verifies MX, SPF, DKIM, DMARC and BIMI against **public DNS** — what a receiving mail server
resolves, not what the provider's panel believes. Exits non-zero on any required failure, so it
can gate a deploy. Takes an optional domain argument; reads the DKIM selector from
`MAIL_DKIM_SELECTOR` (default `dkim`).

It specifically catches the quiet failure modes: a second SPF record (RFC 7208 permerror — worse
than no SPF at all), a DKIM record whose `p=` is empty (the documented way to *revoke* a key), MX
still pointing at a previous provider, and SPF ending in `+all`.

Falls back to DNS-over-HTTPS when the local resolver is unusable — a network blocking UDP/53
returns `ENODATA`, which is indistinguishable from "no such record", so it probes a known-good
domain first and prints which path it used.

## Rate limits

Official REG.RU limits for hosted mail (closest published tier to "Mail-1"):

- **3000 messages / 24h** (9000/24h on VIP hosting tariffs)
- 150 recipients max per message
- 50MB max per message

No official messages-per-second or messages-per-minute limit is published anywhere — not invented.
`EmailProcessor`'s BullMQ `limiter: { max: 10, duration: 60_000 }` (10/min ≈ 14,400/day ceiling
from this worker alone) is a conservative, self-imposed pacing choice, comfortably under the
documented daily cap, not a confirmed REG.RU number. Adjust only after confirming a different real
limit with REG.RU support.

## Queue and retry

- Every send (except `sendTest`, a manual admin action) goes through BullMQ's `email-queue`, not
  inline in the request. `sendOrderCreated`/`sendOrderStatusUpdate` enqueue one job each;
  `sendMarketingBroadcast` uses `addBulk` (never a `Promise.all` fan-out).
- `attempts: 5`, `backoff: { type: "exponential", delay: 30_000 }` per job.
- SMTP errors are classified in `classifySmtpError()`:
  - **auth-or-config** (535/534/530, `EAUTH`, `ENOTFOUND`, `ECONNREFUSED`) — logged loudly as
    `SMTP_AUTH_OR_CONFIG_FAILURE`, marked `FAILED`, **not retried**. A wrong password never turns
    into an infinite retry loop.
  - **permanent** (≥500 other than the auth codes, e.g. 550 mailbox doesn't exist) — marked
    `FAILED`, not retried.
  - **temporary** (4xx, `ETIMEDOUT`, `ECONNRESET`, etc.) — marked `FAILED [retrying]` and
    rethrown, so BullMQ retries with backoff.

## Logging

`EmailService` logs email kind, recipient domain, SMTP result, and duration on every send —
never the SMTP password, full auth credentials, or email body content. Recipient addresses are
masked in log lines (`j***@gmail.com`); the full address is only in `EmailLog` (Postgres, behind
admin auth), not in server logs. See `maskEmail()`/`sendNow()` in `email.service.ts`.

## Monitoring

`email-dns-monitor.yml` runs `email:dns-check` daily at 06:00 UTC. Mail DNS breaks silently —
nothing errors, messages just start landing in spam — and this project has already hit one such
case (a subdomain registration auto-attached a duplicate SPF record, an RFC 7208 permerror). A
break now shows up as a failed workflow.

## Real-SMTP integration test

The ordinary suite mocks nodemailer, so it proves the logic but never that the provider still
accepts us. `email.smtp-integration.spec.ts` does a real handshake, and a real delivery when
given a recipient. It is `describe.skip` unless `SMTP_INTEGRATION_TEST=true`, so a run that did
nothing is reported as *skipped* rather than mistaken for a pass.

Run it from CI with production credentials via `smtp-integration-test.yml` (manual dispatch,
optional recipient), or locally:

```bash
SMTP_INTEGRATION_TEST=true MAIL_HOST=mail.hosting.reg.ru MAIL_PORT=465 MAIL_SECURE=true \
MAIL_USER=noreply@gulyaly.pro MAIL_PASS=... SMTP_TEST_RECIPIENT=you@gmail.com \
npx jest email.smtp-integration
```

Use an inbox you can open: the delivery assertion only proves the provider accepted the message.
What actually matters is the received message's `Authentication-Results` header showing
`spf=pass`, `dkim=pass` and `dmarc=pass`, which no test in this process can observe for you.

## Tests

`apps/api/src/email/email.service.spec.ts` — no real SMTP send, `nodemailer.createTransport` is
mocked. Covers: missing config (`MAIL_HOST` unset → `SKIPPED`, queue never touched), missing
recipient email, successful enqueue with the retry policy, a queue failure (e.g. Redis down)
being caught inside `sendOrderCreated`'s own try/catch rather than propagating to the caller
(fire-and-forget from the order flow never throws), and `sendNow`'s three error classes
(temporary → rethrows, permanent → doesn't rethrow, auth-or-config → doesn't rethrow) plus a
no-`responseCode` connection error (`ENOTFOUND`) correctly classified as auth-or-config rather
than falling into an infinite temporary retry.

Run: `cd apps/api && npx jest email.service.spec.ts`

No real-credential integration test exists yet — add one gated behind an env var (e.g. only runs
if `MAIL_PASS` is set) once the REG.RU mailbox is live, and check delivery to a real Gmail/Yandex/
Mail.ru address, inspecting the received message's `Authentication-Results` header for
`spf=pass`/`dkim=pass`/`dmarc=pass`.

## Local development

Leave `MAIL_HOST` unset (the `.env.example` default) — emails are skipped and logged as `SKIPPED`
in `EmailLog` instead of sent, which is the safe default for local dev. To test a real send
locally, point `MAIL_HOST`/`MAIL_PORT`/`MAIL_SECURE`/`MAIL_USER`/`MAIL_PASS` at REG.RU (or any
SMTP relay) in `apps/api/.env` and use the admin "send test email" button (`sendTest`, calls
`sendNow` directly — not queued, since it's a one-off interactive action).

## Production deployment

Deploys automatically via `.github/workflows/deploy.yml` on push to `main` — no separate step
needed for this feature beyond setting the env vars in `/opt/gul/.env` (see above) and restarting
the `api` container (`docker compose up -d` on the next deploy picks up `.env` changes, or restart
manually: `ssh deploy@DEPLOY_HOST "cd /opt/gul && docker compose restart api"`).

## Troubleshooting

- **`SMTP_AUTH_OR_CONFIG_FAILURE` in logs** — check `MAIL_USER`/`MAIL_PASS` in `/opt/gul/.env`
  match the mailbox's actual login/password in ISPmanager; check `MAIL_HOST` resolves
  (`mail.hosting.reg.ru`).
- **Mail lands in spam** — check SPF/DKIM/DMARC all pass on a received message's headers. DKIM
  for REG.RU isn't published yet (see above) — that alone can be enough to cause this until fixed.
- **Emails stuck as `SKIPPED` in `EmailLog`** — `MAIL_HOST` is unset, or the user has no email on
  file, or transactional email is disabled in admin settings (`EmailSettings.transactionalEnabled`).
- **A job keeps retrying and failing** — check it's actually classified as `temporary`
  (`[retrying]` in the `EmailLog.error` column); if it should be permanent/auth-or-config instead,
  the SMTP server's response code may not match what `classifySmtpError()` expects — check the raw
  `responseCode`/`code` in the worker logs.

## Remaining manual steps

Everything needed for mail to work is done. What is left is optional and deliberate:

1. **Google Postmaster Tools** — manual signup, worth doing once there is real Gmail volume.
   See [EMAIL_DELIVERABILITY.md](EMAIL_DELIVERABILITY.md).
2. **BIMI** — deliberately deferred; needs an SVG Tiny PS logo and, for Gmail/Yahoo, a VMC
   certificate requiring a registered trademark. Reasoning in the deliverability doc.
3. **Old Postfix DKIM cleanup** — `mail._domainkey.gulyaly.pro` (the self-hosted relay's key) is
   still published. Leave it while marketing still sends through that relay; remove it if and
   when marketing moves to an ESP.
4. **`p=reject`** — DMARC is at `p=quarantine`. Tightening should follow a period of clean
   aggregate reports, not precede it.
