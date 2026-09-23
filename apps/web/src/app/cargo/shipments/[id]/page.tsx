"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ShipmentDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api, isAuthenticated } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/cargo/status-pill";
import { cargoStatusLabel } from "@/lib/cargo-status";

export default function ShipmentDetailPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";

  const [shipment, setShipment] = useState<ShipmentDto | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupWindow, setPickupWindow] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");
  const [pickupBusy, setPickupBusy] = useState(false);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [pickupDone, setPickupDone] = useState(false);

  async function load() {
    if (!params.id) return;
    try {
      const data = await api.getShipment(params.id);
      setShipment(data);
      setPickupAddress(data.pickupAddress);
      setPickupPhone(data.senderPhone);
    } catch {
      setNotFound(true);
    }
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function requestPickup(e: React.FormEvent) {
    e.preventDefault();
    if (!params.id) return;
    setPickupBusy(true);
    setPickupError(null);
    try {
      await api.requestShipmentPickup(params.id, {
        address: pickupAddress,
        requestedDate: pickupDate,
        timeWindow: pickupWindow,
        phone: pickupPhone,
        notes: pickupNotes || undefined,
      });
      setPickupDone(true);
      await load();
    } catch (err) {
      setPickupError(err instanceof ApiError ? translateError(t, err.message) : t("web.cargo.genericError"));
    } finally {
      setPickupBusy(false);
    }
  }

  if (notFound) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">{t("web.cargo.trackNotFound")}</div>;
  }
  if (!shipment) return null;

  const canRequestPickup = shipment.status === "PAID" && !shipment.pickup;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {justCreated && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-500/10">
          <h2 className="font-semibold text-emerald-700 dark:text-emerald-300">{t("web.cargo.successTitle")}</h2>
          <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-300/80">{t("web.cargo.successBody")}</p>
        </Card>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-lg font-bold">{shipment.publicTrackingNumber}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {shipment.originCity.name} → {shipment.destinationCity.name}
          </p>
        </div>
        <StatusPill status={shipment.status} />
      </div>

      <Card className="mb-6 space-y-3 p-5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">{t("web.cargo.cargoTypeLabel")}</span>
          <span>{shipment.itemType.name}</span>
        </div>
        {/* A shipment is billed either by weight or by count, so show whichever one it was. */}
        {shipment.declaredWeightKg !== null ? (
          <div className="flex justify-between">
            <span className="text-slate-500">{t("web.cargo.declaredWeightKg")}</span>
            <span>
              {shipment.declaredWeightKg} {t("web.cargo.kg")}
            </span>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-slate-500">{t("web.cargo.quantity")}</span>
            <span>{shipment.quantity}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-500">{t("web.cargo.paymentMethodSection")}</span>
          <span>{shipment.paymentMethod.name}</span>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-3 font-semibold dark:border-white/10">
          <span>{t("web.cargo.total")}</span>
          <span>{shipment.totalPriceTmt} TMT</span>
        </div>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-500">{t("web.cargo.timeline")}</h2>
        <div className="space-y-4">
          {shipment.trackingEvents.map((ev, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
              <div>
                <p className="font-medium">{cargoStatusLabel(t, ev.status)}</p>
                <p className="text-xs text-slate-400">{new Date(ev.createdAt).toLocaleString(LOCALE_BCP47[locale])}</p>
                {ev.note && <p className="mt-0.5 text-xs text-slate-500">{ev.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {canRequestPickup && !pickupDone && (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-500">{t("web.cargo.requestPickupTitle")}</h2>
          <form onSubmit={requestPickup} className="space-y-3">
            <Input
              placeholder={t("web.cargo.pickupAddress")}
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              required
            />
            <Input
              type="date"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              required
            />
            <Input
              placeholder={t("web.cargo.timeWindow")}
              value={pickupWindow}
              onChange={(e) => setPickupWindow(e.target.value)}
              required
            />
            <Input
              placeholder={t("web.cargo.pickupPhone")}
              value={pickupPhone}
              onChange={(e) => setPickupPhone(e.target.value)}
              required
            />
            <Input
              placeholder={t("web.cargo.pickupNotes")}
              value={pickupNotes}
              onChange={(e) => setPickupNotes(e.target.value)}
            />
            {pickupError && <p className="text-sm text-rose-600">{pickupError}</p>}
            <Button type="submit" disabled={pickupBusy} className="w-full">
              {t("web.cargo.requestPickupButton")}
            </Button>
          </form>
        </Card>
      )}

      {shipment.pickup && (
        <Card className="p-5 text-sm text-slate-500">{t("web.cargo.pickupRequested")}</Card>
      )}
    </div>
  );
}
