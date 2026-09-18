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
import type { AdminStatsDto, OrdersTimeseriesPoint } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
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
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  function load(period: number) {
    setLoading(true);
    Promise.all([api.getAdminStats(), api.getOrdersTimeseries(period)])
      .then(([s, ts]) => {
        setStats(s);
        setSeries(ts);
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

  const totalVolume = series.reduce((sum, p) => sum + p.volumeTmt, 0);
  const totalOrdersInPeriod = series.reduce((sum, p) => sum + p.orderCount, 0);
  const completedOrders = stats?.ordersByStatus.COMPLETED ?? 0;
  const pendingOrders = (stats?.ordersByStatus.PENDING_PAYMENT ?? 0) + (stats?.ordersByStatus.PAID ?? 0) + (stats?.ordersByStatus.PROCESSING ?? 0);
  const completionRate = stats?.totals.orders ? Math.round((completedOrders / stats.totals.orders) * 100) : 0;
  const averageOrder = totalOrdersInPeriod ? totalVolume / totalOrdersInPeriod : 0;

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

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label={t("admin.dashboard.totalOrders")} value={stats.totals.orders} hint={`${completedOrders} завершено`} onClick={() => navigate("/orders")} />
          <MetricCard label={t("admin.dashboard.ordersInPeriod", { days })} value={totalOrdersInPeriod} hint={`${pendingOrders} требуют внимания`} onClick={() => navigate("/orders")} />
          <MetricCard label={t("admin.dashboard.volumeInPeriod", { days })} value={`${totalVolume.toFixed(0)} TMT`} hint={`Средний заказ ${averageOrder.toFixed(0)} TMT`} />
          <MetricCard label={t("admin.dashboard.customers")} value={stats.totals.customers} hint={`${completionRate}% заказов завершено`} onClick={() => navigate("/users")} />
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

function MetricCard({ label, value, hint, onClick }: { label: string; value: string | number; hint: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-left disabled:cursor-default">
      <Card className={`h-full p-4 transition ${onClick ? "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md" : ""}`}>
        <p className="text-xs font-medium uppercase text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </Card>
    </button>
  );
}

function Insight({ label, value, tone }: { label: string; value: string | number; tone: "amber" | "green" }) {
  return <div className={`rounded-xl border p-3 ${tone === "amber" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
}
