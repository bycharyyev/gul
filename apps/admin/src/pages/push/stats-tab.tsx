import { useEffect, useMemo, useState } from "react";
import type { CountryOptionDto, PushOverviewDto, PushStatsDto } from "@topup-hub/types";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/stat-card";
import { CATEGORY_LABELS, countryName, errorText } from "./shared";

function StatsTable({
  title,
  rows,
  label,
}: {
  title: string;
  rows: (PushStatsDto & { key: string })[];
  label: (key: string) => string;
}) {
  return (
    <Card className="overflow-x-auto p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Пока нет данных.</p>
      ) : (
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-400">
              <th className="pb-2 pr-3 font-medium" />
              <th className="pb-2 pr-3 text-right font-medium">Отправлено</th>
              <th className="pb-2 pr-3 text-right font-medium">Доставлено</th>
              <th className="pb-2 pr-3 text-right font-medium">Открыто</th>
              <th className="pb-2 pr-3 text-right font-medium">Игнор</th>
              <th className="pb-2 text-right font-medium">Открываемость</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100">
                <td className="py-2 pr-3 font-medium">{label(row.key)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.sent}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.delivered}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.opened}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{row.ignored}</td>
                <td className="py-2 text-right tabular-nums font-semibold">{row.openRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function StatsTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<PushOverviewDto | null>(null);
  const [countries, setCountries] = useState<CountryOptionDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listPushCountries().then(setCountries).catch(() => {});
  }, []);

  useEffect(() => {
    setError(null);
    api
      .getPushStats(days)
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, [days]);

  const names = useMemo(() => new Map(countries.map((c) => [c.code, c.name.ru])), [countries]);
  const maxDay = Math.max(1, ...(data?.byDay.map((d) => d.sent) ?? [1]));

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Загрузка…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Здесь все уведомления, которые отправило приложение: рассылки из админки и автоматические (заказы, чаты,
          карго, лента). «Игнор» — доставлено, но не открыто: Android не сообщает, смахнул ли человек уведомление.
        </p>
        <Select className="w-44" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Последние 7 дней</option>
          <option value={30}>Последние 30 дней</option>
          <option value={90}>Последние 90 дней</option>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Отправлено" value={data.totals.sent} />
        <StatCard label="Доставлено" value={data.totals.delivered} />
        <StatCard label="Открыто" value={data.totals.opened} />
        <StatCard label="Игнор" value={data.totals.ignored} />
        <StatCard label="Открываемость" value={`${data.totals.openRate}%`} />
        <StatCard label="Ошибки доставки" value={data.totals.failed} />
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">Аудитория с приложением</h3>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span>
            Людей: <b className="tabular-nums">{data.audience.usersWithApp}</b>
          </span>
          <span>
            Устройств: <b className="tabular-nums">{data.audience.devices}</b>
          </span>
          {Object.entries(data.audience.byPlatform).map(([platform, count]) => (
            <span key={platform}>
              {platform === "IOS" ? "iPhone" : "Android"}: <b className="tabular-nums">{count}</b>
            </span>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">По дням</h3>
        {data.byDay.length === 0 ? (
          <p className="text-sm text-slate-400">Пока нет данных.</p>
        ) : (
          <div className="flex h-40 items-end gap-1 overflow-x-auto">
            {data.byDay.map((d) => (
              <div key={d.day} className="group flex min-w-[14px] flex-1 flex-col items-center justify-end gap-1">
                <div
                  title={`${d.day}: отправлено ${d.sent}, открыто ${d.opened}`}
                  className="w-full rounded-t bg-brand-200"
                  style={{ height: `${Math.max((d.sent / maxDay) * 120, 3)}px` }}
                >
                  <div
                    className="w-full rounded-t bg-brand-600"
                    style={{ height: d.sent ? `${(d.opened / d.sent) * 100}%` : 0 }}
                  />
                </div>
                <span className="text-[9px] text-slate-400">{d.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">Светлый столбик — отправлено, тёмная часть — открыто.</p>
      </Card>

      <div className="grid gap-4">
        <StatsTable
          title="По разделам"
          rows={data.byCategory.map((r) => ({ ...r, key: r.category }))}
          label={(key) => CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] ?? key}
        />
        <StatsTable
          title="По странам"
          rows={data.byCountry.map((r) => ({ ...r, key: r.country }))}
          label={(key) => countryName(key, names)}
        />
      </div>
    </div>
  );
}
