# Security review

**Reviewed:** 2026-09-26 · **Method:** code reading, scans of the tracked tree, `pnpm audit --prod`, and
requests to the live sites (`gulyaly.com`, `admin.gulyaly.com`, `api.gulyaly.com`). Findings marked
*verified live* were observed on production, not inferred from code.

Severity: **P0** fix before real customers · **P1** fix this quarter · **P2** hardening.
Effort: S (under a day) · M (a few days) · L (a week or more).

## Findings

| ID | Sev | Finding | Effort |
|---|---|---|---|
| S-01 | P0 | **Fixed 2026-09-26** (next 15.5.26). Next.js 15.5.23 had two critical advisories, fixed in 15.5.24 | S |
| S-02 | P0 | **Partly fixed 2026-09-26** (multer 2.4.0, nodemailer 9.1.1, sharp 0.35.4); `@nestjs/core` 10 still needs the major upgrade | S–M |
| S-03 | P0 | Web and admin send no security headers (*verified live*) | S |
| S-04 | P0 | The full API documentation is public in production (*verified live*) | S |
| S-05 | P1 | Web and admin keep access and refresh tokens in `localStorage` | M |
| S-06 | P1 | The repository is public and documents the production servers | S |
| S-07 | P1 | SSH password authentication is enabled on the secondary VPS | S |
| S-08 | P1 | No second factor for staff accounts | M |
| S-09 | P1 | Analytics with session replay loads before, and regardless of, consent (*verified in code*) | S |
| S-10 | P2 | Unsubscribe links are signed with the JWT access secret | S |
| S-11 | P2 | Upload type checks trust the client-declared MIME type | M |
| S-12 | P2 | Third-party GitHub Actions are pinned by tag, not by commit | S |
| S-13 | P2 | Framework and server versions are advertised in response headers | S |

### S-01 · Next.js critical advisories

> **Fixed 2026-09-26:** `next` bumped to 15.5.26 (`apps/web`). The text below records the finding as reviewed.

`apps/web` resolves to `next@15.5.23`. Two critical advisories are fixed in `15.5.24`:
GHSA-p293-qw3h-jr36 (remote code execution, **Windows-hosted** servers only) and GHSA-2xp9-vwfh-vxw4
(remote code execution in the image optimisation API when AVIF files are processed).
Production runs Linux in Docker, so the first does not apply. The second applies to any deployment
with the default image optimiser; `next.config` sets no `images` options, so the optimiser is on, but
with no `remotePatterns` it only touches the site's own images, which lowers exposure.
**Fix:** bump to `>=15.5.24` (a patch release), run typecheck, build and the smoke check, deploy.

### S-02 · Vulnerable dependencies

> **Fixed 2026-09-26:** multer 2.4.0, nodemailer 9.1.1, sharp 0.35.4. Still open: `@nestjs/core` 10 to 11 and the remaining audit findings (11 after the bump, 5 high, mostly build-time `webpack` under Sentry).

`pnpm audit --prod` reported 22 advisories at review time: 2 critical, 10 high, 7 moderate, 3 low.
Beyond Next.js, the ones that matter here:

| Package | Resolved | Fixed in | Why it is reachable |
|---|---|---|---|
| multer | 2.2.0 | 2.3.0 | multipart uploads (denial of service by crafted request) |
| nodemailer | 9.0.5 | 9.1.1 | outgoing mail address parsing (quadratic time) |
| sharp | 0.35.3 | 0.35.4 | image processing of user uploads (libheif) |
| `@nestjs/core` | 10.4.22 | 11.1.18 | needs a **major** upgrade; plan it, do not rush it |

**Fix:** patch-level bumps for the first three in one PR; schedule the NestJS 11 migration.
**Keep it from recurring:** add Dependabot or Renovate, and run `pnpm audit --prod` in CI as a
non-blocking warning until the backlog is clear. Reproduce with `pnpm audit --prod`.

### S-03 · No security headers on web and admin (verified live)

`gulyaly.com` answers with only `Server` and `X-Powered-By`; `admin.gulyaly.com` with only `Server`.
There is no `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`,
`X-Content-Type-Options` or `Referrer-Policy`. Only the API sends them (through `helmet`). The admin
console can therefore be framed by another site (clickjacking), and nothing limits what a script
injected into either site may do.
**Fix:** add the header block to the two nginx vhosts (`infra/nginx/`), starting with
`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'` for
admin, and a `Content-Security-Policy-Report-Only` for both to learn what a real policy must allow
before enforcing it.

### S-04 · Public API documentation (verified live)

`https://api.gulyaly.com/docs` and `/docs-json` return 200 to anyone: a 265-path specification,
108 of them `/admin/*`. It is not a vulnerability by itself, but it hands an attacker a complete
map of the attack surface. `main.ts` mounts Swagger unconditionally.
**Fix:** mount it only outside production, or restrict `/docs*` in nginx to staff addresses. The
seller API has hand-written documentation at `/seller/api-docs`, so partners do not depend on it.

