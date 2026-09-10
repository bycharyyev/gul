# SSL auto-coverage for new nginx vhosts

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
step after that. See `.github/workflows/certbot-once.yml` for the original
manual one-off bootstrap this replaces for the "run certbot by hand" part.

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
