import { useEffect, useMemo, useState } from "react";
import type { SellerApplicationAdminDto, SellerApplicationStatus } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";

function useStatusLabels(): Record<SellerApplicationStatus, { text: string; className: string }> {
  const { t } = useTranslation();
  return {
    PENDING: { text: t("admin.sellerApplications.status.PENDING"), className: "text-amber-600" },
    APPROVED: { text: t("admin.sellerApplications.status.APPROVED"), className: "text-emerald-600" },
    REJECTED: { text: t("admin.sellerApplications.status.REJECTED"), className: "text-rose-600" },
  };
}

function useFilters(): { value: SellerApplicationStatus | "ALL"; label: string }[] {
  const { t } = useTranslation();
  return [
    { value: "ALL", label: t("admin.sellerApplications.filterAll") },
    { value: "PENDING", label: t("admin.sellerApplications.filterPending") },
    { value: "APPROVED", label: t("admin.sellerApplications.filterApproved") },
    { value: "REJECTED", label: t("admin.sellerApplications.filterRejected") },
  ];
}

export default function SellerApplicationsPage() {
  const { t, locale } = useTranslation();
  const STATUS_LABEL = useStatusLabels();
  const FILTERS = useFilters();
  const [applications, setApplications] = useState<SellerApplicationAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SellerApplicationStatus | "ALL">("PENDING");

  function load() {
    setLoading(true);
    api
      .listSellerApplications()
      .then(setApplications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.approveSellerApplication(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.sellerApplications.approveError"));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const note = window.prompt(t("admin.sellerApplications.rejectPrompt")) ?? undefined;
    setBusyId(id);
    setError(null);
    try {
      await api.rejectSellerApplication(id, { note });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.sellerApplications.rejectError"));
    } finally {
      setBusyId(null);
    }
  }

  const stats = useMemo(() => {
    const pending = applications.filter((a) => a.status === "PENDING");
    const approved = applications.filter((a) => a.status === "APPROVED");
    const rejected = applications.filter((a) => a.status === "REJECTED");
    return {
      totalCount: applications.length,
      pendingCount: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
    };
  }, [applications]);

  const visible = filter === "ALL" ? applications : applications.filter((a) => a.status === filter);

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.sellerApplications.title")}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("admin.sellerApplications.statTotal")} value={stats.totalCount} />
        <StatCard label={t("admin.sellerApplications.statPending")} value={stats.pendingCount} />
        <StatCard label={t("admin.sellerApplications.statApproved")} value={stats.approvedCount} />
        <StatCard label={t("admin.sellerApplications.statRejected")} value={stats.rejectedCount} />
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
              <th className="px-4 py-3">{t("admin.sellerApplications.colShop")}</th>
              <th className="px-4 py-3">{t("admin.sellerApplications.colUsername")}</th>
              <th className="px-4 py-3">{t("admin.sellerApplications.colPhone")}</th>
              <th className="px-4 py-3">{t("admin.sellerApplications.colContact")}</th>
              <th className="px-4 py-3">{t("admin.sellerApplications.colSubmitted")}</th>
              <th className="px-4 py-3">{t("admin.sellerApplications.colStatus")}</th>
              <th className="px-4 py-3">{t("admin.sellerApplications.colProcessed")}</th>
              <th className="px-4 py-3">{t("admin.sellerApplications.colComment")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium">{a.shopName}</td>
                <td className="px-4 py-3 text-brand-600">@{a.handle}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{a.phone}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{a.fullName ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(a.createdAt).toLocaleString(LOCALE_BCP47[locale])}
                </td>
                <td className={`px-4 py-3 text-xs font-medium ${STATUS_LABEL[a.status].className}`}>
                  {STATUS_LABEL[a.status].text}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {a.reviewedAt ? new Date(a.reviewedAt).toLocaleString(LOCALE_BCP47[locale]) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{a.reviewNote ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  {a.status === "PENDING" && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => approve(a.id)} disabled={busyId === a.id}>
                        {t("admin.sellerApplications.approve")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        onClick={() => reject(a.id)}
                        disabled={busyId === a.id}
                      >
                        {t("admin.sellerApplications.reject")}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.sellerApplications.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
