import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { ShipmentDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

const ALL_STATUSES = [
  "DRAFT",
  "QUOTE_CREATED",
  "PENDING_PAYMENT",
  "PAID",
  "PICKUP_REQUESTED",
  "PICKUP_CONFIRMED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_DESTINATION",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "ON_HOLD",
  "EXCEPTION",
];

export default function CargoShipmentDetailPage() {
  const { t, locale } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState<ShipmentDto | null>(null);
  const [nextStatus, setNextStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    const data = await api.getShipmentAdmin(id);
    setShipment(data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function applyStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !nextStatus) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateShipmentStatus(id, { status: nextStatus as ShipmentDto["status"], note: statusNote || undefined });
      setNextStatus("");
      setStatusNote("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("admin.cargo.noTransitions"));
    } finally {
      setBusy(false);
    }
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !note.trim()) return;
    setBusy(true);
    try {
      await api.addShipmentNote(id, note.trim());
      setNote("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!shipment) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate("/cargo")} className="text-xs text-slate-400 hover:underline">
            {t("admin.cargo.backToList")}
          </button>
          <h1 className="mt-1 font-mono text-xl font-bold">{shipment.publicTrackingNumber}</h1>
        </div>
        <StatusBadge status={shipment.status} className="text-sm" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">{t("admin.cargo.sender")}</h3>
              <p className="text-sm font-medium">{shipment.senderName}</p>
              <p className="text-sm text-slate-500">{shipment.senderPhone}</p>
              <p className="text-sm text-slate-500">{shipment.pickupAddress}</p>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">{t("admin.cargo.recipient")}</h3>
              <p className="text-sm font-medium">{shipment.recipientName}</p>
              <p className="text-sm text-slate-500">{shipment.recipientPhone}</p>
              {shipment.deliveryAddress && <p className="text-sm text-slate-500">{shipment.deliveryAddress}</p>}
              <p className="mt-1 text-xs text-slate-400">
                {shipment.deliveryMode === "DOOR_DELIVERY" ? t("admin.cargo.doorDelivery") : t("admin.cargo.warehousePickup")}
              </p>
            </div>
            <div className="sm:col-span-2">
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">{t("admin.cargo.cargoDetails")}</h3>
              <p className="text-sm">{shipment.itemType.name}</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                {/* Billed by weight or by count, never both -- show the one that priced it. */}
                {shipment.declaredWeightKg !== null ? (
                  <span>
                    {t("admin.cargo.declaredWeight")}: {shipment.declaredWeightKg} kg
                  </span>
                ) : (
                  <span>
                    {t("admin.cargo.quantity")}: {shipment.quantity} {t("admin.cargo.pcs")}
                  </span>
                )}
                {shipment.fragile && <span>{t("admin.cargo.fragile")}</span>}
                <span>
                  {t("admin.cargo.paymentMethod")}: {shipment.paymentMethod.name}
                </span>
                <span className="font-semibold text-slate-700">
                  {t("admin.cargo.total")}: {shipment.totalPriceTmt} TMT
                </span>
              </div>
              {shipment.notes && (
                <p className="mt-2 text-xs text-slate-400">
                  {t("admin.cargo.notesLabel")}: {shipment.notes}
                </p>
              )}
            </div>
            {shipment.pickup && (
              <div className="sm:col-span-2">
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">{t("admin.cargo.pickupDetails")}</h3>
                <p className="text-sm text-slate-600">
                  {shipment.pickup.address} · {new Date(shipment.pickup.requestedDate).toLocaleDateString(LOCALE_BCP47[locale])} ·{" "}
                  {shipment.pickup.timeWindow} · {shipment.pickup.phone}
                </p>
                <StatusBadge status={shipment.pickup.status} className="mt-1" />
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.cargo.timeline")}</h2>
            <div className="space-y-3">
              {shipment.trackingEvents.map((ev, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="w-36 shrink-0 text-xs text-slate-400">
                    {new Date(ev.createdAt).toLocaleString(LOCALE_BCP47[locale])}
                  </div>
                  <div>
                    <StatusBadge status={ev.status} />
                    {ev.note && <p className="mt-1 text-xs text-slate-500">{ev.note}</p>}
                    {ev.createdBy && <p className="mt-0.5 text-[11px] text-slate-400">{ev.createdBy.fullName || ev.createdBy.phone}</p>}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={submitNote} className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
              <Input
                placeholder={t("admin.cargo.notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={busy || !note.trim()}>
                {t("admin.cargo.addNote")}
              </Button>
            </form>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.cargo.changeStatus")}</h2>
          <form onSubmit={applyStatus} className="space-y-3">
            <Select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
              <option value="">—</option>
              {ALL_STATUSES.filter((s) => s !== shipment.status).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Input
              placeholder={t("admin.cargo.notePlaceholder")}
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
            />
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <Button type="submit" disabled={busy || !nextStatus} className="w-full">
              {t("admin.cargo.changeStatus")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
