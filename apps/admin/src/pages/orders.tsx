import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { OrderDetailDto } from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

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

  async function confirmPayment(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const reason = window.prompt("Основание ручного подтверждения (минимум 10 символов)");
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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.nav.orders")}</h1>
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? t(`orderStatus.${s}`) : t("admin.orders.allStatuses")}
            </option>
          ))}
        </Select>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.orders.colRecipient")}</th>
              <th className="px-4 py-3">{t("admin.orders.colAmount")}</th>
              <th className="px-4 py-3">{t("admin.orders.colSource")}</th>
              <th className="px-4 py-3">{t("admin.orders.colStatus")}</th>
              <th className="px-4 py-3">{t("admin.orders.colCreated")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => (
              <tr
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="px-4 py-3 font-medium">{order.recipientIdentifier}</td>
                <td className="px-4 py-3">
                  {order.amountTmt} TMT · {order.amountCharged} {order.currency}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {order.apiKey
                    ? t("admin.orders.apiSourcePrefix", { label: order.apiKey.ownerLabel })
                    : order.user?.phone ?? t("admin.orders.guestLabel")}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(order.createdAt).toLocaleString(LOCALE_BCP47[locale])}
                </td>
                <td className="px-4 py-3 text-right">
                  {order.status === "PENDING_PAYMENT" && order.paymentMethod?.provider === "manual" && (
                    <Button size="sm" disabled={busyId === order.id} onClick={(e) => confirmPayment(order.id, e)}>
                      {busyId === order.id ? "…" : t("admin.orders.confirmPayment")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.orders.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
