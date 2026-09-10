import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { OrderDetailDto, OrderStatus } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";

const NEXT_ACTIONS: Partial<Record<OrderStatus, { labelKey: string; target: OrderStatus; variant: "secondary" | "danger"; needsReason?: boolean }[]>> = {
  PENDING_PAYMENT: [{ labelKey: "admin.orderDetail.actionCancel", target: "CANCELLED", variant: "danger", needsReason: true }],
  PAID: [
    { labelKey: "admin.orderDetail.actionCancel", target: "CANCELLED", variant: "danger", needsReason: true },
    { labelKey: "admin.orderDetail.actionRefund", target: "REFUNDED", variant: "secondary", needsReason: true },
  ],
  PROCESSING: [
    { labelKey: "admin.orderDetail.actionMarkFailed", target: "FAILED", variant: "danger", needsReason: true },
    { labelKey: "admin.orderDetail.actionRefund", target: "REFUNDED", variant: "secondary", needsReason: true },
  ],
  COMPLETED: [{ labelKey: "admin.orderDetail.actionRefund", target: "REFUNDED", variant: "secondary", needsReason: true }],
  FAILED: [
    { labelKey: "admin.orderDetail.actionCancel", target: "CANCELLED", variant: "danger", needsReason: true },
    { labelKey: "admin.orderDetail.actionRefund", target: "REFUNDED", variant: "secondary", needsReason: true },
  ],
};

