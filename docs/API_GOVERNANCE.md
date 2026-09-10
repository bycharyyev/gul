# API governance

How the API is divided, measured, and limited.

**Status: complete.** Every request is counted and readable in the admin console, every caller has
a quota attached to their own identity, and partner keys have scopes, an expiry and a rotation path
with a grace period.

---

## The four trust boundaries

These already existed in the code; what was missing was a name for them and any way to see them
apart.

| Tier | How a caller proves who they are | Surface |
| --- | --- | --- |
| **public** | nothing | `/catalog/*`, `/gallery/products`, `/stories`, `/home-slides`, `/social-links`, `/content-pages/:slug`, `/order-tracking`, `/health*` |
| **customer** | JWT access token | `/auth/me`, `/orders/*`, `/gallery/orders/*`, `/support/*`, `/referrals/me`, `/account/*` |
| **staff** | JWT + `@Roles(...)` | `/admin/*` and every management route |
| **partner** | `X-Api-Key` header | `/v1/partner/*` and `/v1/seller-api/*` (see Part D) |

`ApiMetricsInterceptor.tierOf` derives the tier from the request itself — an attached `apiKey`
means partner, a `CUSTOMER` role means customer, any other role means staff, nothing means public.
An API key wins over a JWT if both are somehow present: it is the more specific attribution.

---

## Part A — counting

### What is recorded

One `APP_INTERCEPTOR`, so no route can be added without being counted, and none has to be
decorated. For every request that reaches a matched route:

* the **route template**, `GET /orders/:id`;
* the tier, and for partner calls the **API key id**;
* the status **class** — `2xx` / `4xx` / `5xx`;
* the duration in milliseconds.

### What is deliberately not recorded

**The raw path and the query string.** A resolved path carries order ids, and `/order-tracking`
carries a recipient's phone number in its query. Recording templates instead means `/orders/:id`
is one row rather than one row per order — a privacy property and a cardinality property at once.
A test asserts that a request to `/things/cmt0b0y020000oe10uducp2n1` produces a counter field
containing no such id.

**The exact status code.** Three buckets rather than forty keeps each day's hash small enough to
read in a single round trip, and the question being asked is "how many failed".

**A path that matched no route.** Nest answers those before any interceptor runs, so unrouted
404s are invisible here. Acceptable: a scanner probing random URLs is exactly the traffic not
worth spending Redis cardinality on, and every 4xx or 5xx on a real endpoint is still counted.

### Where it is stored, and why not Postgres

This is a write on *every* request. A row per call would put the API's own traffic into the
database it is meant to protect. Redis is already deployed for BullMQ, so this adds no component
to operate — which is the constraint that matters on a two-VPS setup.

Three hashes per day, `HINCRBY`-ed, each with a 35-day TTL so old counters expire without a
cleanup job:

```
apiusage:day:2026-09-01       "<tier>|<method> <route>|<class>"  -> count
apiusage:latency:2026-09-01   "<method> <route>|sum" and "|n"    -> ms, calls
apiusage:key:2026-09-01       "<apiKeyId>|<class>"               -> count
```

Latency is a sum and a count rather than a histogram: an average plus a call count answers "is
this endpoint slow" without a bucket array per endpoint per day. An endpoint with no samples
reports `avgMs: null`, never `0` — zero would read as "instant", which is the opposite of
"unknown".

Only the key **id** goes into Redis. Names are joined in at read time from Postgres, so renaming
or deleting a key does not leave a stale label sitting in a month of counters. A deleted key's
traffic still appears, labelled as deleted — dropping it from the report would be less honest than
showing it.

### Failure is not allowed to matter

`record()` never throws and never makes the request wait. If Redis is unreachable the write is
dropped and logged at debug level. An observability layer that can take the product down is worse
than no observability at all — there is a test that pulls Redis out from under a live request and
asserts the response is still served.

### Reading it

`GET /admin/api-usage?days=N` (ADMIN or MANAGER, 1 ≤ N ≤ 35) returns totals, a daily series, a
breakdown by tier, a breakdown by partner key, and the endpoint table. The admin console renders
it under **API usage**, with the daily bars stacking failures on top of total volume so a bad day
shows up in the shape rather than only in a number.

The daily series keeps days with no traffic in it. A gap is information: silently omitting a day
makes an outage look like a quiet period.

---

## Part B — limits

### Two mechanisms, because they are two jobs

| | `ThrottlerGuard` (unchanged) | `ApiQuotaInterceptor` (new) |
| --- | --- | --- |
| Protects | **a route** | **the service** |
| Keyed on | IP | the caller's own identity |
| Example | 10 logins/min from one address | 60 requests/min for this partner key |
| Stops | credential stuffing | one runaway client starving everyone else |

