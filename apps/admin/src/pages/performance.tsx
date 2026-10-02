import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PerfPeriod, PerformanceOverviewDto } from "@topup-hub/types";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";

const PERIODS: { id: PerfPeriod; label: string }[] = [
  { id: "5m", label: "5 мин" },
  { id: "1h", label: "1 час" },
  { id: "24h", label: "24 часа" },
  { id: "7d", label: "7 дней" },
];
const REFRESH_MS = 15_000;

function pct(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : `${Math.round(n * 1000) / 10}%`;
}
function ms(n: number | undefined) {
  return n === undefined ? "—" : `${Math.round(n)} мс`;
}
function fmtTime(iso: string, period: PerfPeriod) {
  const d = new Date(iso);
  return period === "7d"
    ? d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit" })
    : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Aggregated health of the running service: traffic, latency, errors, cache, servers, database and
 * queues. Nothing personal is shown -- the API sends counts and estimates only.
 */
export default function PerformancePage() {
  const [period, setPeriod] = useState<PerfPeriod>("1h");
  const [data, setData] = useState<PerformanceOverviewDto | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      api
        .getPerformance(period)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(false);
        })
        .catch(() => alive && setError(true));
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [period]);

  const req = data?.requests?.totals;
  const errorRate = req && req.requests ? (req.status5xx / req.requests) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Производительность</h1>
          <p className="mt-1 text-sm text-slate-500">
            Оба сервера вместе. Обновляется каждые 15 секунд. Только агрегированные данные — без
            личных данных, IP-адресов и токенов. p95/p99 — оценка по гистограмме.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                period === p.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-700">
          Не удалось загрузить данные. Повторим через 15 секунд.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Онлайн (5 мин)" value={data?.users?.online5m ?? "—"} />
        <StatCard label="Активные за час" value={data?.users?.active1h ?? "—"} />
        <StatCard label="Активные за 24 ч" value={data?.users?.active24h ?? "—"} />
        <StatCard label="Кеш: попадания" value={pct(data?.cache.ratio)} />
        <StatCard label="Запросов в секунду" value={req ? req.rps : "—"} />
        <StatCard label="Среднее время" value={ms(req?.avgMs)} />
        <StatCard label="p95 / p99" value={req ? `${Math.round(req.p95Ms)} / ${Math.round(req.p99Ms)} мс` : "—"} />
        <StatCard label="Доля 5xx" value={pct(errorRate)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Нагрузка и задержка</h2>
          {data?.requests?.series.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.requests.series.map((b) => ({ ...b, label: fmtTime(b.t, period) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis yAxisId="rps" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="ms" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line yAxisId="rps" type="monotone" dataKey="rps" name="запросов/с" stroke="#6d4bff" dot={false} />
                <Line yAxisId="ms" type="monotone" dataKey="p95Ms" name="p95, мс" stroke="#14b8a6" dot={false} />
                <Line yAxisId="rps" type="monotone" dataKey="errors5xx" name="5xx" stroke="#e11d48" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">Нет данных за период</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Ответы</h2>
          {req ? (
            <dl className="space-y-1.5 text-sm">
              {[
                ["Всего", req.requests],
                ["2xx", req.status2xx],
                ["3xx", req.status3xx],
                ["4xx", req.status4xx],
                ["из них 429 (лимит)", req.status429],
                ["5xx", req.status5xx],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-400">—</p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Серверы и процессы</h2>
        {data?.nodes.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1">Узел</th>
                <th>Роль</th>
                <th>CPU</th>
                <th>RAM сервера</th>
                <th>Память процесса</th>
                <th>Load</th>
                <th>Аптайм</th>
              </tr>
            </thead>
            <tbody>
              {data.nodes.map((n) => (
                <tr key={n.label} className="border-t border-slate-100">
                  <td className="py-1.5 font-medium">{n.label}</td>
                  <td>{n.role}</td>
                  <td>{n.cpuPercent}%</td>
                  <td>
                    {(n.memUsedMb / 1024).toFixed(1)} / {(n.memTotalMb / 1024).toFixed(1)} ГБ
                  </td>
                  <td>{n.processRssMb} МБ</td>
                  <td>{n.load1}</td>
                  <td>{Math.round(n.uptimeS / 3600)} ч</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">Ни один узел не отчитался за последнюю минуту</p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">PostgreSQL</h2>
          {data?.database ? (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Подключения</dt>
                <dd className="font-semibold">
                  {data.database.connections} / {data.database.maxConnections}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Активные запросы</dt>
                <dd className="font-semibold">{data.database.activeConnections}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Реплики (secondary)</dt>
                <dd className="font-semibold">
                  {data.database.replicas.length
                    ? data.database.replicas
                        .map((r) => `${r.state}${r.lagSeconds !== null ? `, отставание ${r.lagSeconds.toFixed(1)} с` : ""}`)
                        .join("; ")
                    : "нет"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-400">Нет данных</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Очереди BullMQ</h2>
          <dl className="space-y-1.5 text-sm">
            {(data?.queues ?? []).map((q) => (
              <div key={q.name} className="flex justify-between">
                <dt className="text-slate-500">{q.name}</dt>
                <dd className="font-semibold tabular-nums">
                  {q.waiting ?? "—"} ждут · {q.active ?? "—"} в работе · {q.failed ?? "—"} ошибок
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Зависшие заказы</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Оплачены, не отправлены &gt; 10 мин</dt>
              <dd className="font-semibold">{data?.stuckOrders.paidOver10m ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">В обработке &gt; 30 мин</dt>
              <dd className="font-semibold">{data?.stuckOrders.processingOver30m ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-400">
            Кеш за {data?.cache.days ?? 1} дн.:{" "}
            {Object.entries(data?.cache.groups ?? {})
              .map(([g, v]) => `${g} ${pct(v.ratio)}`)
              .join(" · ") || "нет обращений"}
          </p>
        </Card>
      </div>
    </div>
  );
}
