import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { AdminTelegramBotService } from "../admin-telegram-bot/admin-telegram-bot.service";

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  count: string;
  permalink: string;
  firstSeen: string;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

@Injectable()
export class SentryAlertsService {
  private readonly logger = new Logger(SentryAlertsService.name);

  // Set at boot, not the epoch: a fresh deploy restarts this service, and it should only report
  // issues that are new from here on, not replay every already-unresolved issue on every deploy.
  private lastCheckedAt = new Date();

  constructor(private adminTelegramBot: AdminTelegramBotService) {}

  // Polling, not a Sentry webhook: a plain outgoing-webhook alert action is gated to Sentry's
  // paid plans, while this project search API works on any plan. Dedup is a `firstSeen` watermark
  // in memory, not a fixed `age:-Nm` window -- a window has to be at least as wide as the 15-minute
  // poll interval to guarantee catching an issue at all, but anything wider than the interval
  // re-matches that same issue on the *next* tick too (this previously used age:-20m, which is
  // exactly that: an issue first seen with <5 minutes left before a tick got caught by that tick
  // and, still within the 20-minute window, by the one after it -- confirmed in production as two
  // identical Telegram alerts 15 minutes apart for one single-occurrence issue). Comparing
  // `firstSeen` against a watermark that only advances after a successful fetch has no such
  // window to tune: a failed fetch leaves the watermark alone so the next tick still covers the
  // gap, and a successful one reports each issue exactly once no matter how ticks line up.
  @Cron("*/15 * * * *")
  async checkForNewIssues() {
    const token = process.env.SENTRY_ALERT_TOKEN;
    if (!token) return;
    const org = process.env.SENTRY_ALERT_ORG ?? "gulyaly";
    const project = process.env.SENTRY_ALERT_PROJECT ?? "gul";

    const since = this.lastCheckedAt;
    const checkedAt = new Date();

    let issues: SentryIssue[];
    try {
      // age:-1h is just a generous upper bound so Sentry doesn't hand back its entire unresolved
      // backlog -- the actual cutoff is the firstSeen/since comparison below.
      const res = await fetch(
        `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=${encodeURIComponent("is:unresolved age:-1h")}&sort=new&limit=25`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        this.logger.warn(`Sentry issues fetch failed: ${res.status} ${await res.text()}`);
        return;
      }
      issues = (await res.json()) as SentryIssue[];
    } catch (err) {
      this.logger.warn(`Sentry issues fetch failed: ${err}`);
      return;
    }

    this.lastCheckedAt = checkedAt;

    for (const issue of issues) {
      if (new Date(issue.firstSeen) <= since) continue;
      const levelEmoji = issue.level === "fatal" || issue.level === "error" ? "🔴" : "🟠";
      const text = [
        `${levelEmoji} <b>Новая ошибка на проде</b>`,
        escapeHtml(issue.title),
        issue.culprit ? escapeHtml(issue.culprit) : null,
        `Уже ${issue.count} раз · ${issue.shortId}`,
        issue.permalink,
      ]
        .filter(Boolean)
        .join("\n");
      await this.adminTelegramBot.notifyAdmin(text);
    }
  }
}
