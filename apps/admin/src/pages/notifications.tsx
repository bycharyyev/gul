import { useEffect, useState } from "react";
import type { SellerTelegramStatusDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { openTelegramDeepLink } from "@/lib/open-telegram";
import { CampaignsTab } from "@/pages/push/campaigns-tab";
import { OneTab } from "@/pages/push/one-tab";
import { StatsTab } from "@/pages/push/stats-tab";
import { TemplatesTab } from "@/pages/push/templates-tab";

type TabKey = "stats" | "campaigns" | "templates" | "one" | "telegram";

const TABS: { key: TabKey; label: string }[] = [
  { key: "stats", label: "Статистика" },
  { key: "campaigns", label: "Рассылки" },
  { key: "templates", label: "Шаблоны" },
  { key: "one", label: "Одному человеку" },
  { key: "telegram", label: "Telegram" },
];

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>("stats");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("admin.notifications.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Push-уведомления в приложении: рассылки, шаблоны, личные сообщения и статистика. Telegram-бот для
          служебных алертов вынесен в отдельную вкладку.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === item.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "stats" && <StatsTab />}
      {tab === "campaigns" && <CampaignsTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "one" && <OneTab />}
      {tab === "telegram" && <TelegramCard />}
    </div>
  );
}

function TelegramCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SellerTelegramStatusDto | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.getPlatformTelegramStatus().then(setStatus).catch(() => {});
  }

  useEffect(load, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.generatePlatformTelegramLinkCode();
      setDeepLink(res.deepLink);
      if (res.deepLink) openTelegramDeepLink(res.deepLink);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.notifications.connectError"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api.unlinkPlatformTelegram();
      setDeepLink(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.notifications.disconnectError"));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <Card className="max-w-xl p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">{t("admin.notifications.telegramTitle")}</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        {t("admin.notifications.telegramDescription", { bot: status.botUsername ?? "sellergulyalybot" })}
      </p>

      {status.linked ? (
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("admin.notifications.connected")}
          </span>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>
            {t("admin.notifications.disconnect")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Button onClick={connect} disabled={busy}>
            {busy ? t("admin.notifications.preparingLink") : t("admin.notifications.connectTelegram")}
          </Button>
          {deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                openTelegramDeepLink(deepLink);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50"
            >
              {t("admin.notifications.openTelegram")}
            </a>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </Card>
  );
}
