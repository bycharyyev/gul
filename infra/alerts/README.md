# Disk usage email alert

Emails when root disk usage crosses 80%, via the existing Postfix relay (no Telegram bot, no new
service) -- see `.github/workflows/install-disk-alert.yml` for installation.

- `gul-disk-alert.sh` -- the check + send. Rate-limited to one email/hour via a timestamp file in
  `/var/lib/gul-disk-alert/`. `--test` forces a send regardless of current usage, for verification.
- `gul-disk-alert.service` / `.timer` -- runs the script every 15 minutes via systemd.
- Sends from `alerts@gulyaly.pro`, authenticated as a dedicated `alerts` SASL account (separate
  from `noreply`/`newsletter`) -- covered by the domain's existing SPF/DKIM (selector `mail`), no
  new DNS records needed.
- Credentials + recipient live in `/etc/gul-disk-alert.env` (root-only, `chmod 600`), written by
  the install workflow -- never committed to the repo.
- Installed on both primary and secondary -- either VPS filling up is worth knowing about.

`gul-primary-db-alert.{service,timer}` runs on the secondary every minute. It sends one critical
email after three consecutive failures to connect to primary Postgres and a recovery email when
connectivity returns. The alert is diagnostic only: fence the old primary and inspect replication
lag before promotion. Install it with `install-primary-db-alert.yml`; it reuses the root-only SMTP
credentials already installed for disk alerts.
