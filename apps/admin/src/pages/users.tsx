import { useEffect, useState } from "react";
import type { CustomerDetailDto, CustomerDto, CustomerStatsDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";

export default function UsersPage() {
  const { t, locale } = useTranslation();
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [stats, setStats] = useState<CustomerStatsDto | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetailDto | null>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  function load(query?: string) {
    setLoading(true);
    api
      .listCustomers(query)
      .then(setCustomers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    api.getCustomerStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => load(search || undefined), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    setCodeError(null);
    if (!selectedId) {
      setDetail(null);
      setCodeDraft("");
      return;
    }
    api
      .getCustomerDetail(selectedId)
      .then((d) => {
        setDetail(d);
        // Seeded from the account being viewed, so the field always starts as the current code
        // rather than as whatever the previously selected customer's was.
        setCodeDraft(d.user.username);
      })
      .catch(() => {});
  }, [selectedId]);

  async function toggleBlocked(user: CustomerDto) {
    const updated = await api.updateStaffUser(user.id, { isBlocked: !user.isBlocked });
    setCustomers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...updated } : u)));
    if (detail?.user.id === user.id) {
      setDetail((prev) => (prev ? { ...prev, user: { ...prev.user, ...updated } } : prev));
    }
  }

  async function removeUser(user: CustomerDto) {
    if (!confirm(t("admin.users.deleteConfirm", { phone: user.phone }))) return;
    try {
      await api.deleteStaffUser(user.id);
      setCustomers((prev) => prev.filter((u) => u.id !== user.id));
      if (selectedId === user.id) setSelectedId(null);
    } catch (err) {
      alert(err instanceof ApiError ? translateError(t, err.message) : t("admin.users.deleteError"));
    }
  }

  async function saveCode(userId: string) {
    setCodeBusy(true);
    setCodeError(null);
    try {
      const { username } = await api.adminChangeUsername(userId, { username: codeDraft.trim() });
      setDetail((current) =>
        current ? { ...current, user: { ...current.user, username } } : current,
      );
      // The list shows the same accounts, so it would otherwise keep printing the old code.
      setCustomers((rows) => rows.map((r) => (r.id === userId ? { ...r, username } : r)));
      setCodeDraft(username);
    } catch (err) {
      setCodeError(err instanceof ApiError ? translateError(t, err.message) : String(err));
    } finally {
      setCodeBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.users.title")}</h1>

      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard label={t("admin.users.statTotal")} value={stats.total} />
          <StatCard label={t("admin.users.statNew7")} value={stats.newLast7Days} />
          <StatCard label={t("admin.users.statNew30")} value={stats.newLast30Days} />
          <StatCard label={t("admin.users.statBlocked")} value={stats.blocked} />
        </div>
      )}

      <div className="grid grid-cols-[1fr_360px] gap-6">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.users.searchPlaceholder")}
            />
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("admin.users.colPhone")}</th>
                <th className="px-4 py-3">{t("admin.users.colName")}</th>
                <th className="px-4 py-3">{t("admin.users.colOrders")}</th>
                <th className="px-4 py-3">{t("admin.users.colStatus")}</th>
                <th className="px-4 py-3">{t("admin.users.colRegistered")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => setSelectedId(user.id)}
                  className={`cursor-pointer ${selectedId === user.id ? "bg-gradient-brand-soft" : "hover:bg-slate-50"}`}
                >
                  <td className="px-4 py-3 font-medium">{user.phone}</td>
                  <td className="px-4 py-3">{user.fullName ?? "—"}</td>
                  <td className="px-4 py-3">{user._count.orders}</td>
                  <td className="px-4 py-3">
                    {user.isBlocked ? (
                      <span className="text-xs font-medium text-rose-600">{t("admin.users.statusBlocked")}</span>
                    ) : (
                      <span className="text-xs font-medium text-emerald-600">{t("admin.users.statusActive")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString(LOCALE_BCP47[locale])}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => toggleBlocked(user)}>
                        {user.isBlocked ? t("admin.users.unblockShort") : t("admin.users.blockShort")}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => removeUser(user)}>
                        {t("common.delete")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    {t("admin.users.notFound")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          {!detail && <p className="text-center text-sm text-slate-400">{t("admin.users.selectPrompt")}</p>}
          {detail && (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold">{detail.user.fullName || detail.user.phone}</p>
                <p className="text-sm text-slate-500">{detail.user.phone}</p>
              </div>

              {/* The only place a code can be changed. Customers cannot touch their own: it is
                  what invitations already in circulation point at, and it is a number issued in
                  sequence. The one case worth the breakage is a partner who advertises. */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
                  {t("admin.users.referralCode")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={codeDraft}
                    onChange={(e) => setCodeDraft(e.target.value)}
                    className="max-w-[180px] font-mono"
                    maxLength={32}
                  />
                  <Button
                    size="sm"
                    disabled={codeBusy || !codeDraft.trim() || codeDraft.trim() === detail.user.username}
                    onClick={() => saveCode(detail.user.id)}
                  >
                    {codeBusy ? t("common.saving") : t("admin.users.referralCodeChange")}
                  </Button>
                </div>
                {codeError && <p className="mt-1 text-xs text-rose-600">{codeError}</p>}
                <p className="mt-1 text-xs text-slate-400">{t("admin.users.referralCodeHint")}</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-400">{t("admin.users.orderHistory")}</p>
                <div className="max-h-[420px] space-y-2 overflow-y-auto">
                  {detail.orders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{order.service.name}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {order.amountTmt} TMT · {order.amountCharged} {order.currency} ·{" "}
                        {new Date(order.createdAt).toLocaleDateString(LOCALE_BCP47[locale])}
                      </p>
                    </div>
                  ))}
                  {detail.orders.length === 0 && (
                    <p className="text-center text-xs text-slate-400">{t("admin.users.noOrders")}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
