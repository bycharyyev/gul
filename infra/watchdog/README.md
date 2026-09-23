# App watchdog

`docker compose`'s `restart: unless-stopped` is not proven reliable on its own — a real failure
test on 2026-08-26 killed the `api` container and it stayed down (`RestartCount` stuck at 0,
Docker's own restart policy never re-engaged) until a human ran `docker compose up -d` by hand.
Root cause wasn't found (the `deploy` user can't read the full systemd journal to see why), so
this exists as an independent safety net rather than a fix for the underlying cause.

`gul-watchdog.timer` runs `gul-watchdog.sh` every 30s: curls `/health/ready` on `127.0.0.1:4000`,
and if it fails, runs `docker compose up -d` in `/opt/gul` (idempotent — a no-op for anything
already healthy, only touches what compose thinks needs to change). Logs to the journal
(`journalctl -u gul-watchdog`).

Installed by `.github/workflows/install-watchdog.yml` — source of truth is this directory, not
whatever ends up on the server; re-run that workflow after editing anything here.