The existing per-route throttles on `/auth/*` are untouched. Adding tier logic to that guard would
have meant fighting the library's internals for the sake of merging two unrelated concerns.

### Identity, not address

The old limit keyed on IP alone, which has two failures: a partner behind NAT shares a bucket with
every customer behind that NAT, and a partner cannot be given a quota at all because the limit is
attached to nothing they own.

Now a partner is charged to `key:<id>`, a signed-in person to `user:<id>`, and only anonymous
traffic falls back to `ip:<addr>`. Neither identity can be diluted by sharing an address, nor
escaped by changing one.

### Defaults, and why they differ

| Tier | Requests/min | Env override | Reason |
| --- | --- | --- | --- |
| public | 300 | `QUOTA_PUBLIC_PER_MIN` | cacheable catalogue data, hit by every anonymous visitor |
| customer | 120 | `QUOTA_CUSTOMER_PER_MIN` | a person tapping an app |
| staff | 600 | `QUOTA_STAFF_PER_MIN` | the admin dashboard polls |
| partner | 60 | `QUOTA_PARTNER_PER_MIN` | a partner is a program, and a program with a bug is what hammers an endpoint by accident |

A key may override the partner default with `ApiKey.rateLimitPerMin`, set from the admin console.
`null` means "the tier default" — **there is deliberately no way to express unlimited**, and the
DTO's floor of 1 stops a typo from silently rejecting everything. Disabling a key is what
`isEnabled` is for, and it says so.

A bad env value (`abc`, `0`, `-5`) is ignored rather than applied, because a typo in a deploy
variable must not become a limit of zero on production.

### Mechanics

A fixed one-minute window: one `INCR` and one `EXPIRE` per request. A sliding window would need a
sorted set per identity and a trim on every call; the fixed window's worst case is a caller
spending its whole allowance in the last second of one window and again in the first second of the
next — a 2× burst for one second. For a quota whose purpose is "no single client eats the service",
that is a fair trade.

Per-key limits are cached for 60 seconds so a partner request is not a database read to learn a
number that changes quarterly. Changing a limit in the admin console calls `forget()`, so it lands
immediately rather than a minute later.

Every response carries `X-Quota-Limit`, `-Remaining` and `-Reset`, and a rejection adds
`Retry-After` — a partner's client can back off on its own instead of discovering the limit by
being rejected.

**`X-Quota-*`, not `X-RateLimit-*`, and that distinction was learned from production.** A live
check against `api.gulyaly.pro` showed `@nestjs/throttler` already writing `X-RateLimit-Limit: 120`
for its own per-route, per-IP limit. Reusing those names would have overwritten them and produced
a header that actively misleads: a public caller would read "limit 300" from the quota and still be
rejected at 120 by the throttler, whose numbers had just been erased. Two limiters, two sets of
headers, neither lying — and whichever is stricter is simply the one that rejects first.

**Fails open.** If Redis is unreachable the request is allowed. A rate limiter that turns a Redis
blip into a site-wide outage has done more damage than the abuse it was guarding against.

**Health checks are never limited.** The load balancer and the deploy script use them to decide
whether the process is alive; throttling them can only cause a false failover.

### An interceptor, not a guard

Not a preference. A global guard in Nest runs **before** the route's own guards, so `request.user`
and `request.apiKey` are not populated yet and every caller would look anonymous — which would
defeat the entire point. Interceptors run after all guards. Throwing before `next.handle()` rejects
the request exactly as a guard would. A test asserts the ordering by driving a request through a
route guard and checking the quota was charged to the user rather than the address.

Registration order in `app.module.ts` matters too: `MetricsModule` is imported before
`ApiQuotaModule`, so the metrics interceptor wraps the quota one and a rejected request is still
counted as the 429 it became.

---

## Known caveat: both A and B are per-node

Counters and quota windows live in the node-local Redis, the same one BullMQ uses. Today that is
exact, because DNS only ever hands out the primary's address — the secondary VPS serves nothing
(see `HIGH_AVAILABILITY.md`).

The moment a second A record sends real traffic to the secondary, two things follow: the admin
page shows only the traffic of whichever node answered it, and every quota becomes effectively 2×
because each node counts its own half.

Fixing it is one decision, not one design: point both nodes at a single Redis for these two key
spaces. That trades a cross-node dependency for exact numbers, and it should be decided together
with enabling active/active traffic rather than before it.

## Part C — key lifecycle

`ApiKey` was `{ name, ownerLabel, keyPrefix, keyHash, isEnabled, lastUsedAt }`: all-or-nothing
across `/partner/*`, never expiring, impossible to rotate without replacing.

### Scopes

Three, matching the three things the partner surface actually offers:

