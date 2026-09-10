import { useEffect, useState } from "react";
import type { ApiUsageDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";

const WINDOWS = [1, 7, 30] as const;

export default function ApiUsagePage() {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(7);
  const [usage, setUsage] = useState<ApiUsageDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    api
      .getApiUsage(days)
      .then(setUsage)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [days]);

  const totals = usage?.totals;
  // The number staff actually act on: what share of traffic is failing right now.
  const errorRate =
    totals && totals.total > 0
      ? ((totals.clientError + totals.serverError) / totals.total) * 100
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.apiUsage.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("admin.apiUsage.description")}</p>
        </div>
        <div className="flex gap-2">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                days === w
                  ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t("admin.apiUsage.windowDays", { days: String(w) })}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <Card className="p-4 text-sm text-rose-600">{t("admin.apiUsage.loadFailed")}</Card>
      )}

      {loading && !usage && (
        <Card className="p-4 text-sm text-slate-500">{t("admin.apiUsage.loading")}</Card>
      )}

      {usage && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("admin.apiUsage.requests")} value={fmt(usage.totals.total)} />
            <Stat label={t("admin.apiUsage.ok")} value={fmt(usage.totals.ok)} />
            <Stat
              label={t("admin.apiUsage.clientErrors")}
              value={fmt(usage.totals.clientError)}
              tone={usage.totals.clientError > 0 ? "warn" : undefined}
            />
            <Stat
              label={t("admin.apiUsage.serverErrors")}
              value={fmt(usage.totals.serverError)}
              // Any 5xx at all is ours to explain, so it is coloured even at a count of one.
              tone={usage.totals.serverError > 0 ? "bad" : undefined}
            />
          </div>

          <Card className="p-4">
            <p className="text-sm text-slate-500">
              {t("admin.apiUsage.errorRate")}{" "}
              <span className="font-semibold text-slate-900">{errorRate.toFixed(2)}%</span>
            </p>
            <DailyBars data={usage.byDay} />
          </Card>

          <Section title={t("admin.apiUsage.byTier")}>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("admin.apiUsage.colTier")}</th>
                  <th className="px-4 py-3 text-right">{t("admin.apiUsage.colTotal")}</th>
                  <th className="px-4 py-3 text-right">4xx</th>
                  <th className="px-4 py-3 text-right">5xx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usage.byTier.map((row) => (
                  <tr key={row.tier}>
                    <td className="px-4 py-3 font-medium">
                      {t(`admin.apiUsage.tier.${row.tier}`)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(row.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(row.clientError)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(row.serverError)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {usage.byApiKey.length > 0 && (
            <Section title={t("admin.apiUsage.byKey")}>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t("admin.apiUsage.colKey")}</th>
                    <th className="px-4 py-3 text-right">{t("admin.apiUsage.colTotal")}</th>
                    <th className="px-4 py-3 text-right">4xx</th>
                    <th className="px-4 py-3 text-right">5xx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usage.byApiKey.map((row) => (
                    <tr key={row.apiKeyId}>
                      <td className="px-4 py-3">
                        {/* A deleted key keeps its counters; showing the bare id is more honest
                            than dropping the traffic from the report. */}
                        <span className="font-medium">
                          {row.name ?? t("admin.apiUsage.deletedKey")}
                        </span>
                        {/* Which surface this traffic hit. Without it a seller's key is one more
                            unexplained partner in the list. */}
                        <span
                          className={
                            row.kind === "shop"
                              ? "ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                              : "ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300"
                          }
                        >
                          {t(
                            row.kind === "shop"
                              ? "admin.apiUsage.kindShop"
                              : "admin.apiUsage.kindPartner",
                          )}
                        </span>
                        {row.shop ? (
                          <span className="ml-2 text-xs text-slate-500">
                            {row.shop.shopName} · @{row.shop.handle}
                          </span>
                        ) : (
                          row.ownerLabel && (
                            <span className="ml-2 text-xs text-slate-500">{row.ownerLabel}</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(row.total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(row.clientError)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(row.serverError)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          <Section title={t("admin.apiUsage.endpoints")}>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("admin.apiUsage.colEndpoint")}</th>
                  <th className="px-4 py-3 text-right">{t("admin.apiUsage.colTotal")}</th>
                  <th className="px-4 py-3 text-right">4xx</th>
                  <th className="px-4 py-3 text-right">5xx</th>
                  <th className="px-4 py-3 text-right">{t("admin.apiUsage.colAvgMs")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usage.endpoints.slice(0, 50).map((row) => (
                  <tr key={row.endpoint}>
                    <td className="px-4 py-3 font-mono text-xs">{row.endpoint}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(row.total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(row.clientError)}</td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        row.serverError > 0 ? "font-semibold text-rose-600" : ""
                      }`}
                    >
                      {fmt(row.serverError)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.avgMs === null ? "—" : `${row.avgMs} ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {usage.totals.total === 0 && (
            <Card className="p-4 text-sm text-slate-500">{t("admin.apiUsage.empty")}</Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" }) {
  const color =
    tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-slate-900";
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">{children}</div>
      </Card>
    </div>
  );
}

/**
 * A plain CSS bar per day. No chart library: this is one series of at most 30 values, and the
 * admin bundle should not grow by a charting dependency to draw it.
 */
function DailyBars({ data }: { data: ApiUsageDto["byDay"] }) {
  const max = Math.max(1, ...data.map((d) => d.total));

  return (
    <div className="mt-4 flex h-28 items-end gap-1">
      {data.map((d) => {
        const errors = d.clientError + d.serverError;
        const errorShare = d.total > 0 ? errors / d.total : 0;
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={d.day}>
            <div
              className="flex w-full flex-col justify-end rounded-t bg-slate-200"
              style={{ height: `${(d.total / max) * 100}%`, minHeight: d.total > 0 ? 2 : 0 }}
            >
              {/* Failures stacked at the top of the same bar, so a bad day is visible in the
                  shape rather than only in a number below it. */}
              <div
                className="w-full rounded-t bg-rose-400"
                style={{ height: `${errorShare * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400">{d.day.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}
