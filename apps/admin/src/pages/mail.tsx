import { useEffect, useState } from "react";
import type {
  EmailLogDto,
  EmailSettingsDto,
  EmailHealthDto,
  EmailSuppressionDto,
  EmailOutboxRowDto,
} from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";

const KIND_KEYS: Record<string, string> = {
  ORDER_CREATED: "admin.mail.kind.orderCreated",
  ORDER_COMPLETED: "admin.mail.kind.orderCompleted",
  ORDER_FAILED: "admin.mail.kind.orderFailed",
  MARKETING: "admin.mail.kind.marketing",
  TEST: "admin.mail.kind.test",
};

function kindLabel(t: (key: string) => string, kind: string): string {
  const mappedKey = KIND_KEYS[kind];
  return mappedKey ? t(mappedKey) : kind;
}

export default function MailPage() {
  const { t, locale } = useTranslation();
  const [settings, setSettings] = useState<EmailSettingsDto | null>(null);
  const [logs, setLogs] = useState<EmailLogDto[]>([]);
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);

  const [health, setHealth] = useState<EmailHealthDto | null>(null);
  const [suppressions, setSuppressions] = useState<EmailSuppressionDto[]>([]);
  const [failedOutbox, setFailedOutbox] = useState<EmailOutboxRowDto[]>([]);
  const [opsBusy, setOpsBusy] = useState(false);

  function loadLogs() {
    api.listEmailLogs().then(setLogs).catch(() => {});
  }

  function loadOps() {
    api.getMailHealth().then(setHealth).catch(() => {});
    api.listEmailSuppressions().then(setSuppressions).catch(() => {});
    api.listFailedOutbox().then(setFailedOutbox).catch(() => {});
  }

  async function unsuppress(email: string) {
    setOpsBusy(true);
    try {
      await api.removeEmailSuppression(email);
      loadOps();
    } finally {
      setOpsBusy(false);
    }
  }

  async function retryOutboxRow(id: string) {
    setOpsBusy(true);
    try {
      await api.retryOutbox(id);
      loadOps();
    } finally {
      setOpsBusy(false);
    }
  }

  useEffect(() => {
    api.getEmailSettings().then(setSettings).catch(() => {});
    loadLogs();
    loadOps();
  }, []);

  async function toggle(key: "transactionalEnabled" | "marketingEnabled") {
    if (!settings) return;
    setSettingsBusy(true);
    try {
      const updated = await api.updateEmailSettings({ [key]: !settings[key] });
      setSettings(updated);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setTestBusy(true);
    setTestStatus(null);
    try {
      await api.sendTestEmail({ toEmail: testEmail });
      setTestStatus(t("admin.mail.testSentNotice"));
      loadLogs();
    } catch (err) {
      setTestStatus(err instanceof ApiError ? translateError(t, err.message) : t("admin.mail.testSendError"));
    } finally {
      setTestBusy(false);
    }
  }

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm(t("admin.mail.broadcastConfirm"))) return;
    setBroadcastBusy(true);
    setBroadcastStatus(null);
    try {
      const result = await api.sendMarketingEmail({ subject, body });
      setBroadcastStatus(t("admin.mail.broadcastSent", { count: result.recipientCount }));
      setSubject("");
      setBody("");
      loadLogs();
    } catch (err) {
      setBroadcastStatus(err instanceof ApiError ? translateError(t, err.message) : t("admin.mail.broadcastError"));
    } finally {
      setBroadcastBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.mail.title")}</h1>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.mail.settingsTitle")}</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm">
              {t("admin.mail.transactionalLabel")}
              <span className="block text-xs text-slate-400">{t("admin.mail.transactionalHint")}</span>
            </span>
            <input
              type="checkbox"
              checked={settings?.transactionalEnabled ?? false}
              disabled={!settings || settingsBusy}
              onChange={() => toggle("transactionalEnabled")}
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm">
              {t("admin.mail.marketingLabel")}
              <span className="block text-xs text-slate-400">{t("admin.mail.marketingHint")}</span>
            </span>
            <input
              type="checkbox"
              checked={settings?.marketingEnabled ?? false}
              disabled={!settings || settingsBusy}
              onChange={() => toggle("marketingEnabled")}
            />
          </label>
        </div>
        <p className="mt-4 text-xs text-slate-400">{t("admin.mail.smtpHint")}</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.mail.testTitle")}</h2>
        <form onSubmit={sendTest} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.mail.emailLabel")}</label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <Button type="submit" disabled={testBusy}>
            {testBusy ? t("admin.mail.sending") : t("admin.mail.send")}
          </Button>
        </form>
        {testStatus && <p className="mt-2 text-sm text-slate-500">{testStatus}</p>}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.mail.broadcastTitle")}</h2>
        <form onSubmit={sendBroadcast} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.mail.subjectLabel")}</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.mail.bodyLabel")}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              required
            />
          </div>
          <p className="text-xs text-slate-400">{t("admin.mail.broadcastHint")}</p>
          <Button type="submit" variant="danger" disabled={broadcastBusy}>
            {broadcastBusy ? t("admin.mail.sending") : t("admin.mail.sendBroadcast")}
          </Button>
          {broadcastStatus && <p className="text-sm text-slate-500">{broadcastStatus}</p>}
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.mail.logTitle")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">{t("admin.mail.colType")}</th>
                <th className="py-2 pr-4">{t("admin.mail.colRecipient")}</th>
                <th className="py-2 pr-4">{t("admin.mail.colSubject")}</th>
                <th className="py-2 pr-4">{t("admin.mail.colStatus")}</th>
                <th className="py-2 pr-4">{t("admin.mail.colWhen")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2 pr-4">{kindLabel(t, log.kind)}</td>
                  <td className="py-2 pr-4">{log.toEmail}</td>
                  <td className="max-w-[200px] truncate py-2 pr-4">{log.subject}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {new Date(log.createdAt).toLocaleString(LOCALE_BCP47[locale])}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                    {t("admin.mail.noLogs")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t("admin.mail.healthTitle")}</h2>
        {health ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={health.smtpReachable ? "SENT" : "FAILED"} />
              <span className="text-slate-400">{health.smtpHost ?? "—"}</span>
              {health.smtpError && <span className="text-rose-600">{health.smtpError}</span>}
            </div>
            <p className="text-slate-400">
              From: {health.from}
              {health.replyTo ? ` · Reply-To: ${health.replyTo}` : ""}
            </p>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>{t("admin.mail.quotaLabel")}</span>
                <span>
                  {health.quota.used} / {health.quota.limit} ({health.quota.usedPercent}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-500/15">
                {/* Thresholds match the ones the alerting uses, so the dashboard and the alert
                    email never disagree about how worried to be. */}
                <div
                  className={`h-full rounded-full ${
                    health.quota.usedPercent >= 85
                      ? "bg-rose-500"
                      : health.quota.usedPercent >= 70
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, health.quota.usedPercent)}%` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
              {health.queues.map((q) => (
                <span key={String(q.name)}>
                  {String(q.name)}: {String(q.waiting ?? 0)} waiting / {String(q.failed ?? 0)} failed
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">{t("common.loading")}</p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-lg font-semibold">{t("admin.mail.suppressionTitle")}</h2>
        <p className="mb-4 text-xs text-slate-400">{t("admin.mail.suppressionHint")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">{t("admin.mail.suppressionReason")}</th>
                <th className="pb-2 pr-4">{t("admin.mail.suppressionNote")}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {suppressions.map((row) => (
                <tr key={row.id} className="border-t border-slate-500/10">
                  <td className="py-2 pr-4">{row.email}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={row.reason} />
                  </td>
                  <td className="max-w-[260px] truncate py-2 pr-4 text-slate-400">{row.note ?? "—"}</td>
                  <td className="py-2">
                    <Button size="sm" variant="ghost" disabled={opsBusy} onClick={() => unsuppress(row.email)}>
                      {t("admin.mail.suppressionRemove")}
                    </Button>
                  </td>
                </tr>
              ))}
              {suppressions.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                    {t("admin.mail.suppressionEmpty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-lg font-semibold">{t("admin.mail.outboxTitle")}</h2>
        <p className="mb-4 text-xs text-slate-400">{t("admin.mail.outboxHint")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-2 pr-4">{t("admin.mail.colKind")}</th>
                <th className="pb-2 pr-4">{t("admin.mail.outboxOrder")}</th>
                <th className="pb-2 pr-4">{t("admin.mail.outboxAttempts")}</th>
                <th className="pb-2 pr-4">{t("admin.mail.outboxError")}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {failedOutbox.map((row) => (
                <tr key={row.id} className="border-t border-slate-500/10">
                  <td className="py-2 pr-4">{kindLabel(t, row.kind)}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.orderId ?? "—"}</td>
                  <td className="py-2 pr-4">{row.attempts}</td>
                  <td className="max-w-[260px] truncate py-2 pr-4 text-rose-600">{row.lastError ?? "—"}</td>
                  <td className="py-2">
                    <Button size="sm" variant="secondary" disabled={opsBusy} onClick={() => retryOutboxRow(row.id)}>
                      {t("admin.mail.outboxRetry")}
                    </Button>
                  </td>
                </tr>
              ))}
              {failedOutbox.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                    {t("admin.mail.outboxEmpty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
