/**
 * What this API process is for (ADR 0008).
 *
 * - `all` (default, and what production runs today): serve HTTP and run all background work.
 * - `http`: serve HTTP only. It still enqueues jobs and sends outbound Telegram/email/push from
 *   request handlers; it starts no BullMQ worker, no sweeper or cron, and no Telegram long-polling.
 *   Several `http` processes can run side by side behind nginx.
 * - `worker`: run the background work. It still listens (on its own, loopback-only port) so its
 *   health can be checked, but it is never in the public upstream.
 *
 * Unknown values fall back to `all`, never to `http`: a typo must not silently stop payments
 * reconciling or top-ups being delivered.
 */
export type AppRole = "all" | "http" | "worker";

export function appRole(): AppRole {
  const raw = (process.env.APP_ROLE ?? "").trim().toLowerCase();
  return raw === "http" || raw === "worker" ? raw : "all";
}

/** Whether this process runs BullMQ workers, sweepers, crons and Telegram polling. */
export function runsBackgroundWork(): boolean {
  return appRole() !== "http";
}
