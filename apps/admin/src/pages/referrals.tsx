import { useEffect, useState } from "react";
import type { ReferralLedgerEntryDto, ReferralLeaderboardEntryDto, ReferralSettingsDto } from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_KEYS: Record<string, string> = {
  PENDING: "admin.referrals.statusPending",
  REWARDED: "admin.referrals.statusRewarded",
  VOID: "admin.referrals.statusVoid",
};

function rangePreset(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Where a referral's click came from, condensed to one readable label. utm_source wins when
 *  present (a deliberate campaign tag beats a guess from the referrer header); otherwise falls
 *  back to the referring site's host; otherwise this was a code typed in directly or shared
 *  through a channel that strips the header (most native share sheets, some in-app browsers). */
function formatSource(attribution: ReferralLedgerEntryDto["attribution"]): { label: string; title: string | null } {
  const { utmSource, utmMedium, utmCampaign, referrerUrl } = attribution;

  if (utmSource) {
    const parts = [utmSource, utmMedium, utmCampaign].filter(Boolean);
    return { label: utmSource, title: parts.length > 1 ? parts.join(" / ") : null };
  }

  if (referrerUrl) {
    try {
      return { label: new URL(referrerUrl).hostname, title: referrerUrl };
    } catch {
      return { label: referrerUrl, title: null };
    }
  }

  return { label: "—", title: null };
}

export default function ReferralsPage() {
  const { t, locale } = useTranslation();
  const [settings, setSettings] = useState<ReferralSettingsDto | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [ledger, setLedger] = useState<ReferralLedgerEntryDto[]>([]);
  const [leaderboard, setLeaderboard] = useState<ReferralLeaderboardEntryDto[]>([]);
  const [range, setRange] = useState<7 | 30>(7);

  function loadLedger() {
    api.listReferralLedger().then(setLedger).catch(() => {});
  }

  function loadLeaderboard(days: 7 | 30) {
    api.getReferralLeaderboard(rangePreset(days)).then(setLeaderboard).catch(() => {});
  }

  useEffect(() => {
    api.getReferralSettings().then(setSettings).catch(() => {});
    loadLedger();
    loadLeaderboard(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleEnabled() {
    if (!settings) return;
    setSettingsBusy(true);
    try {
      const updated = await api.updateReferralSettings({ enabled: !settings.enabled });
      setSettings(updated);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function saveRewards(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSettingsBusy(true);
    try {
      const updated = await api.updateReferralSettings({
        customerRewardTmt: settings.customerRewardTmt,
        sellerRewardTmt: settings.sellerRewardTmt,
      });
      setSettings(updated);
    } finally {
      setSettingsBusy(false);
    }
  }

  function selectRange(days: 7 | 30) {
    setRange(days);
    loadLeaderboard(days);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.referrals.title")}</h1>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.referrals.settingsTitle")}</h2>
        <label className="mb-4 flex items-center justify-between">
          <span className="text-sm">
            {t("admin.referrals.enabledLabel")}
            <span className="block text-xs text-slate-400">{t("admin.referrals.enabledHint")}</span>
          </span>
          <input
            type="checkbox"
            checked={settings?.enabled ?? false}
            disabled={!settings || settingsBusy}
            onChange={toggleEnabled}
          />
        </label>

        {settings && (
          <form onSubmit={saveRewards} className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {t("admin.referrals.customerRewardLabel")}
              </label>
              <Input
                type="number"
                min={0}
                value={settings.customerRewardTmt}
                onChange={(e) => setSettings({ ...settings, customerRewardTmt: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {t("admin.referrals.sellerRewardLabel")}
              </label>
              <Input
                type="number"
                min={0}
                value={settings.sellerRewardTmt}
                onChange={(e) => setSettings({ ...settings, sellerRewardTmt: Number(e.target.value) })}
              />
            </div>
            <Button type="submit" disabled={settingsBusy}>
              {t("common.save")}
            </Button>
          </form>
        )}
        <p className="mt-4 text-xs text-slate-400">{t("admin.referrals.rewardNote")}</p>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">{t("admin.referrals.leaderboardTitle")}</h2>
          <div className="flex gap-2">
            <Button variant={range === 7 ? "primary" : "secondary"} size="sm" onClick={() => selectRange(7)}>
              {t("admin.referrals.days7")}
            </Button>
            <Button variant={range === 30 ? "primary" : "secondary"} size="sm" onClick={() => selectRange(30)}>
              {t("admin.referrals.days30")}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">{t("admin.referrals.colReferrer")}</th>
                <th className="py-2 pr-4">{t("admin.referrals.colType")}</th>
                <th className="py-2 pr-4">{t("admin.referrals.colInvites")}</th>
                <th className="py-2 pr-4">{t("admin.referrals.colRewarded")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaderboard.map((entry, i) => (
                <tr key={`${entry.referrerType}-${entry.label}-${i}`}>
                  <td className="py-2 pr-4 font-semibold">{i + 1}</td>
                  <td className="py-2 pr-4">{entry.label}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">
                    {entry.referrerType === "SELLER" ? t("admin.referrals.typeSeller") : t("admin.referrals.typeCustomer")}
                  </td>
                  <td className="py-2 pr-4">{entry.count}</td>
                  <td className="py-2 pr-4">{entry.totalRewardTmt} TMT</td>
                </tr>
              ))}
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                    {t("admin.referrals.noRewardsPeriod")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">{t("admin.referrals.manualPrizeNote")}</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.referrals.logTitle")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">{t("admin.referrals.colReferrer")}</th>
                <th className="py-2 pr-4">{t("admin.referrals.colReferee")}</th>
                <th className="py-2 pr-4">{t("admin.referrals.colCode")}</th>
                <th className="py-2 pr-4">{t("admin.referrals.colStatus")}</th>
                <th className="py-2 pr-4">{t("admin.referrals.colReward")}</th>
                <th className="py-2 pr-4">{t("admin.referrals.colSource")}</th>
                <th className="py-2 pr-4">{t("admin.referrals.colWhen")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((r) => {
                const statusKey = STATUS_KEYS[r.status];
                const source = formatSource(r.attribution);
                return (
                <tr key={r.id}>
                  <td className="py-2 pr-4">{r.referrer.label}</td>
                  <td className="py-2 pr-4">{r.referee.label}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.username}</td>
                  <td className="py-2 pr-4">{statusKey ? t(statusKey) : r.status}</td>
                  <td className="py-2 pr-4">{r.rewardAmountTmt !== null ? `${r.rewardAmountTmt} TMT` : "—"}</td>
                  <td className="py-2 pr-4 text-xs text-slate-500" title={source.title ?? undefined}>
                    {source.label}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {new Date(r.createdAt).toLocaleString(LOCALE_BCP47[locale])}
                  </td>
                </tr>
                );
              })}
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-slate-400">
                    {t("admin.referrals.noReferrals")}
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
