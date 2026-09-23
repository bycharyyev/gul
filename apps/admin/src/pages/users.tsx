import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  CircleUserRound,
  Edit3,
  MessageCircle,
  Search,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import type {
  CustomerDetailDto,
  CustomerDto,
  CustomerStatsDto,
} from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { alertAction, confirmAction } from "@/lib/confirm";

const API_ORIGIN = (
  import.meta.env.VITE_API_URL ?? "http://localhost:4000/api"
).replace(/\/api$/, "");

function initials(user: CustomerDto | CustomerDetailDto["user"]): string {
  const source = user.fullName?.trim() || user.phone;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function CustomerAvatar({
  user,
  className = "h-9 w-9 rounded-full",
}: {
  user: CustomerDto | CustomerDetailDto["user"];
  className?: string;
}) {
  if (user.avatarPath)
    return (
      <img
        src={`${API_ORIGIN}/api/avatar/${encodeURIComponent(user.avatarPath)}`}
        alt=""
        className={`shrink-0 object-cover ${className}`}
      />
    );
  return (
    <span
      className={`grid shrink-0 place-items-center bg-gradient-brand text-xs font-bold text-white ${className}`}
    >
      {initials(user)}
    </span>
  );
}

export default function UsersPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [stats, setStats] = useState<CustomerStatsDto | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetailDto | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const dateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

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
    api
      .getCustomerStats()
      .then(setStats)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => load(search || undefined), 300);
    return () => window.clearTimeout(id);
  }, [search]);
  useEffect(() => {
    setCodeError(null);
    if (!selectedId) {
      setDetail(null);
      setCodeDraft("");
      setNameDraft("");
      return;
    }
    api
      .getCustomerDetail(selectedId)
      .then((customer) => {
        setDetail(customer);
        setCodeDraft(customer.user.username);
        setNameDraft(customer.user.fullName ?? "");
      })
      .catch(() => {});
  }, [selectedId]);

  async function toggleBlocked(user: CustomerDto) {
    const updated = await api.updateStaffUser(user.id, {
      isBlocked: !user.isBlocked,
    });
    setCustomers((rows) =>
      rows.map((row) => (row.id === user.id ? { ...row, ...updated } : row)),
    );
    if (detail?.user.id === user.id)
      setDetail((current) =>
        current
          ? { ...current, user: { ...current.user, ...updated } }
          : current,
      );
  }
  async function removeUser(user: CustomerDto) {
    if (
      !(await confirmAction(
        t("admin.users.deleteConfirm", { phone: user.phone }),
      ))
    )
      return;
    try {
      await api.deleteStaffUser(user.id);
      setCustomers((rows) => rows.filter((row) => row.id !== user.id));
      if (selectedId === user.id) setSelectedId(null);
    } catch (err) {
      void alertAction(
        err instanceof ApiError
          ? translateError(t, err.message)
          : t("admin.users.deleteError"),
      );
    }
  }
  async function saveProfile() {
    if (
      !detail ||
      !nameDraft.trim() ||
      nameDraft.trim() === detail.user.fullName
    )
      return;
    setProfileBusy(true);
    try {
      const updated = await api.updateStaffUser(detail.user.id, {
        fullName: nameDraft.trim(),
      });
      setDetail((current) =>
        current
          ? { ...current, user: { ...current.user, ...updated } }
          : current,
      );
      setCustomers((rows) =>
        rows.map((row) =>
          row.id === updated.id ? { ...row, ...updated } : row,
        ),
      );
    } finally {
      setProfileBusy(false);
    }
  }
  async function saveCode(userId: string) {
    setCodeBusy(true);
    setCodeError(null);
    try {
      const { username } = await api.adminChangeUsername(userId, {
        username: codeDraft.trim(),
      });
      setDetail((current) =>
        current ? { ...current, user: { ...current.user, username } } : current,
      );
      setCustomers((rows) =>
        rows.map((row) => (row.id === userId ? { ...row, username } : row)),
      );
      setCodeDraft(username);
    } catch (err) {
      setCodeError(
        err instanceof ApiError ? translateError(t, err.message) : String(err),
      );
    } finally {
      setCodeBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
            CRM · клиенты
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            {t("admin.users.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Профиль, покупки и действия поддержки — в одном рабочем месте.
          </p>
        </div>
        <Link
          to="/support"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <MessageCircle className="h-4 w-4" /> Открыть поддержку{" "}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </header>
      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("admin.users.statTotal")} value={stats.total} />
          <StatCard
            label={t("admin.users.statNew7")}
            value={stats.newLast7Days}
          />
          <StatCard
            label={t("admin.users.statNew30")}
            value={stats.newLast30Days}
          />
          <StatCard
            label={t("admin.users.statBlocked")}
            value={stats.blocked}
          />
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder={t("admin.users.searchPlaceholder")}
              />
            </div>
            <span className="text-xs font-medium text-slate-400">
              {loading ? "Обновление…" : `${customers.length} в списке`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Клиент</th>
                  <th className="px-4 py-3">Заказы</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Регистрация</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedId(user.id)}
                    className={`cursor-pointer transition-colors ${selectedId === user.id ? "bg-brand-50" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CustomerAvatar user={user} />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {user.fullName || "Без имени"}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-slate-500">
                            {user.phone}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-700">
                      {user._count.orders}
                    </td>
                    <td className="px-4 py-3">
                      {user.isBlocked ? (
                        <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                          {t("admin.users.statusBlocked")}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          {t("admin.users.statusActive")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString(
                        LOCALE_BCP47[locale],
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toggleBlocked(user)}
                        >
                          {user.isBlocked
                            ? t("admin.users.unblockShort")
                            : t("admin.users.blockShort")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => removeUser(user)}
                        >
                          {t("common.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && customers.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-slate-400"
                    >
                      {t("admin.users.notFound")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="overflow-hidden xl:sticky xl:top-5">
          {!detail && (
            <div className="grid min-h-[420px] place-items-center p-8 text-center">
              <CircleUserRound className="mb-3 h-10 w-10 text-slate-200" />
              <p className="text-sm text-slate-400">
                {t("admin.users.selectPrompt")}
              </p>
            </div>
          )}
          {detail && (
            <div>
              <div className="border-b border-slate-100 bg-gradient-to-br from-brand-50 via-white to-white p-5">
                <div className="flex items-start gap-3">
                  <CustomerAvatar
                    user={detail.user}
                    className="h-12 w-12 rounded-2xl text-sm shadow-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">
                      карточка клиента
                    </p>
                    <h2 className="truncate text-xl font-bold text-slate-950">
                      {detail.user.fullName || "Без имени"}
                    </h2>
                    <p className="font-mono text-sm text-slate-500">
                      {detail.user.phone}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <a
                    href={`sms:${detail.user.phone}`}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Написать SMS
                  </a>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate("/support")}
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Поддержка
                  </Button>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-slate-500">
                  SMS откроет приложение сообщений на устройстве администратора.
                  Платформа не отправляет сообщения автоматически.
                </p>
              </div>
              <div className="space-y-5 p-5">
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      Профиль
                    </p>
                    <Edit3 className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <label className="text-xs font-medium text-slate-600">
                    Имя
                  </label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      maxLength={120}
                    />
                    <Button
                      size="sm"
                      disabled={
                        profileBusy ||
                        !nameDraft.trim() ||
                        nameDraft.trim() === detail.user.fullName
                      }
                      onClick={saveProfile}
                    >
                      {profileBusy ? t("common.saving") : "Сохранить"}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Телефон — идентификатор входа, его изменение требует
                    отдельной процедуры безопасности.
                  </p>
                </section>
                <section className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Smartphone className="h-3.5 w-3.5" /> Устройства
                    </div>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {detail.devices.count}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Android {detail.devices.android} · iOS{" "}
                      {detail.devices.ios}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Activity className="h-3.5 w-3.5" /> Последняя связь
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-800">
                      {detail.devices.lastAppSeenAt
                        ? dateTime.format(
                            new Date(detail.devices.lastAppSeenAt),
                          )
                        : "Нет данных"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Не является онлайн-статусом
                    </p>
                  </div>
                </section>
                <section>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                    {t("admin.users.referralCode")}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={codeDraft}
                      onChange={(event) => setCodeDraft(event.target.value)}
                      className="font-mono"
                      maxLength={32}
                    />
                    <Button
                      size="sm"
                      disabled={
                        codeBusy ||
                        !codeDraft.trim() ||
                        codeDraft.trim() === detail.user.username
                      }
                      onClick={() => saveCode(detail.user.id)}
                    >
                      {codeBusy
                        ? t("common.saving")
                        : t("admin.users.referralCodeChange")}
                    </Button>
                  </div>
                  {codeError && (
                    <p className="mt-1 text-xs text-rose-600">{codeError}</p>
                  )}
                  <p className="mt-1.5 text-xs text-slate-400">
                    {t("admin.users.referralCodeHint")}
                  </p>
                </section>
                {detail.user.isBlocked && (
                  <div className="flex gap-2 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-800">
                    <ShieldAlert className="h-4 w-4 shrink-0" /> Аккаунт
                    заблокирован: вход и новые действия пользователя недоступны.
                  </div>
                )}
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      {t("admin.users.orderHistory")}
                    </p>
                    <span className="text-xs font-semibold text-slate-400">
                      {detail.orders.length}
                    </span>
                  </div>
                  <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                    {detail.orders.map((order) => (
                      <div
                        key={order.id}
                        className="rounded-lg border border-slate-100 p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-800">
                            {order.service.name}
                          </span>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.amountTmt} TMT · {order.amountCharged}{" "}
                          {order.currency}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {dateTime.format(new Date(order.createdAt))}
                        </p>
                      </div>
                    ))}
                    {detail.orders.length === 0 && (
                      <p className="py-4 text-center text-xs text-slate-400">
                        {t("admin.users.noOrders")}
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
