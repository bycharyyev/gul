"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SellerTimeseriesPoint, SellerTopProductDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";

const PERIODS = [7, 30, 90];

export default function SellerAnalyticsPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<SellerTimeseriesPoint[]>([]);
  const [topProducts, setTopProducts] = useState<SellerTopProductDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getMySellerTimeseries(days), api.getMySellerTopProducts(5)])
      .then(([ts, top]) => {
        setSeries(ts);
        setTopProducts(top);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  const totalOrders = series.reduce((sum, p) => sum + p.orderCount, 0);
  const totalVolume = series.reduce((sum, p) => sum + p.volumeTmt, 0);
  const totalDelivered = series.reduce((sum, p) => sum + p.deliveredCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("sellerCabinet.analytics.pageTitle")}</h2>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/10">
          {PERIODS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium ${
                days === d
                  ? "bg-white text-brand-700 shadow-sm dark:bg-white/20 dark:text-white"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {t("sellerCabinet.analytics.periodDaysLabel", { days: d })}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-400">{t("sellerCabinet.analytics.ordersForPeriod")}</p>
          <p className="mt-1 text-2xl font-bold">{totalOrders}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-400">{t("sellerCabinet.analytics.delivered")}</p>
          <p className="mt-1 text-2xl font-bold">{totalDelivered}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-400">{t("sellerCabinet.analytics.turnoverTmt")}</p>
          <p className="mt-1 text-2xl font-bold">{totalVolume.toFixed(0)}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-500">{t("sellerCabinet.analytics.ordersPerDay")}</h3>
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="orderCount" name={t("sellerCabinet.analytics.ordersLegend")} fill="#6d4bff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="deliveredCount" name={t("sellerCabinet.analytics.delivered")} fill="#14b8a6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-16 text-center text-sm text-slate-400">
            {loading ? t("common.loading") : t("sellerCabinet.analytics.noDataForPeriod")}
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-500">{t("sellerCabinet.analytics.turnoverPerDay")}</h3>
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="sellerVolumeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6d4bff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="volumeTmt" name="TMT" stroke="#5a2fee" fill="url(#sellerVolumeFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-16 text-center text-sm text-slate-400">
            {loading ? t("common.loading") : t("sellerCabinet.analytics.noDataForPeriod")}
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-500">{t("sellerCabinet.analytics.topProducts")}</h3>
        {topProducts.length > 0 ? (
          <div className="space-y-2">
            {topProducts.map((p, i) => (
              <div
                key={p.productId}
                className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5"
              >
                <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={p.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-slate-400">
                    {t("sellerCabinet.analytics.skuOrdersCount", { sku: p.sku, count: p.orderCount })}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold">{p.revenueTmt} TMT</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">{t("sellerCabinet.analytics.noDeliveredOrders")}</p>
        )}
      </Card>
    </div>
  );
}
