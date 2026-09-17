# Mail reputation monitoring

Mail-split step 6. Two parts: automated DNSBL checks (done), and provider reputation dashboards
(manual — both require logging into an account the agent has no access to).

## Automated: DNSBL check

`.github/workflows/check-mail-blacklist.yml` (workflow_dispatch) queries the secondary VPS's IP
against Spamhaus ZEN, Barracuda, and SpamCop — the three lists that most affect delivery at
Gmail/Outlook. Not yet on a schedule or wired into an alert: intended to fold into the disk-usage
email alert (`infra/alerts/gul-disk-alert.sh`, drafted but not installed — still waiting on a
destination email address) once that's resumed, so both checks share one recurring email.

## Manual: provider postmaster tools

Neither of these can be done by the agent — both require signing into an account with real
ownership of the domain/IP, which only the account holder can do.

**Google Postmaster Tools** (postmaster.google.com) — shows Gmail-specific reputation, spam rate,
and delivery errors for `gulyaly.pro` and `newsletter.gulyaly.pro` separately:
1. Sign in with a Google account, add each domain (both `gulyaly.pro` and
   `newsletter.gulyaly.pro` — they're separate sending identities as of the mail-split work).
2. Verify ownership via a DNS TXT record it gives you (same domain the DKIM/SPF records already
   live in — Timeweb NS). Add it the same way as the other records (`manage-dns.yml`) once you
   have the exact value from the Postmaster Tools UI.
3. Data appears with a lag (usually a day or two) and only once there's real sending volume —
   won't show anything meaningful until there are actual users.

**Microsoft SNDS** (sendersupport.olc.protection.outlook.com/snds) — Outlook/Hotmail-specific
reputation for the secondary VPS's sending IP:
1. Sign in with a Microsoft account, request access for the secondary's IP.
2. Enrollment requires proving control of the IP, via a confirmation code Microsoft sends to the
   IP's network abuse contact (Timeweb, as the hosting provider) — not something scriptable from
   here; follow SNDS's own flow.

## When to actually do the manual part

Low priority while there are no real users — both tools need real send volume to be useful, and
the DNSBL check above already covers the "did we get blocklisted" case that matters most right
now. Worth doing before any real marketing send goes out to more than a handful of people.
