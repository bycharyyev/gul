---
name: devops
description: Operate topup-hub's production infrastructure (two VPS, GitHub Actions, Docker). Use this whenever a task touches deploy.yml or any other .github/workflows file, SSHes to a server, edits nginx/postfix/postgres config, or changes anything under /opt/gul* on either VPS. Captures the hard-won patterns and pitfalls from building this out -- skipping it means re-discovering the same bugs.
---

# topup-hub DevOps

This project's infra is two VPS provisioned entirely from GitHub Actions workflows -- there is no
hand-configured server state that isn't reproducible from this repo. Read
[CLAUDE.md](../../../CLAUDE.md)'s "Production deployment" section first for the current topology;
this skill is about *how* to safely change that infra, not what it currently looks like (that
drifts, this doesn't).

## DNS is scriptable now (Timeweb Cloud API)

`gulyaly.pro`'s NS points at Timeweb Cloud (`ns1/ns2.timeweb.ru`, `ns3/ns4.timeweb.org`) --
registrar stayed reg.ru, but Timeweb is the authoritative DNS. `manage-dns.yml` calls
`https://api.timeweb.cloud` with `TIMEWEB_API_TOKEN` (Bearer token, no IP allowlisting -- unlike
reg.ru's own API, which is why every DNS task before 2026-08-27 was a manual DNS-panel step).
Full gotchas (no `subdomain` field in the body, subdomains need `POST .../subdomains/{label}`
before a record can attach, `*` is a literal wildcard label) are in CLAUDE.md's "DNS management"
section -- read that before writing a new API call by hand, all of it was learned the hard way via
`400`/`404` errors with genuinely confusing messages.

## The `deploy` user has no sudo -- but IS in the `docker` group

That makes it root-equivalent on the host already (well-known docker caveat). Every workflow step
that needs to touch `/etc`, systemd, or ufw uses this pattern:

```bash
docker run --rm --pid=host --privileged -v /:/host alpine chroot /host /bin/sh /path/to/script.sh
```

- **Firewall (`ufw`/iptables) operations need `--network=host` added** -- `--pid=host` alone puts
  you in the host's process namespace but not its network namespace, so `ufw` would otherwise only
  affect the throwaway container's own isolated network stack and silently do nothing real.
- **`systemctl`/`apt-get` work fine through this** (proven repeatedly: installing docker itself,
  installing postfix, enabling services) -- once chrooted into `/host`, `systemctl` reaches the
  real host's systemd over the (also host-mounted) dbus socket.
- Never inline a `-c "..."` script through this trick if it has any variables in it. Write the
  script to a file first (scp it over, or `cat > file <<'EOF' ... EOF` locally then scp), then
  `chroot /host /bin/bash /path/to/script.sh`. Passing secrets through nested
  `ssh "... $(...) ..."` → `docker run -e ...` → `chroot ... bash -c '...'` layers is exactly how
  quoting bugs happen here. See the next section.

## Getting a secret into a remote script without breaking quoting

Established, repeatedly-proven pattern for any script that needs a password/token baked in:

1. Write the script locally with a placeholder: `cat > /tmp/foo.sh <<'SCRIPT' ... KEY='__PLACEHOLDER__' ... SCRIPT` (quoted heredoc delimiter `'SCRIPT'` so nothing in the body gets interpolated by the local shell).
2. Substitute the real value with `sed`, using `#` as the delimiter (never `/` -- base64 secrets contain `/`): `sed -i "s#__PLACEHOLDER__#$SECRET#" /tmp/foo.sh`.
3. `scp` the now-concrete script to the server, then `ssh ... 'bash /tmp/foo.sh && rm -f /tmp/foo.sh'` -- a single, simple, single-quoted remote command with **zero** variables needing remote-side expansion of anything secret.

This avoids ever needing to reason about how many backslashes survive local-shell → ssh →
docker-run-env → chroot → bash -c. Every nested-quoting bug in this repo's history came from
trying to skip this and inline a secret through multiple shell layers at once.

## `docker compose exec` inside an SSH-heredoc-fed script eats the rest of the script

If a remote command block is fed to `ssh ... 'bash -s'` via a heredoc (or is itself the body of a
multi-line `ssh host '...'` string), any `docker compose exec` call *without* `-T` -- or even with
`-T` if stdin isn't explicitly redirected -- attaches to the parent script's own stdin, which is
the heredoc pipe. It silently consumes the rest of the script (only the first such command
actually runs; everything after it is swallowed, and the job still reports success). **Always
append `< /dev/null`** to every `docker compose exec` call made this way.

## GitHub Actions gotchas specific to this repo's workflows

- **Job-level `permissions:` do not inherit across jobs in the same workflow.** A job that does
  `docker login ghcr.io` using `secrets.GITHUB_TOKEN` needs its own
  `permissions: { contents: read, packages: read }` even if an earlier job in the same workflow
  already declared broader permissions.
- **`gh run rerun --failed` reruns the original commit SHA**, not any new pushes made since. If a
  fix has landed, dispatch a fresh run (`gh workflow run ...` / `workflow_dispatch`) instead of
  rerunning a stale failed one.
- **Health checks are `/api/health/ready`, not `/health/ready`** -- `main.ts` sets
  `app.setGlobalPrefix("api")`, so every real route lives under `/api/...`. This has been the
  single most repeated mistake in this repo's workflow history; double-check the path before
  writing a new health-check curl.
- **`deploy.yml` is `paths:`-scoped** to things that actually affect the deployed app
  (`apps/**`, `packages/**`, compose file, lockfiles, `turbo.json`, or itself). A one-off ops
  workflow or an `infra/nginx` change should never trigger it -- if you add a new directory that
  should also affect the deployed app, add it to that `paths:` list, don't rely on it firing by
  accident.
- **`deploy.yml` has `concurrency: { group: deploy-main, cancel-in-progress: false }`** -- pushes
  queue rather than race each other. You don't need to manually wait for one push's deploy to
  finish before making another commit; GitHub serializes them. You *do* still need to wait before
  running a separate, non-queued workflow that touches the same `/opt/gul/.env` (like a one-off
  ops script), since that one isn't in the same concurrency group and could race a queued deploy.
- **`deploy.yml` deploys primary, then `deploy-secondary` (needs: deploy) syncs the same SHA tag
  to the secondary** -- both nodes always end up on an identical, health-checked image. Don't
  reintroduce a path where only primary gets updated; the secondary is a live active/active node,
  not a cold spare, and stale code there is a real (if currently traffic-free, pending DNS) risk.

## One-off ops workflows: create, run, delete

A workflow that exists to answer one question or perform one migration ("check whether X is
configured", "bootstrap SSH on a brand-new VPS") gets committed, dispatched, and then **deleted in
a follow-up commit** once it's served its purpose. Don't let the workflow list accumulate
single-use scripts -- `git log` is the record that it happened; the workflow file itself isn't
meant to be a permanent fixture. Exception: anything that might legitimately need re-running later
(replication setup, failover, active/active enablement) stays, because it's idempotent and
genuinely reusable operational tooling, not a one-shot migration.

## Secrets

Production secrets live in exactly two places, never a third:

1. **GitHub Actions repo secrets** (`gh secret list`) -- used by workflows to reach the servers
   and to seed values workflows write into `.env` files.
2. **`/opt/gul/.env`** on primary and `/opt/gul-secondary/.env` on the secondary -- real runtime
   config, referenced by `docker-compose.*.yml` via `env_file`. Never committed.

Never print a secret value in a workflow log -- when a diagnostic needs to report on `.env`
contents, report key *names* and value *lengths* only (see the pattern in `diagnose.yml`'s
"`.env` KEYS ONLY" step), never the values themselves. When generating a brand-new credential
inside a workflow (e.g. provisioning a new service account password), prefer generating it
in-run and using it directly in the same job over minting a new persistent GitHub secret for it --
less standing credential material to leak, and `gh secret set` piping a freshly-generated
credential has previously been blocked by the local safety classifier anyway.