### S-05 · Tokens in `localStorage` (web, admin)

Both apps store the access and the refresh token in `localStorage`. Any script that runs on the page
(an injected script, a compromised dependency, a third-party tag) can read and send both, and a
refresh token gives a long-lived session. The admin console is the most sensitive case. The mobile
app does this correctly (Android Keystore through `flutter_secure_storage`, backups disabled).
**Fix, cheapest first:** S-03 (CSP) and S-09 (fewer third-party scripts) reduce the chance of
injection; shorten the admin refresh lifetime; then move the refresh token to an `HttpOnly`,
`SameSite` cookie, which needs CSRF protection on the refresh route.

### S-06 · Public repository documenting production

Scans of the tracked tree found **no secrets** (no keys, tokens or private-key blocks; the only
`sk_live_` strings are code that generates or documents example keys). But the repository is public
and its documents name both production server IPs, the network layout, the firewall design, the
deploy user's Docker-group access and that password login is enabled on the secondary.
**Fix, pick one:** make the repository private (note the free plan's smaller Actions allowance), or
replace addresses in the documents with role names and keep the operator runbook somewhere private.

### S-07 · SSH password login on the secondary

`CLAUDE.md` records that password authentication was left enabled on the secondary "per an explicit
ask". Internet-facing password SSH is brute-forced continuously.
**Fix:** key-only login (`PasswordAuthentication no`) plus `fail2ban` or the provider's firewall;
keep the console as the recovery path.

### S-08 · No second factor for staff

Roles `ADMIN` and `MANAGER` can change catalogue prices, approve payouts, block users and read
customer data. Login is a phone number and password with a per-account back-off (4 free attempts,
then delays up to 300 s) and a per-IP limit. A one-time code exists only for password reset.
**Fix:** TOTP for staff roles (mandatory for `ADMIN`), with recovery codes.

### S-09 · Analytics before consent

`apps/web/src/components/analytics.tsx` loads Google Analytics 4 and Yandex Metrika unconditionally,
with Metrika's `webvisor: true` (session replay) and `clickmap`. The cookie banner only informs
("Хорошо"); it does not gate anything. Session replay can capture what visitors type or see, and
both providers receive the data outside the country.
**Fix:** load the tags only after an explicit accept; turn `webvisor` off, or mask the recipient and
payment fields; state the recipients in the privacy page.

### S-10 to S-13 (hardening)

- **S-10** The unsubscribe HMAC uses `JWT_ACCESS_SECRET`. Use a dedicated `UNSUBSCRIBE_SECRET`, so
  rotating one secret does not silently break the other.
- **S-11** Uploads are filtered on `file.mimetype`, which the client chooses. Objects are stored with
  that Content-Type in a separate origin (S3), which limits harm, but add magic-byte sniffing and
  re-encode images with `sharp`, which is already a dependency.
- **S-12** Five non-GitHub actions (`docker/setup-buildx-action`, `docker/login-action`,
  `docker/build-push-action`, `pnpm/action-setup`, `subosito/flutter-action`) are pinned by tag,
  which the publisher can move. Pin them by commit SHA and let Dependabot update them.
- **S-13** Set `poweredByHeader: false` in Next and `server_tokens off` in nginx.

## What is already done well

- Passwords: argon2. The API refuses to start without `JWT_ACCESS_SECRET`.
- Every request body is validated with `whitelist` and `forbidNonWhitelisted`; CORS is an explicit
  allow-list; rate limits exist globally (600/min) and per sensitive route.
- Of 42 controllers, only three have no guard, and each is deliberate: the health probe, order
  tracking (unguessable order id plus the recipient), and the signed unsubscribe link.
- API keys are stored as hashes and shown once. `User` and `ApiKey` are never returned whole.
- Money: an append-only seller ledger with idempotency keys, reconciled by a scheduled job; a
  migration policy that forces an explicit opt-in for destructive changes.
- Mobile: tokens in the Keystore, `allowBackup=false`, TLS-only network configuration with a
  debug-only exception, no secrets in the repository.
- Process (since 2026-09-23): `main` protected (pull requests only), production deploys only from
  `main`, no signing key and no APK build in CI.

## How to re-run this review

```bash
pnpm audit --prod                                  # S-01, S-02
curl -sI https://gulyaly.com https://admin.gulyaly.com   # S-03, S-13
curl -s -o /dev/null -w "%{http_code}\n" https://api.gulyaly.com/docs   # S-04
git grep -nE "BEGIN (RSA|EC|OPENSSH|PRIVATE)|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}"   # secrets
```

When a finding is fixed, change its row here and add the date; do not delete the row.
