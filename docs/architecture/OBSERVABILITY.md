# Observability: metrics + logs

Deliberately built on the Netdata install already running on primary rather than adding
Prometheus/Grafana/Loki — see [[feedback-architecture-discuss-first-topup-hub|the reasoning]]:
2 VPS, MVP stage, keep it to one lightweight agent instead of a multi-service stack.

## Metrics — Netdata, primary as parent, secondary streams in

- **Primary** (`DEPLOY_HOST`) runs Netdata as the "parent". Dashboard:
  `https://admin.gulyaly.pro/netdata` — sits behind a custom login gate
  (`netdata-gate.service`, `/opt/netdata-gate/netdata_gate.py`, proxied by nginx at
  `/netdata-login` + `/netdata-check`) since Netdata has no auth of its own. Credentials: rotate
  via `.github/workflows/rotate-netdata-gate.yml` (generates fresh `GATE_PASS`/`GATE_SECRET` on
  the runner, applies them, never prints them to a log).
- **Secondary** (`91.184.250.89`) runs Netdata as a streaming "child" — pushes its metrics to
  primary over port 19999, firewalled to secondary's IP only (`ufw`). No separate login/dashboard
  on secondary; view both nodes from the one primary dashboard's node switcher.
- Set up / re-set-up via `.github/workflows/setup-observability.yml` (idempotent — safe to rerun
  if netdata needs reinstalling on either box, e.g. after a VPS rebuild).
- Streaming API key lives only in `/etc/netdata/stream.conf` on each box — not a GitHub secret,
  regenerated fresh by the workflow each time it's run.

**CPU incident, 2026-08-29 — netdata's defaults are not actually lightweight on a small VPS.**
Secondary's load average hit **23** (6 vCPU box) a few hours after setup, with `netdata` +
`go.d.plugin` + `apps.plugin` sustaining roughly **1.9 cores continuously** — severe enough that
basic `docker system df`/`docker image prune` calls took 5-8 minutes each and `deploy.yml`'s
`deploy-secondary` job repeatedly stalled/dropped its SSH connection mid-pull. Root cause: the
default install collects every metric every **1 second** and runs `ebpf.plugin` (kernel-level
syscall tracing) by default — both expensive, neither needed for basic infra monitoring. Fixed
with two `netdata.conf` settings, applied to both hosts and now baked into
`setup-observability.yml` itself so a future reinstall doesn't reintroduce it:
```
[global]
    update every = 5

[plugins]
    ebpf = no
```
Load returned to normal (~1.0) once applied. If netdata ever needs live per-second detail for
active debugging, that's a temporary manual `update every = 1` + restart, not the standing config.

## Logs — journald + Netdata's built-in journal viewer

- Docker containers on both hosts log via the `journald` driver (`docker-compose.prod.yml` /
  `docker-compose.secondary.yml`'s `x-logging` anchor), not `json-file` — this is what makes
  container logs (api/web/admin) show up in Netdata's Logs section alongside the system services
  that already used journald (Postfix, OpenDKIM, nginx).
- **Known gap**: `pg-standby` on secondary is a bare `docker run` container (not part of
  `docker-compose.secondary.yml`, see [HIGH_AVAILABILITY.md](HIGH_AVAILABILITY.md)), so it's still
  on `json-file` — not switched, to avoid touching the replication container unnecessarily. Low
  priority; its own logs are rarely what you'd need mid-incident.
- **Retention**: journald is capped at `SystemMaxUse=1G` per host
  (`/etc/systemd/journald.conf.d/retention.conf`), set by the same setup workflow — this replaces
  the old per-container `json-file` `max-size`/`max-file` caps as the disk-safety mechanism for
  logs. Revisit the 1G figure once there's a sense of real log volume.

## What this doesn't cover

No alerting is wired to Netdata's own alert engine yet (it has one built in, unconfigured). The
disk-usage-over-80% email alert (separate mechanism, via the mail relay) is still the only active
alert — see the mail-split docs. Text/full-text search over logs beyond Netdata's own journal
query UI (no Elasticsearch) isn't available; fine for the current log volume, revisit if that
becomes limiting.
