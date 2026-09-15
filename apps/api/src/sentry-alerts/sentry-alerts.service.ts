import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { TelegramBotService } from "../telegram-bot/telegram-bot.service";

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  count: string;
  permalink: string;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

@Injectable()
export class SentryAlertsService {
  private readonly logger = new Logger(SentryAlertsService.name);

  constructor(private telegramBot: TelegramBotService) {}

  // Polling, not a Sentry webhook: a plain outgoing-webhook alert action is gated to Sentry's
  // paid plans, while this project search API works on any plan. `age:-20m` against a 15-minute
  // interval gives a 5-minute overlap margin without ever re-reporting the same issue twice --
  // `age` is time-since-first-seen, so an issue that's still unresolved 20 minutes later has
  // already aged out of the window and won't resurface here.
  @Cron("*/15 * * * *")
  async checkForNewIssues() {
    const token = process.env.SENTRY_ALERT_TOKEN;
    if (!token) return;
    const org = process.env.SENTRY_ALERT_ORG ?? "gulyaly";
    const project = process.env.SENTRY_ALERT_PROJECT ?? "gul";

    let issues: SentryIssue[];
    try {
      const res = await fetch(
        `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=${encodeURIComponent("is:unresolved age:-20m")}&sort=new&limit=25`,
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

    for (const issue of issues) {
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
      await this.telegramBot.notifyAdmin(text);
    }
  }
}
