import { useEffect, useState } from "react";
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
import { StatCard } from "@/components/stat-card";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.nav.dashboard")}</h1>
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
          <StatCard label={t("admin.dashboard.totalOrders")} value={stats.totals.orders} />
          <StatCard label={t("admin.dashboard.ordersInPeriod", { days })} value={totalOrdersInPeriod} />
          <StatCard label={t("admin.dashboard.volumeInPeriod", { days })} value={totalVolume.toFixed(0)} />
          <StatCard label={t("admin.dashboard.customers")} value={stats.totals.customers} />
        </div>
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
