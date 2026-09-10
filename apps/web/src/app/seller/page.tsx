"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SellerMeDto, SellerStatsDto, SellerTimeseriesPoint } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { WithdrawalPanel } from "@/components/withdrawal-panel";

export default function SellerDashboardPage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<SellerMeDto | null>(null);
  const [stats, setStats] = useState<SellerStatsDto | null>(null);
  const [series, setSeries] = useState<SellerTimeseriesPoint[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  function loadProfile() {
    api.getMySellerProfile().then(setProfile).catch(() => {});
  }

  useEffect(() => {
    loadProfile();
    api.getMySellerStats().then(setStats).catch(() => {});
    api.getMySellerTimeseries(14).then(setSeries).catch(() => {});
    api.getMySellerUnreadCount().then((r) => setUnreadCount(r.count)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {unreadCount > 0 && (
        <Link
          href="/seller/chat"
          className="flex items-center justify-between rounded-xl2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        >
          <span>
            💬{" "}
            {t("sellerCabinet.overview.newMessages", {
              count: unreadCount,
              word: t(
                unreadCount === 1
                  ? "sellerCabinet.overview.newMessageWordOne"
                  : "sellerCabinet.overview.newMessageWordOther",
              ),
            })}
          </span>
          <span>{t("sellerCabinet.overview.openChats")}</span>
        </Link>
      )}

      {profile && (
        <Card className="flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-brand text-lg font-bold text-white">
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              profile.shopName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div>
            <p className="text-lg font-semibold">{profile.shopName}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">gulyaly.com/@{profile.handle}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-400">{t("sellerCabinet.overview.balance")}</p>
          <p className="mt-1 text-2xl font-bold">{profile?.balanceTmt ?? 0} TMT</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-400">{t("sellerCabinet.overview.productsCount")}</p>
          <p className="mt-1 text-2xl font-bold">{stats?.productCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-400">{t("sellerCabinet.overview.revenueDelivered")}</p>
          <p className="mt-1 text-2xl font-bold">{stats?.totalRevenueTmt ?? 0} TMT</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-slate-400">{t("sellerCabinet.overview.totalOrders")}</p>
          <p className="mt-1 text-2xl font-bold">
            {stats ? Object.values(stats.ordersByStatus).reduce((a, b) => a + b, 0) : 0}
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold uppercase text-slate-500">{t("sellerCabinet.overview.salesLast14Days")}</p>
          <Link href="/seller/analytics" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
            {t("sellerCabinet.overview.allAnalytics")}
          </Link>
        </div>
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="dashboardVolumeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6d4bff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <Tooltip />
              <Area type="monotone" dataKey="volumeTmt" name="TMT" stroke="#5a2fee" fill="url(#dashboardVolumeFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">{t("sellerCabinet.overview.noSalesData")}</p>
        )}
      </Card>

      {stats && (
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold uppercase text-slate-500">{t("sellerCabinet.overview.ordersByStatus")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(stats.ordersByStatus).map(([status, count]) => (
              <div key={status} className="rounded-lg bg-slate-50 p-3 text-center dark:bg-white/5">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t(`orderStatus.${status}`)}</p>
                <p className="mt-1 text-lg font-bold">{count}</p>
              </div>
            ))}
            {Object.keys(stats.ordersByStatus).length === 0 && (
              <p className="col-span-full text-center text-xs text-slate-400">{t("sellerCabinet.overview.noOrdersYet")}</p>
            )}
          </div>
        </Card>
      )}

      <WithdrawalPanel balanceTmt={profile?.balanceTmt ?? 0} defaultPayoutDetails={profile?.defaultPayoutDetails ?? null} onWithdrawn={loadProfile} />
    </div>
  );
}
