import { useEffect, useMemo, useState } from "react";
import type { WithdrawalRequestAdminDto, WithdrawalStatus } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";

function useStatusLabels(): Record<WithdrawalStatus, { text: string; className: string }> {
  const { t } = useTranslation();
  return {
    PENDING: { text: t("withdrawalStatus.PENDING"), className: "text-amber-600" },
    PAID: { text: t("withdrawalStatus.PAID"), className: "text-emerald-600" },
    REJECTED: { text: t("withdrawalStatus.REJECTED"), className: "text-rose-600" },
  };
}

function useFilters(): { value: WithdrawalStatus | "ALL"; label: string }[] {
  const { t } = useTranslation();
  return [
    { value: "ALL", label: t("admin.withdrawals.filterAll") },
    { value: "PENDING", label: t("admin.withdrawals.filterPending") },
    { value: "PAID", label: t("admin.withdrawals.filterPaid") },
    { value: "REJECTED", label: t("admin.withdrawals.filterRejected") },
  ];
}

export default function WithdrawalsPage() {
  const { t, locale } = useTranslation();
  const STATUS_LABEL = useStatusLabels();
  const FILTERS = useFilters();
  const [requests, setRequests] = useState<WithdrawalRequestAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<WithdrawalStatus | "ALL">("PENDING");

  function load() {
    setLoading(true);
    api
      .listAllWithdrawals()
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.approveWithdrawal(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.withdrawals.approveError"));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const note = window.prompt(t("admin.withdrawals.rejectPrompt")) ?? undefined;
    setBusyId(id);
    setError(null);
    try {
      await api.rejectWithdrawal(id, { note });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.withdrawals.rejectError"));
    } finally {
      setBusyId(null);
    }
  }

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === "PENDING");
    const paid = requests.filter((r) => r.status === "PAID");
    const rejected = requests.filter((r) => r.status === "REJECTED");
    const sum = (rows: WithdrawalRequestAdminDto[]) => rows.reduce((acc, r) => acc + Number(r.amountTmt), 0);
    const sellerCount = new Set(requests.map((r) => r.seller.id)).size;
    return {
      totalCount: requests.length,
      pendingCount: pending.length,
      pendingSum: sum(pending),
      paidSum: sum(paid),
      rejectedCount: rejected.length,
      sellerCount,
    };
  }, [requests]);

  const visible = filter === "ALL" ? requests : requests.filter((r) => r.status === filter);

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.withdrawals.title")}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label={t("admin.withdrawals.statTotal")} value={stats.totalCount} />
        <StatCard label={t("admin.withdrawals.statPending")} value={stats.pendingCount} />
        <StatCard label={t("admin.withdrawals.statPendingSum")} value={`${stats.pendingSum} TMT`} />
        <StatCard label={t("admin.withdrawals.statPaidSum")} value={`${stats.paidSum} TMT`} />
        <StatCard label={t("admin.withdrawals.statSellerCount")} value={stats.sellerCount} />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium ${
              filter === f.value ? "bg-gradient-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
            {f.value === "PENDING" && stats.pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-white/30 px-1.5 text-xs">{stats.pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.withdrawals.colShop")}</th>
              <th className="px-4 py-3">{t("admin.withdrawals.colAmount")}</th>
              <th className="px-4 py-3">{t("admin.withdrawals.colPayoutDetails")}</th>
              <th className="px-4 py-3">{t("admin.withdrawals.colSubmitted")}</th>
              <th className="px-4 py-3">{t("admin.withdrawals.colStatus")}</th>
              <th className="px-4 py-3">{t("admin.withdrawals.colProcessed")}</th>
              <th className="px-4 py-3">{t("admin.withdrawals.colComment")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">
                  <span className="text-brand-600">@{r.seller.handle}</span>
                  <span className="ml-1 text-slate-400">{r.seller.shopName}</span>
                </td>
                <td className="px-4 py-3 font-semibold">{r.amountTmt} TMT</td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.payoutDetails}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(r.createdAt).toLocaleString(LOCALE_BCP47[locale])}
                </td>
                <td className={`px-4 py-3 text-xs font-medium ${STATUS_LABEL[r.status].className}`}>
                  {STATUS_LABEL[r.status].text}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {r.reviewedAt ? new Date(r.reviewedAt).toLocaleString(LOCALE_BCP47[locale]) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.reviewNote ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  {r.status === "PENDING" && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => approve(r.id)} disabled={busyId === r.id}>
                        {t("admin.withdrawals.markPaidAction")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        onClick={() => reject(r.id)}
                        disabled={busyId === r.id}
                      >
                        {t("admin.withdrawals.reject")}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.withdrawals.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