| Scope | Routes |
| --- | --- |
| `catalog:read` | `GET /partner/catalog/services`, `.../:id/rates`, `.../payment-methods` |
| `orders:read` | `GET /partner/orders/:id` |
| `orders:write` | `POST /partner/orders` |

Resisting a finer grid is deliberate — a scope nobody can explain is a scope nobody sets
correctly. Each route declares what it needs with `@RequiresScope(...)`, and `ApiKeyGuard` checks
it. **A test walks the controller source and fails if any route lacks the decorator**, because
forgetting it on a new route is exactly how a read-only key quietly gains the ability to place
orders.

Scopes restrict; they never widen. An empty list means the key authenticates and reaches nothing.
A new key defaults to `["catalog:read"]` — the narrowest useful default, so a key nobody thought
about cannot create orders. The migration gives every **existing** key the full set, because a
schema change must not silently remove access from a partner mid-integration.

### Expiry

`expiresAt`, null meaning never. An expired key is rejected with **"API key expired"**, not
"invalid or disabled" — a partner can act on the first and not on the second. A past date is
allowed when setting it: that is how you retire a key on a date.

### Rotation with a grace period

`POST /admin/api-keys/:id/rotate` mints a new secret, returns it exactly once as creation does,
and keeps the outgoing one working for `graceHours` (default 24). Without that window a rotation
*is* an outage: the old key dies the instant the new one is minted and the partner has not
deployed it yet. `graceHours: 0` cuts the old key immediately — the right choice when rotating
*because* it leaked.

The guard matches either the current hash or a previous hash still inside its window, in one
query.

### Surviving the deploy window

The pipeline starts new code **before** running migrations, so for a minute or two these columns
do not exist. `ApiKeyGuard` catches that and falls back to the pre-lifecycle behaviour —
authenticate on the current hash, treat the key as unrestricted — rather than rejecting every
partner request for the length of a deploy. Failing closed there would take a working integration
down for a schema change it did not ask for. Covered by a test.

---

## Part D — versioning

A version number is only worth having where the caller's release cycle is not ours.

| Surface | Path | Versioned? |
| --- | --- | --- |
| public, customer, staff | `/api/...` | no — web and admin ship in the same deploy as this process, so their routes cannot fall out of step |
| partner | `/api/v1/partner/...` | yes, and `/api/partner/...` still answers |
| seller (shop keys) | `/api/v1/seller-api/...` | yes, and there is no unversioned path |

`main.ts` calls `enableVersioning({ type: URI, defaultVersion: VERSION_NEUTRAL })`. Neutral by
default is the point: every existing controller keeps its exact path, and the two surfaces that
need a version opt in through `@Controller({ path, version })`. Nothing was renamed to introduce
this.

The seller API was versioned on the day it shipped, before any key existed. That is the only
cheap moment — a version segment added after somebody integrates is a migration of a program we
do not control.

### What may change inside v1

Additive changes only. A caller written against v1 today must keep working against v1 in a year:

* a **new endpoint**;
* a **new field in a response** — clients must ignore fields they do not know;
* a **new optional request field**, or a new optional query parameter;
* a **new enum value**, only where the documentation already told callers to expect unknown ones;
* anything invisible over the wire.

### What needs v2

* removing or renaming a field, an endpoint, or a query parameter;
* changing a field's type, or what it means;
* making an optional request field required, or narrowing what is accepted;
* changing a default, a sort order, a page size, or the shape of an error;
* a new enum value on a field a caller must exhaustively switch on.

The test to apply is not "is this a small change" but "could a program written last month notice
it". A response field renamed from `title` to `name` is one word and a broken integration.

### Retiring a version

The unversioned partner path is the first thing due for retirement, and it shows the shape of it:
it keeps working, and every response carries `Deprecation: true`, a `Sunset` date, and a `Link`
to the successor. The date is a promise — it must not pass without either the callers having
moved or the date having been pushed out on purpose. A sunset that slips silently teaches
integrators that our headers can be ignored, and then no future deprecation works.

`deprecatedVersionHeaders` is **middleware**, not an interceptor, and that distinction was a bug
before it was a decision: Nest runs guards before interceptors, so the first version never fired
for a request the API-key guard rejected — a partner whose key had expired got a bare 401 and no
hint that the path was going away either. Middleware runs first, so the headers are on every
response, and only on requests that arrived without a version segment: a caller who has already
moved is never told to move again.

Before a version is switched off, `apiusage:key:*` answers the question that actually matters —
whether anybody is still calling it, and which key.

---

## What this cost

| | Files | Tests |
| --- | --- | --- |
| A — counting | 6 | 22 |
| B — quotas | 4 | 21 |
| C — key lifecycle | 5 | 15 |
| D — versioning | 5 | 12 |

No new runtime dependency, no new service to operate: everything runs on the Redis and Postgres
already deployed. 286 API tests pass.
