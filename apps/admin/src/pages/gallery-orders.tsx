import { useEffect, useState } from "react";
import type { GalleryOrderAdminDto } from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";

const STATUS_OPTIONS = ["", "PENDING_PAYMENT", "PAID", "PROCESSING", "DELIVERED", "CANCELLED"];

export default function GalleryOrdersPage() {
  const { t, locale } = useTranslation();
  const [orders, setOrders] = useState<GalleryOrderAdminDto[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api
      .listAllGalleryOrders(status || undefined)
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function changeStatus(id: string, next: string) {
    setBusyId(id);
    try {
      await api.updateGalleryOrderStatus(id, { status: next as never });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.nav.galleryOrders")}</h1>
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? t(`orderStatus.${s}`) : t("admin.galleryOrders.allStatuses")}
            </option>
          ))}
        </Select>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.galleryOrders.colProduct")}</th>
              <th className="px-4 py-3">{t("admin.galleryOrders.colBuyer")}</th>
              <th className="px-4 py-3">{t("admin.galleryOrders.colRecipient")}</th>
              <th className="px-4 py-3">{t("admin.galleryOrders.colDelivery")}</th>
              <th className="px-4 py-3">{t("admin.galleryOrders.colAmount")}</th>
              <th className="px-4 py-3">{t("admin.galleryOrders.colStatus")}</th>
              <th className="px-4 py-3">{t("admin.galleryOrders.colCreated")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="px-4 py-3 font-medium">{order.product.name}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {order.user.fullName || order.user.phone}
                </td>
                <td className="px-4 py-3 text-xs">
                  {order.recipientName}
                  <br />
                  <span className="text-slate-400">{order.recipientPhone}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {order.deliveryCity}, {order.deliveryAddress}
                </td>
                <td className="px-4 py-3">{order.amountTmt} TMT</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={order.status} />
                    <Select
                      className="h-8 w-36 text-xs"
                      value={order.status}
                      disabled={busyId === order.id}
                      onChange={(e) => changeStatus(order.id, e.target.value)}
                    >
                      {STATUS_OPTIONS.filter((s) => s).map((s) => (
                        <option key={s} value={s}>
                          {t(`orderStatus.${s}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(order.createdAt).toLocaleString(LOCALE_BCP47[locale])}
                </td>
              </tr>
            ))}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.galleryOrders.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
