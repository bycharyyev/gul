# Auto-deploy from the server side

The server watches `main` and ships it, with no runner in the middle.

**This is a standby, not the normal path.** `deploy.yml` is how releases ship; it runs on free,
unmetered runners now that the repository is public. This exists because that was not always true:
a billing block stops *every* Actions job, the build included, and for a day nothing could reach
production and no image was built for it either.

Not installed on the server by default — see "Installing" below. Installed, the two do not fight:
both write the same `IMAGE_TAG` into `/opt/gul/.env`, and this one does nothing when the tag it
would deploy is already the tag running. Whichever gets there first wins, the other is a no-op.

## What it does on each tick

1. `git fetch` in `/opt/gul/src`, compare `origin/main` with the running `IMAGE_TAG`; stop if equal.
2. Refuse to start if the disk or memory is too tight to build safely.
3. Build `api`, `web`, `admin` **one at a time**, tagged with the commit SHA.
4. Only when all three exist: write the tag, run `prisma migrate deploy`, restart, health-check.
5. On a failed health check, roll back — unless the release carries a destructive migration, in
   which case it refuses and says so.

The rollback rules are copied from the pipeline rather than softened. They were learned from real
outages, and they are documented at the top of `gul-autodeploy.sh`.

## What it needs before it will run

**Swap.** The box has 3.8 GiB of RAM and also runs Postgres. A Next.js build peaks near 2 GiB, and
when the kernel runs out of memory it kills whatever it likes — often the database. The script
refuses to build below 5.5 GiB of RAM + swap, so add swap once, as root:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**`GH_ACTIONS_TOKEN` in `/opt/gul/.env`.** Already there for the managed-subdomains feature; the
script reuses it to clone a private repo rather than adding a second credential. It needs contents
read on this repo.

## Installing (once, as root, from the hosting panel console)

```bash
install -d -o deploy -g deploy /opt/gul/bin /opt/gul/src
curl -fsSL -H "Authorization: token $GH_TOKEN" -H "Accept: application/vnd.github.raw" -o /opt/gul/bin/gul-autodeploy.sh https://api.github.com/repos/bycharyyev/gul/contents/infra/autodeploy/gul-autodeploy.sh
chmod 755 /opt/gul/bin/gul-autodeploy.sh && chown deploy:deploy /opt/gul/bin/gul-autodeploy.sh
```

Then the units, from the same checkout the script keeps (after its first run) or pasted by hand:

```bash
cp /opt/gul/src/infra/autodeploy/gul-autodeploy.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now gul-autodeploy.timer
```

## Watching it

```bash
journalctl -u gul-autodeploy -f
```

A tick with nothing to do prints one line. A deploy prints its stages, and a failure prints why
and what it did about it. `systemctl list-timers gul-autodeploy.timer` shows when it next fires.

To ship something immediately rather than waiting out the two-minute timer:

```bash
systemctl start gul-autodeploy.service
```

## What this deliberately does not do

**It does not touch the secondary.** `deploy.yml` syncs both nodes; this ships primary only. While
Actions is unavailable, the secondary keeps running the older image against the same primary
database — which is safe for additive migrations and *not* safe for a schema change the old code
cannot read. Until the secondary has its own copy of this timer, treat a destructive migration as
requiring Actions, or as requiring the secondary to be updated by hand.

**It does not run the test suite.** The pipeline gates a deploy on `pnpm typecheck && pnpm build`
and the test suites; a build failure here stops the release, but a passing build with failing
tests does not. Run the tests before pushing — that gate now lives with whoever pushes.

**It does not verify the commit.** Anything that reaches `main` deploys itself within two minutes.
That is the point of it, and it is also the whole risk: there is no longer a human or a green
check between a push and production.
