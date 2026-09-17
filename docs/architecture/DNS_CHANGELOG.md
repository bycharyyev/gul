# DNS changelog — gulyaly.pro

Record of every DNS change made via `manage-dns.yml` (Timeweb Cloud API). This is **not** an
approval log — during the current pre-launch test phase, DNS changes are made without a
per-record confirmation (see the test-phase autonomy note below). It exists so there's a trail to
reconstruct from if something needs debugging later.

Mechanism: `.github/workflows/manage-dns.yml`, dispatched with a `step` input; each step is one
self-contained change. See that file for the exact API calls. Real gotchas hit while building it
are documented in [CLAUDE.md](../../CLAUDE.md#dns-management-timeweb-cloud-api).

## 2026-08-27 — NS migration to Timeweb, emergency restore

`gulyaly.pro`'s NS records had just been switched to Timeweb (`ns1/ns2.timeweb.ru`,
`ns3/ns4.timeweb.org`); the new zone had zero A records, putting production at risk of going
unreachable as resolvers picked up the new NS.

- **`restore-core-a-records`** — apex (`gulyaly.pro`) and wildcard (`*.gulyaly.pro`) A records →
  primary VPS. Restores what CLAUDE.md documents as the intended state.
- **`add-mail-a-record`** — `mail.gulyaly.pro` A record → secondary VPS (overrides the wildcard
  for this one name; the mail relay lives on the secondary).
- **`merge-spf-record`** — PATCHed Timeweb's existing SPF record for `gulyaly.pro`
  (`v=spf1 include:_spf.timeweb.ru ~all`) to add `a:mail.gulyaly.pro`, rather than creating a
  second SPF TXT record. Two SPF records for one name is invalid (RFC 7208) and breaks the check
  entirely — this lesson mattered again a day later (see 2026-08-28 below).
- **`add-dkim-record`** — `mail._domainkey.gulyaly.pro` TXT, publishing the DKIM public key for
  selector `mail` (the transactional-mail signing key, OpenDKIM + Postfix milter on the
  secondary). Makes DKIM verifiable by recipients for `noreply@gulyaly.pro`.

## 2026-08-28 — newsletter.gulyaly.pro (mail-split step 2)

Part of separating marketing mail onto its own sending domain/selector, so spam complaints on a
newsletter can't drag down deliverability for transactional mail (order confirmations, codes).

- **`add-newsletter-spf-record`** — new TXT record for `newsletter.gulyaly.pro`,
  `v=spf1 ip4:<secondary-ip> ~all`. Its own record (not merged into the apex's), since
  `newsletter.gulyaly.pro` sends mail as itself.
- **`add-newsletter-dkim-record`** — `news2026._domainkey.newsletter.gulyaly.pro` TXT, the DKIM
  public key for selector `news2026` (deliberately a different selector from the transactional
  `mail` selector, so the two signing keys are fully independent).
- **`remove-newsletter-default-spf-duplicate`** — registering the `newsletter` subdomain as its
  own resource (a prerequisite for attaching records to it) auto-attached Timeweb's own default
  SPF record (`v=spf1 include:_spf.timeweb.ru ~all`, record id `91701267`) *alongside* the record
  added above — two competing SPF TXT records for the same name, an RFC 7208 violation. This was
  the actual cause of Gmail's `550-5.7.26 SPF ... did not pass` bounce on the first end-to-end
  test. Deleted the auto-generated duplicate, keeping only the intended record (id `91701269`).
  Confirmed via `dig` against the authoritative NS (`ns1.timeweb.ru`) that exactly one SPF record
  remains. Re-sent the test email afterward — accepted by Gmail (`250 2.0.0 OK`, relay log
  `status=sent`).

**Lesson for future subdomain records**: registering *any* new subdomain via
`POST /api/v1/domains/{fqdn}/subdomains/{label}` auto-attaches Timeweb's own default SPF/MX-style
records to it. Harmless for a name that never sends mail as itself; a real problem for one that
does (like `newsletter`) — check the zone listing after registering a mail-sending subdomain and
delete Timeweb's auto-added SPF duplicate before relying on the domain's own SPF record.

## 2026-08-29 — DMARC strengthened, one self-inflicted incident along the way

Strengthened DMARC from `p=none` (Timeweb's default, monitor-only) to `p=quarantine; pct=100`, as
part of a deliverability push after a test email landed in spam. Real trust signal for
correctly-aligned mail (DKIM `d=gulyaly.pro` matches From, SPF authorizes `mail.gulyaly.pro`);
deliberately not `p=reject` yet on a domain still building sending reputation.

**Incident, self-caused and self-fixed within the same session**: first attempt used `PATCH` on
the existing DMARC record's `value` without including `subdomain` in the body — this silently
reset the record's subdomain to `null`, relocating it from `_dmarc.gulyaly.pro` to the bare apex.
For a few minutes, `_dmarc.gulyaly.pro` had no real DMARC record (falling back to the `*` wildcard
SPF-content record — an unrelated garbage value at that name) while the apex carried a stray
DMARC-content TXT record it should never have had. A second `PATCH` attempt with `subdomain`
explicitly included did *not* fix it — the field turned out not to be updatable via `PATCH` at
all, regardless of what's sent. Fixed properly by deleting the mis-relocated apex record and
recreating it fresh at `_dmarc.gulyaly.pro` via the normal register-subdomain-then-POST path.
Confirmed via authoritative NS: `_dmarc.gulyaly.pro` now returns the correct DMARC value, apex
carries only the correct SPF, no stray record either place. See CLAUDE.md's DNS management
section for the documented gotcha — PATCH is only safe for a record's value when the record is
already sitting at the exact name it should stay at; relocating anything means delete + recreate.

## Test-phase autonomy note

Per the user's 2026-08-28 instruction, DNS-record changes (add/modify/delete) no longer require a
per-record confirmation while the project has no real customers yet — delegated fully as long as
the change is part of the current task and justified. Changing the domain's **NS servers**
themselves (not individual records) is explicitly excluded from that and still requires
confirmation, since it could move the domain out from under Timeweb's control entirely.
