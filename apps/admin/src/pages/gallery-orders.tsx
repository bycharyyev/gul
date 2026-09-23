import { Fragment, useEffect, useState } from "react";
import type { GalleryOrderAdminDto, UpdateGalleryOrderDetailsInput } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";

const STATUS_OPTIONS = ["", "PENDING_PAYMENT", "PAID", "PROCESSING", "DELIVERED", "CANCELLED"];

/** Nothing left to correct once a courier has already used the address, or the order never
 * shipped at all. */
const LOCKED_STATUSES = new Set(["DELIVERED", "CANCELLED"]);

export default function GalleryOrdersPage() {
  const { t, locale } = useTranslation();
  const [orders, setOrders] = useState<GalleryOrderAdminDto[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  async function saveDetails(id: string, input: UpdateGalleryOrderDetailsInput) {
    const updated = await api.updateGalleryOrderDetails(id, input);
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    setEditingId(null);
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
              <th className="px-4 py-3">{t("admin.galleryOrders.colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => {
              const locked = LOCKED_STATUSES.has(order.status);
              return (
                <Fragment key={order.id}>
                  <tr>
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
                    <td className="px-4 py-3">
                      {!locked && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditingId((id) => (id === order.id ? null : order.id))}
                        >
                          {editingId === order.id ? t("common.cancel") : t("common.edit")}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {editingId === order.id && (
                    <tr>
                      <td colSpan={8} className="bg-slate-50 px-4 py-4">
                        <OrderDetailsForm
                          order={order}
                          onSave={(input) => saveDetails(order.id, input)}
                          onCancel={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
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

/** Corrects what the buyer typed for one order -- never the product or the amount they paid,
 * which the endpoint behind this refuses to touch at all. */
function OrderDetailsForm({
  order,
  onSave,
  onCancel,
}: {
  order: GalleryOrderAdminDto;
  onSave: (input: UpdateGalleryOrderDetailsInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    deliveryCity: order.deliveryCity,
    deliveryAddress: order.deliveryAddress,
    cardMessage: order.cardMessage ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.galleryOrders.editError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            {t("admin.galleryOrders.editRecipientName")}
          </label>
          <Input value={draft.recipientName} onChange={(e) => set("recipientName", e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            {t("admin.galleryOrders.editRecipientPhone")}
          </label>
          <Input value={draft.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            {t("admin.galleryOrders.editDeliveryCity")}
          </label>
          <Input value={draft.deliveryCity} onChange={(e) => set("deliveryCity", e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            {t("admin.galleryOrders.editDeliveryAddress")}
          </label>
          <Input value={draft.deliveryAddress} onChange={(e) => set("deliveryAddress", e.target.value)} required />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          {t("admin.galleryOrders.editCardMessage")}
        </label>
        <Input value={draft.cardMessage} onChange={(e) => set("cardMessage", e.target.value)} />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {saved && !error && <p className="text-sm text-emerald-600">{t("admin.galleryOrders.editSaved")}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
