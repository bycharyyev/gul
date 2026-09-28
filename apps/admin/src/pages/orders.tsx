import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { OrderDetailDto } from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table";
import { promptAction } from "@/lib/confirm";

const STATUS_OPTIONS = [
  "",
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
  "CANCELLED",
];

export default function OrdersPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderDetailDto[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.listAllOrders(status || undefined);
      setOrders(data);
    } catch {
      // onSessionExpired already redirects to /login on 401
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const sourceName = (order: OrderDetailDto) =>
    order.apiKey?.ownerLabel ?? order.user?.phone ?? t("admin.orders.guestLabel");
  const visibleOrders = orders.filter((order) => {
    const haystack = `${order.id} ${order.recipientIdentifier} ${sourceName(order)}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (!source || sourceName(order) === source);
  });
  const completed = orders.filter((order) => order.status === "COMPLETED").length;
  const attention = orders.filter((order) => ["PENDING_PAYMENT", "PAID", "PROCESSING"].includes(order.status)).length;
  const sources = [...new Set(orders.map(sourceName))];

  async function confirmPayment(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const reason = await promptAction("Основание ручного подтверждения (минимум 10 символов)");
    if (!reason || reason.trim().length < 10) return;
    setBusyId(id);
    try {
      await api.confirmOrderPayment(id, reason.trim());
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Operations center</p>
          <h1 className="mt-1 text-2xl font-bold">{t("admin.nav.orders")}</h1>
          <p className="mt-1 text-sm text-slate-500">Контроль каждого заказа: источник, выполнение, сумма и следующее действие.</p>
        </div>
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Фильтр по статусу">
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? t(`orderStatus.${s}`) : t("admin.orders.allStatuses")}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OrderMetric label="Показано" value={visibleOrders.length} detail={`из ${orders.length} загруженных`} />
        <OrderMetric label="Требуют внимания" value={attention} detail="ожидают или в обработке" tone="amber" />
        <OrderMetric label="Выполнено" value={completed} detail="в текущем наборе" tone="green" />
        <OrderMetric label="Источники" value={sources.length} detail="каналов заказов" />
      </div>

      <Card className="border-brand-100 bg-gradient-to-r from-brand-50/70 via-white to-teal-50/60 p-4">
        <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto] md:items-center">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по ID, получателю или источнику…" className="h-10 rounded-lg border border-white bg-white px-3 text-sm outline-none ring-brand-200 transition focus:ring-2" />
          <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Фильтр по источнику">
            <option value="">Все источники</option>
            {sources.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <button type="button" onClick={() => { setQuery(""); setSource(""); setStatus(""); }} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:border-brand-300">Сбросить</button>
        </div>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <DataTable
          rows={visibleOrders}
          rowKey={(order) => order.id}
          onRowClick={(order) => navigate(`/orders/${order.id}`)}
          loading={loading}
          emptyText={t("admin.orders.empty")}
          exportName="orders"
          initialSort={{ id: "created", direction: "desc" }}
          minWidth="850px"
          toolbar={
            <div className="flex items-center gap-3">
              <div>
                <h2 className="font-semibold">Реестр заказов</h2>
                <p className="text-xs text-slate-500">Нажмите на строку, чтобы открыть полную карточку</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{visibleOrders.length} записей</span>
            </div>
          }
          columns={[
            {
              id: "recipient",
              header: t("admin.orders.colRecipient"),
              cell: (order) => order.recipientIdentifier,
              sortValue: (order) => order.recipientIdentifier,
              csv: (order) => order.recipientIdentifier,
              className: "font-medium",
            },
            {
              id: "amount",
              header: t("admin.orders.colAmount"),
              cell: (order) => `${order.amountTmt} TMT · ${order.amountCharged} ${order.currency}`,
              sortValue: (order) => Number(order.amountTmt),
              csv: (order) => Number(order.amountTmt),
            },
            {
              id: "source",
              header: t("admin.orders.colSource"),
              cell: (order) =>
                order.apiKey
                  ? t("admin.orders.apiSourcePrefix", { label: order.apiKey.ownerLabel })
                  : order.user?.phone ?? t("admin.orders.guestLabel"),
              sortValue: sourceName,
              csv: sourceName,
              className: "text-slate-500",
            },
            {
              id: "status",
              header: t("admin.orders.colStatus"),
              cell: (order) => <StatusBadge status={order.status} />,
              sortValue: (order) => t(`orderStatus.${order.status}`),
              csv: (order) => t(`orderStatus.${order.status}`),
            },
            {
              id: "created",
              header: t("admin.orders.colCreated"),
              cell: (order) => new Date(order.createdAt).toLocaleString(LOCALE_BCP47[locale]),
              sortValue: (order) => new Date(order.createdAt),
              csv: (order) => new Date(order.createdAt),
              className: "text-slate-500",
            },
            {
              id: "actions",
              header: "",
              className: "text-right",
              cell: (order) =>
                order.status === "PENDING_PAYMENT" && order.paymentMethod?.provider === "manual" ? (
                  <Button size="sm" disabled={busyId === order.id} onClick={(e) => confirmPayment(order.id, e)}>
                    {busyId === order.id ? "…" : t("admin.orders.confirmPayment")}
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>
    </div>
  );
}

function OrderMetric({ label, value, detail, tone = "brand" }: { label: string; value: number; detail: string; tone?: "brand" | "amber" | "green" }) {
  const colors = tone === "amber" ? "border-amber-200 bg-amber-50" : tone === "green" ? "border-emerald-200 bg-emerald-50" : "border-brand-100 bg-white";
  return <Card className={`border p-4 ${colors}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Card>;
}