export default function OrderDetailPage() {
  const { t, locale } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editRecipient, setEditRecipient] = useState("");
  const [editAmount, setEditAmount] = useState(0);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    api
      .getOrder(id)
      .then((o) => {
        setOrder(o);
        setDeliveryNote(o.deliveryNote ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function saveDeliveryNote() {
    if (!id) return;
    setNoteBusy(true);
    setNoteSaved(false);
    setError(null);
    try {
      await api.setOrderDeliveryNote(id, { deliveryNote });
      setNoteSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.orderDetail.saveNoteError"));
    } finally {
      setNoteBusy(false);
    }
  }

  function startEdit() {
    if (!order) return;
    setEditRecipient(order.recipientIdentifier);
    setEditAmount(order.amountTmt);
    setEditing(true);
  }

  async function saveEdit() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateOrderDetails(id, { recipientIdentifier: editRecipient, amountTmt: editAmount });
      setEditing(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.orderDetail.saveEditError"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment() {
    if (!id) return;
    const reason = window.prompt("Основание ручного подтверждения (минимум 10 символов)");
    if (!reason || reason.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      await api.confirmOrderPayment(id, reason.trim());
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.orderDetail.confirmPaymentError"));
    } finally {
      setBusy(false);
    }
  }

  async function retryTopup() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.retryOrderTopup(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.orderDetail.retryTopupError"));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(target: OrderStatus, needsReason?: boolean) {
    if (!id) return;
    let reason: string | undefined;
    if (needsReason) {
      reason = prompt(t("admin.orderDetail.reasonPrompt")) ?? undefined;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateOrderStatus(id, { status: target, reason });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.orderDetail.changeStatusError"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;
  if (!order) return <p className="text-sm text-slate-400">{t("admin.orderDetail.notFound")}</p>;

  const actions = NEXT_ACTIONS[order.status] ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={() => navigate("/orders")} className="text-sm font-medium text-brand-600 hover:underline">
        {t("admin.orderDetail.backToOrders")}
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.orderDetail.title", { id: order.id.slice(-8) })}</h1>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} />
          {order.status === "PENDING_PAYMENT" && !editing && (
            <Button variant="secondary" size="sm" onClick={startEdit}>
              {t("common.edit")}
            </Button>
          )}
        </div>
      </div>

      <Card className="p-5">
        {editing ? (
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.orderDetail.recipientLabel")}</label>
              <Input value={editRecipient} onChange={(e) => setEditRecipient(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.orderDetail.amountTmtLabel")}</label>
              <Input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(Number(e.target.value))}
              />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button size="sm" disabled={busy} onClick={saveEdit}>
                {busy ? t("common.saving") : t("common.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : null}
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500">{t("admin.orderDetail.recipientLabel")}</dt>
            <dd className="font-medium">{order.recipientIdentifier}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("admin.orderDetail.serviceLabel")}</dt>
            <dd className="font-medium">{order.service?.name ?? order.serviceId}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("admin.orderDetail.topupAmountLabel")}</dt>
            <dd className="font-medium">{order.amountTmt} TMT</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("admin.orderDetail.chargedLabel")}</dt>
            <dd className="font-medium">
              {t("admin.orderDetail.chargedDetail", {
                amount: order.amountCharged,
                currency: order.currency,
                rate: order.rateApplied,
                fee: order.feeAmount,
              })}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("admin.orderDetail.paymentMethodLabel")}</dt>
            <dd className="font-medium">{order.paymentMethod?.name ?? order.paymentMethodId}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("admin.orderDetail.sourceLabel")}</dt>
            <dd className="font-medium">
              {order.apiKey
                ? t("admin.orderDetail.apiKeySource", { name: order.apiKey.name, owner: order.apiKey.ownerLabel })
                : order.user
                  ? order.user.phone
                  : t("admin.orderDetail.guestLabel")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("admin.orderDetail.createdLabel")}</dt>
            <dd className="font-medium">{new Date(order.createdAt).toLocaleString(LOCALE_BCP47[locale])}</dd>
          </div>
          {order.failureReason && (
            <div className="col-span-2">
              <dt className="text-slate-500">{t("admin.orderDetail.reasonLabel")}</dt>
              <dd className="font-medium text-rose-600">{order.failureReason}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-500">{t("admin.orderDetail.customerInfoHeading")}</h2>
        <p className="mb-3 text-xs text-slate-400">
          {t("admin.orderDetail.customerInfoHint")}
        </p>
        <textarea
          value={deliveryNote}
          onChange={(e) => {
            setDeliveryNote(e.target.value);
            setNoteSaved(false);
          }}
          rows={3}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button size="sm" variant="secondary" disabled={noteBusy} onClick={saveDeliveryNote}>
            {noteBusy ? t("common.saving") : t("common.save")}
          </Button>
          {noteSaved && <span className="text-xs text-emerald-600">{t("admin.orderDetail.noteSaved")}</span>}
        </div>
      </Card>

      {order.topupJob && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.orderDetail.topupJobHeading")}</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">{t("admin.orderDetail.statusLabel")}</dt>
              <dd>
                <StatusBadge status={order.topupJob.status} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("admin.orderDetail.attemptsLabel")}</dt>
              <dd className="font-medium">{order.topupJob.attempts}</dd>
            </div>
            {order.topupJob.lastError && (
              <div className="col-span-2">
                <dt className="text-slate-500">{t("admin.orderDetail.lastErrorLabel")}</dt>
                <dd className="font-medium text-rose-600">{order.topupJob.lastError}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {order.payments && order.payments.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.orderDetail.paymentsHeading")}</h2>
          <div className="space-y-2">
            {order.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span>
                  {p.provider} · {p.amount} {p.currency}
                </span>
                <span className="text-slate-500">{p.status}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {order.status === "PENDING_PAYMENT" && order.paymentMethod?.provider === "manual" && (
          <Button disabled={busy} onClick={confirmPayment}>
            {t("admin.orderDetail.confirmPayment")}
          </Button>
        )}
        {order.status === "FAILED" && (
          <Button disabled={busy} onClick={retryTopup}>
            {t("admin.orderDetail.retryTopup")}
          </Button>
        )}
        {actions.map((action) => (
          <Button
            key={action.target}
            variant={action.variant}
            disabled={busy}
            onClick={() => changeStatus(action.target, action.needsReason)}
          >
            {t(action.labelKey)}
          </Button>
        ))}
      </div>
    </div>
  );
}
