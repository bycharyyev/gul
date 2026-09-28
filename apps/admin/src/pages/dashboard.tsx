import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { AdminPeriodComparisonDto, AdminPeriodTotals, AdminStatsDto, OrdersTimeseriesPoint } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { percentChange } from "@/lib/table";
import { Card } from "@/components/ui/card";

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "#f59e0b",
  PAID: "#0ea5e9",
  PROCESSING: "#6d4bff",
  COMPLETED: "#10b981",
  FAILED: "#f43f5e",
  REFUNDED: "#94a3b8",
  CANCELLED: "#cbd5e1",
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStatsDto | null>(null);
  const [series, setSeries] = useState<OrdersTimeseriesPoint[]>([]);
  const [comparison, setComparison] = useState<AdminPeriodComparisonDto | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  function load(period: number) {
    setLoading(true);
    Promise.all([api.getAdminStats(), api.getOrdersTimeseries(period), api.getAdminPeriodComparison(period)])
      .then(([s, ts, cmp]) => {
        setStats(s);
        setSeries(ts);
        setComparison(cmp);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => load(days), [days]);

  const statusData = stats
    ? Object.entries(stats.ordersByStatus).map(([status, count]) => ({
        status,
        label: t(`orderStatus.${status}`),
        count,
      }))
    : [];

  const completedOrders = stats?.ordersByStatus.COMPLETED ?? 0;
  const pendingOrders = (stats?.ordersByStatus.PENDING_PAYMENT ?? 0) + (stats?.ordersByStatus.PAID ?? 0) + (stats?.ordersByStatus.PROCESSING ?? 0);
  const completionRate = stats?.totals.orders ? Math.round((completedOrders / stats.totals.orders) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.nav.dashboard")}</h1>
          <p className="mt-1 text-sm text-slate-500">Контроль заказов, объёма и состояния сервиса в одном месте</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                days === d ? "bg-white shadow-sm text-brand-700" : "text-slate-500"
              }`}
            >
              {t("admin.dashboard.daysButton", { days: d })}
            </button>
          ))}
        </div>
      </div>

      {stats && comparison && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label={t("admin.trend.ordersInPeriod", { days })}
            value={comparison.current.orders}
            trend={percentChange(comparison.current.orders, comparison.previous.orders)}
            trendHint={t("admin.trend.vsPrevious", { days })}
            hint={t("admin.trend.totalHint", { total: stats.totals.orders })}
            onClick={() => navigate("/orders")}
          />
          <MetricCard
            label={t("admin.trend.volumeInPeriod", { days })}
            value={`${comparison.current.volumeTmt.toFixed(0)} TMT`}
            trend={percentChange(comparison.current.volumeTmt, comparison.previous.volumeTmt)}
            trendHint={t("admin.trend.vsPrevious", { days })}
            hint={`${pendingOrders} требуют внимания`}
          />
          <MetricCard
            label={t("admin.trend.averageOrder")}
            value={`${average(comparison.current).toFixed(0)} TMT`}
            trend={percentChange(average(comparison.current), average(comparison.previous))}
            trendHint={t("admin.trend.vsPrevious", { days })}
            hint={`${completionRate}% заказов завершено`}
          />
          <MetricCard
            label={t("admin.trend.newCustomers", { days })}
            value={comparison.current.newCustomers}
            trend={percentChange(comparison.current.newCustomers, comparison.previous.newCustomers)}
            trendHint={t("admin.trend.vsPrevious", { days })}
            hint={t("admin.trend.totalHint", { total: stats.totals.customers })}
            onClick={() => navigate("/users")}
          />
        </div>
      )}

      {stats && (
        <Card className="border-brand-100 bg-gradient-to-r from-brand-50 via-white to-teal-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Операционный обзор</p>
              <h2 className="mt-1 text-lg font-bold">Что требует внимания сейчас</h2>
            </div>
            <button onClick={() => navigate("/orders")} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700">Открыть заказы</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Insight label="В обработке" value={pendingOrders} tone={pendingOrders ? "amber" : "green"} />
            <Insight label="Завершено всего" value={completedOrders} tone="green" />
            <Insight label="Конверсия завершения" value={`${completionRate}%`} tone={completionRate >= 80 ? "green" : "amber"} />
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.dashboard.byStatus")}</h2>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">{t("admin.dashboard.noData")}</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.dashboard.perDay")}</h2>
          {series.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="orderCount" name={t("admin.dashboard.ordersLegend")} fill="#6d4bff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completedCount" name={t("admin.dashboard.completedLegend")} fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">
              {loading ? t("common.loading") : t("admin.dashboard.noData")}
            </p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.dashboard.volumePerDay")}</h2>
          {series.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6d4bff" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="volumeTmt" name="TMT" stroke="#5a2fee" fill="url(#volumeFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">
              {loading ? t("common.loading") : t("admin.dashboard.noData")}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function average(p: AdminPeriodTotals) {
  return p.orders ? p.volumeTmt / p.orders : 0;
}

function TrendBadge({ value, hint }: { value: number | null; hint: string }) {
  const { t } = useTranslation();
  if (value === null) {
    return (
      <span title={t("admin.trend.noBaseline")} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        —
      </span>
    );
  }
  const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  const tone =
    rounded > 0 ? "bg-emerald-50 text-emerald-700" : rounded < 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500";
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : Minus;
  // Colour is never the only signal: the sign and the arrow say the same thing.
  return (
    <span title={hint} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {rounded > 0 ? "+" : rounded < 0 ? "−" : ""}
      {Math.abs(rounded).toLocaleString("ru-RU")}%
      <span className="sr-only"> {hint}</span>
    </span>
  );
}

function MetricCard({
  label,
  value,
  hint,
  trend,
  trendHint,
  onClick,
}: {
  label: string;
  value: string | number;
  hint: string;
  trend?: number | null;
  trendHint?: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-left disabled:cursor-default">
      <Card className={`h-full p-4 transition ${onClick ? "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md" : ""}`}>
        <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {trend !== undefined && <TrendBadge value={trend} hint={trendHint ?? ""} />}
        </div>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </Card>
    </button>
  );
}

function Insight({ label, value, tone }: { label: string; value: string | number; tone: "amber" | "green" }) {
  return <div className={`rounded-xl border p-3 ${tone === "amber" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
}
