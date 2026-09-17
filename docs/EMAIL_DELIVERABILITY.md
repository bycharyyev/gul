# Email deliverability

What we do to be a sender mailbox providers can trust, and what is deliberately not done yet.

**No system can guarantee inbox placement.** Anyone claiming otherwise is selling something. What
follows is standard sender authentication and hygiene, which is what actually moves the needle.

## Verified end to end

A real message delivered to Gmail on 2026-09-01 returned:

```
dkim=pass  header.i=@gulyaly.pro header.s=dkim
spf=pass   (designates 31.31.197.80 as permitted sender)
dmarc=pass (p=QUARANTINE)
```

This is the only evidence that counts — everything below is configuration, and configuration can
look right while a receiver disagrees. Re-verify with `smtp-integration-test.yml` after any change
to the sending path.

## Current posture

| Control | State |
|---|---|
| SPF | `v=spf1 include:_spf.timeweb.ru a:mail.gulyaly.pro include:_spf.hosting.reg.ru a:sm41.hosting.reg.ru ~all` |
| DKIM | selector `dkim`, 2048-bit, signed by REG.RU |
| DMARC | `p=quarantine; pct=100; adkim=r; aspf=r` |
| TLS | SMTP submission on 465 (implicit TLS) |
| Alignment | relaxed (`adkim=r`, `aspf=r`) — From domain and signing domain are both `gulyaly.pro` |
| plain-text part | every email is `multipart/alternative` |
| One-click unsubscribe | RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post` on marketing |
| Consent | marketing requires explicit opt-in; suppression list honoured |
| Sending rate | per-queue limiter plus a daily quota with headroom reserved for critical mail |

Verify all of the DNS side at any time:

```bash
pnpm --filter @topup-hub/api email:dns-check
```

## Why each one matters

**SPF** authorises which servers may send as us. Exactly one SPF record may exist — two is a
`permerror` under RFC 7208 and fails the check entirely, which is worse than publishing none.
`~all` (softfail) rather than `-all` is deliberate while the sending set is still settling; a
premature `-all` hard-fails legitimate mail from a path you forgot about.

**A real softfail, and the lesson from it.** The first test delivery to Gmail returned
`spf=softfail`. `include:_spf.hosting.reg.ru` turns out to be a fixed list of REG.RU's *central
relay* IPs — it does not cover a customer's own hosting server, which is where mail submitted via
SMTP AUTH actually leaves from (`sm41.hosting.reg.ru`, 31.31.197.80). REG.RU's documented example
carries `ip4:<hosting-server-ip>` alongside the include for exactly this reason; it was dropped
on the assumption that authenticating to their relay meant we never send off our own IP. The
headers disproved that.

DMARC passed throughout, because DKIM passed and aligned and DMARC needs only one of the two — so
nothing was undeliverable, but the margin was one broken DKIM key wide, and none of it was
visible without reading a real message's headers.

`email:dns-check` now expands the SPF record and asserts the sending host's IP is genuinely
authorised, so this cannot regress silently — including if REG.RU migrates the account to a
different `sm*` server.

**The fix then appeared not to work, and that was a red herring.** A resend still showed
`spf=softfail`, but the record was already correct: Cloudflare served the new value with a full
TTL while some of Google's cache nodes still held the old one, and the message happened to hit a
stale node. Verified by polling until Google returned the new record consistently, then resending
— which passed. Worth remembering before "fixing" a DNS change twice: confirm what resolvers
actually see, from more than one of them, before touching the record again.

The submission host inside REG.RU rotates (`mail1`/`mail3`/`mail4`.hosting.reg.ru), but the host
that hands the message to the outside world has been `sm41.hosting.reg.ru` on every send — which
is why authorising that one host is sufficient rather than accidental.

**DKIM** signs the message so a receiver can prove it was not altered and really came from the
domain. A record whose `p=` is empty is the documented way to *revoke* a key — publishing one by
accident silently fails every signature, which is why `email:dns-check` treats it as an error
rather than as a present key.

**DMARC** tells receivers what to do when SPF and DKIM disagree with the From domain. We are at
`p=quarantine`, i.e. suspicious mail goes to spam rather than being accepted. Moving to
`p=reject` is the eventual goal but should follow a period of clean aggregate reports, not
precede it.

**Alignment** is the part people miss: SPF and DKIM passing is not enough — the domain they pass
*for* has to match the From domain. Ours does, because we send as `@gulyaly.pro` and REG.RU signs
as `gulyaly.pro`.

## Rates and reputation

Gmail treats a spam-complaint rate above **0.3%** as the level at which sender reputation
suffers, and expects bulk senders to keep it well below that. The controls that keep us under it
are behavioural, not technical:

- marketing goes only to addresses that explicitly opted in (`EmailPreference.marketing`)
- a permanent SMTP rejection adds the address to the suppression list automatically
- unverified addresses never receive order mail — an unverified address is usually a typo, and
  mail to a stranger who then reports it as spam is exactly what costs reputation
- transactional and marketing use separate From identities, so a complaint about a newsletter
  does not attach to the address that sends password-reset codes

## Google Postmaster Tools

**Set up and verified** (2026-09-01). `gulyaly.pro` is registered and ownership is confirmed via
a `google-site-verification` TXT record at the apex — it sits alongside SPF, which is fine: the
one-record-per-name rule applies to SPF specifically, not to TXT in general.

The dashboard is **empty, and that is expected**. Postmaster Tools reports only on mail delivered
to `@gmail.com` addresses, and only above a daily-volume threshold. With no verified user
addresses yet there is nothing to report; the value of registering now is that history starts
accumulating from the first real send rather than from whenever someone remembers to sign up.

Once volume exists it reports spam rate, authentication pass rates, encryption, delivery errors
and domain reputation — the only first-party view of how Gmail actually sees us.

## BIMI — record published, logo will not show in Gmail yet

The record is live at `default._bimi.gulyaly.pro`:

```
v=BIMI1; l=https://gulyaly.pro/brand/gulyaly-bimi.svg;
```

Prerequisites, all met: SPF/DKIM/DMARC pass and align, DMARC is at `p=quarantine` with
`pct=100`, and the logo is served over HTTPS with `200 OK`, `image/svg+xml`, no redirect and no
auth.

**Gmail and Yahoo will still not display it.** Both require a VMC (Verified Mark Certificate) or
CMC, which needs a registered trademark and costs real money annually. Publishing the record
without one is not wasted — a handful of providers honour self-asserted BIMI, and everything
except the certificate is now in place — but do not expect a logo in Gmail until a VMC exists.
That remains a business decision about trademark and cost, not an engineering task.

### The SVG had to be rebuilt

The supplied file was tracer output with `baseProfile="tiny-ps"` and a `<title>` stamped on top,
which looks conformant and is not. A BIMI validator rejects it for: 8 nested `<svg>` elements,
4 `xlink` references, `width`/`height` on the root, and six fill colours — three of them
(`#4a4a4a`, `#9a9a9a`, `#e8bdba`) grey ghosting layers under the black from colour quantisation.

`apps/web/public/brand/gulyaly-bimi.svg` is a rebuild from the two real shapes (black arc, red
pill): 4142 B → 912 B, verified to render identically. If the logo is ever changed, rebuild it
the same way rather than exporting from a tracer.

### Wildcard shadowing, when publishing

`*.gulyaly.pro` has a TXT record, so until Timeweb publishes a newly created specific name,
resolvers answer from the wildcard — for `default._bimi` that looks like an SPF record appearing
where BIMI should be. It is not a broken BIMI record; check the zone via the API before
re-creating anything.

## When something looks wrong

1. `pnpm --filter @topup-hub/api email:dns-check` — rules out the DNS side in seconds.
2. `/admin/mail` — SMTP reachability, quota, queue depth, suppression list, stuck outbox rows.
3. Inspect a received message's `Authentication-Results` header: it states `spf=`, `dkim=` and
   `dmarc=` verdicts directly, which is faster than inferring them.
4. Check the suppression list before concluding "we do not send to this person" is a bug — it may
   be a recorded hard bounce doing its job.
