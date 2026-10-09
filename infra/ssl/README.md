# SSL for gulyaly.com

## Current scheme (2026-10-01): one wildcard cert, issued in CI, installed on both hosts

`gulyaly.com`, `www` and `api` resolve to **both** hosts (DNS round-robin). An HTTP-01 challenge is
answered by whichever node the validator reaches, but only the node running certbot has the token,
so renewing on the hosts was a coin toss per validation, and the secondary's certificate was a
one-off copy nothing refreshed. The certificate is therefore issued by
`.github/workflows/renew-certs.yml` on the GitHub runner:

- **DNS-01** for `gulyaly.com` + `*.gulyaly.com`; `dns01/timeweb-auth.sh` publishes the TXT record
  through the Timeweb API (`TIMEWEB_API_TOKEN`) and waits for Timeweb's nameservers,
  `dns01/timeweb-cleanup.sh` removes exactly that record afterwards. Neither host takes part in
  validation.
- The same `fullchain.pem` / `privkey.pem` go to **both** hosts at `/etc/ssl/gulyaly/` (atomic
  `mv`; `nginx -t` before reload, so a mismatched pair never goes live). The wildcard covers every
  vhost, managed subdomains and the catch-all included.
- **Weekly** (Mondays 04:23 UTC); renews only below 30 days left. A failed scheduled run emails the
  repo owner. Manual: dispatch with `force` (renew now) or `staging` (Let's Encrypt staging CA,
  proves the DNS-01 path, installs nothing).
- Check from outside: `openssl s_client -connect <host-ip>:443 -servername gulyaly.com` against
  each IP; both must show the same expiry.

The certbot setup described below (`gul-cert-sync`, `certbot --nginx`) is the previous scheme. Once
the vhosts point at `/etc/ssl/gulyaly/` it must be off: `certbot --nginx` rewrites
`ssl_certificate` lines back to its own lineage.

## Previous scheme: per-host certbot (`gul-cert-sync`)


Installed and running on the production VPS (`/opt/gul/scripts/sync-ssl-domains.sh` +
`gul-cert-sync.{service,timer}` in `/etc/systemd/system/`) as of 2026-08-21.
These copies are the source of truth for redeploying after a server rebuild —
the ones on the live box are not otherwise version-controlled.

**What it does:** `certbot.timer` (ships with the `certbot` apt package, already
enabled) renews existing certs twice daily but never picks up a *new* domain on
its own. `gul-cert-sync.timer` runs `sync-ssl-domains.sh` once a day, which reads
every `server_name` out of `/etc/nginx/sites-enabled/*.conf` and re-runs
`certbot --nginx --expand` against that full list. Idempotent — certbot skips
domains not yet due for renewal, so this is a no-op on a normal day and only
does real work when a domain is missing from the cert's SAN list.

**What it does not automate:** creating the nginx vhost file itself (you still
write a `server { server_name ...; proxy_pass ...; }` block and
`nginx -t && systemctl reload nginx`) — this only takes care of the certbot
step after that. The `certbot-once.yml` workflow (the one-off HTTP-01 bootstrap that the wildcard flow in
`renew-certs.yml` replaced) was removed on 2026-10-09.

## Reinstalling after a server rebuild / migration

```bash
scp infra/ssl/sync-ssl-domains.sh root@<new-host>:/opt/gul/scripts/sync-ssl-domains.sh
scp infra/ssl/gul-cert-sync.service infra/ssl/gul-cert-sync.timer root@<new-host>:/etc/systemd/system/
ssh root@<new-host> '
  chmod 750 /opt/gul/scripts/sync-ssl-domains.sh
  systemctl daemon-reload
  systemctl enable --now gul-cert-sync.timer
  bash /opt/gul/scripts/sync-ssl-domains.sh   # run once immediately rather than waiting for the timer
'
```

Requires nginx + certbot (`python3-certbot-nginx`) already installed and DNS
for all domains already pointing at the new host's IP — Let's Encrypt's HTTP-01
challenge validates against whatever the domain currently resolves to.
