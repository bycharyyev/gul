"use client";

import { useEffect, useState } from "react";
import type { GalleryOrderAdminDto } from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";

const STATUS_OPTIONS = ["PENDING_PAYMENT", "PAID", "PROCESSING", "DELIVERED", "CANCELLED"];

export default function SellerOrdersPage() {
  const { t, locale } = useTranslation();
  const [orders, setOrders] = useState<GalleryOrderAdminDto[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    api.listMySellerOrders().then(setOrders).catch(() => {});
  }

  useEffect(load, []);

  async function changeStatus(id: string, status: string) {
    setBusyId(id);
    try {
      await api.updateMySellerOrderStatus(id, { status: status as never });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/50 text-xs uppercase text-slate-500 dark:bg-white/5">
          <tr>
            <th className="px-4 py-3">{t("sellerCabinet.orders.colProduct")}</th>
            <th className="px-4 py-3">{t("sellerCabinet.orders.colRecipient")}</th>
            <th className="px-4 py-3">{t("sellerCabinet.orders.colDelivery")}</th>
            <th className="px-4 py-3">{t("sellerCabinet.orders.colAmount")}</th>
            <th className="px-4 py-3">{t("sellerCabinet.orders.colStatus")}</th>
            <th className="px-4 py-3">{t("sellerCabinet.orders.colCreated")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/10">
          {orders.map((order) => (
            <tr key={order.id}>
              <td className="px-4 py-3 font-medium">{order.product.name}</td>
              <td className="px-4 py-3 text-xs">
                {order.recipientName}
                <br />
                <span className="text-slate-400">{order.recipientPhone}</span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
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
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {t(`orderStatus.${s}`)}
                      </option>
                    ))}
                  </Select>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                {new Date(order.createdAt).toLocaleString(LOCALE_BCP47[locale])}
              </td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                {t("sellerCabinet.orders.noOrders")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
