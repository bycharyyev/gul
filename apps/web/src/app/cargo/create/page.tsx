"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CargoDirectionsDto,
  CargoItemTypeDto,
  CargoQuoteDto,
  PaymentMethodDto,
  ShipmentDeliveryMode,
} from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api, isAuthenticated } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CargoBanner } from "@/components/cargo-banner";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm dark:border-white/10 dark:bg-white/5";

export default function CreateShipmentPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [directions, setDirections] = useState<CargoDirectionsDto | null>(null);
  const [originCityId, setOriginCityId] = useState("");
  const [destinationCityId, setDestinationCityId] = useState("");
  const [itemTypeId, setItemTypeId] = useState("");

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDto[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");

  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<ShipmentDeliveryMode>("WAREHOUSE_PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [fragile, setFragile] = useState(false);
  const [notes, setNotes] = useState("");

  const [quote, setQuote] = useState<CargoQuoteDto | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemType: CargoItemTypeDto | undefined = useMemo(
    () => directions?.itemTypes.find((type) => type.id === itemTypeId),
    [directions, itemTypeId],
  );
  const isCounted = itemType?.pricingUnit === "PER_ITEM";
  const minWeightKg = itemType?.minWeightKg ?? null;

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    api
      .listCargoDirections()
      .then((data) => {
        setDirections(data);
        // Preselect anything there is only one of -- a dropdown with a single option is a
        // decision the customer never actually has to make.
        if (data.origins.length === 1 && data.origins[0]) setOriginCityId(data.origins[0].id);
        if (data.destinations.length === 1 && data.destinations[0]) setDestinationCityId(data.destinations[0].id);
        if (data.itemTypes[0]) setItemTypeId(data.itemTypes[0].id);
      })
      .catch(() => setDirections({ origins: [], destinations: [], itemTypes: [], weightBrackets: [] }));
    api
      .listPaymentMethods()
      .then((methods) => {
        setPaymentMethods(methods);
        if (methods.length === 1 && methods[0]) setPaymentMethodId(methods[0].id);
      })
      .catch(() => setPaymentMethods([]));
    // The sender is almost always the person filling the form in, so start from their profile
    // rather than making them retype what we already know. Both stay editable: people do send on
    // someone else's behalf, and that is a one-field correction instead of two fields of typing.
    api
      .getMe()
      .then((me) => {
        setSenderName((current) => current || me.fullName || "");
        setSenderPhone((current) => current || me.phone || "");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!itemType) {
      setQuote(null);
      return;
    }
    const weight = Number(weightKg);
    const count = Number(quantity);
    const ready = isCounted ? Number.isFinite(count) && count >= 1 : Number.isFinite(weight) && weight > 0;
    if (!ready) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    const timer = setTimeout(() => {
      api
        .getCargoQuote(
          isCounted
            ? { itemTypeId: itemType.id, quantity: Math.trunc(count) }
            : { itemTypeId: itemType.id, declaredWeightKg: weight },
        )
        .then(setQuote)
        // A quote below the minimum weight is a 400, not a crash: clear the price and let the
        // hint under the field explain why, rather than showing a stale total.
        .catch(() => setQuote(null))
        .finally(() => setQuoteLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [itemType, isCounted, weightKg, quantity]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const shipment = await api.createShipment({
        originCityId,
        destinationCityId,
        itemTypeId,
        paymentMethodId,
        senderName,
        senderPhone,
        pickupAddress,
        recipientName,
        recipientPhone,
        deliveryMode,
        deliveryAddress: deliveryMode === "DOOR_DELIVERY" ? deliveryAddress : undefined,
        declaredWeightKg: isCounted ? undefined : Number(weightKg),
        quantity: isCounted ? Math.trunc(Number(quantity)) : undefined,
        fragile,
        notes: notes || undefined,
      });
      router.push(`/cargo/shipments/${shipment.id}?created=1`);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.cargo.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (directions && directions.destinations.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-slate-500">{t("web.cargo.noRouteAvailable")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <CargoBanner />
      <h1 className="mb-6 text-2xl font-bold">{t("web.cargo.createTitle")}</h1>

      <form onSubmit={onSubmit} className="space-y-8">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-slate-500">{t("web.cargo.routeLabel")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.cargo.originCity")}</label>
              <select
                className={SELECT_CLASS}
                value={originCityId}
                onChange={(e) => setOriginCityId(e.target.value)}
                required
              >
                <option value="" disabled>
                  —
                </option>
                {directions?.origins.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.cargo.destinationCity")}</label>
              <select
                className={SELECT_CLASS}
                value={destinationCityId}
                onChange={(e) => setDestinationCityId(e.target.value)}
                required
              >
                <option value="" disabled>
                  —
                </option>
                {directions?.destinations.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-slate-500">{t("web.cargo.senderSection")}</h2>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.cargo.senderName")}</label>
            <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.cargo.senderPhone")}</label>
            <Input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="+70000000000" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.cargo.pickupAddress")}</label>
            <Input value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} required />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-slate-500">{t("web.cargo.recipientSection")}</h2>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.cargo.recipientName")}</label>
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.cargo.recipientPhone")}</label>
            <Input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.cargo.deliveryMode")}</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={deliveryMode === "WAREHOUSE_PICKUP"}
                  onChange={() => setDeliveryMode("WAREHOUSE_PICKUP")}
                />
                {t("web.cargo.warehousePickup")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={deliveryMode === "DOOR_DELIVERY"}
                  onChange={() => setDeliveryMode("DOOR_DELIVERY")}
                />
                {t("web.cargo.doorDelivery")}
              </label>
            </div>
          </div>
          {deliveryMode === "DOOR_DELIVERY" && (
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.cargo.deliveryAddress")}</label>
              <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} required />
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-slate-500">{t("web.cargo.cargoSection")}</h2>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.cargo.cargoTypeLabel")}</label>
            <select
              className={SELECT_CLASS}
              value={itemTypeId}
              onChange={(e) => setItemTypeId(e.target.value)}
              required
            >
              <option value="" disabled>
                —
              </option>
              {directions?.itemTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {itemType?.description && (
              <p className="mt-1 text-xs text-slate-400">{itemType.description}</p>
            )}
          </div>

          {/* Weight or count, never both: which one is billable is the cargo type's decision. */}
          {isCounted ? (
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.cargo.quantity")}</label>
              <Input
                type="number"
                min={1}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
              {itemType?.pricePerItemRub !== null && itemType?.pricePerItemRub !== undefined && (
                <p className="mt-1 text-xs text-slate-400">
                  {t("web.cargo.pricedPerItem")}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.cargo.declaredWeightKg")}</label>
              <Input
                type="number"
                min={minWeightKg ?? 0.1}
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                required
              />
              {minWeightKg !== null && (
                <p className="mt-1 text-xs text-slate-400">
                  {t("web.cargo.minWeightHint")} {minWeightKg} {t("web.cargo.kg")}
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fragile} onChange={(e) => setFragile(e.target.checked)} />
            {t("web.cargo.fragile")}
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.cargo.notes")}</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Card>

        {paymentMethods.length > 0 && (
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-500">{t("web.cargo.paymentMethodSection")}</h2>
            <div className="space-y-2">
              {paymentMethods.map((method) => (
                <label
                  key={method.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm",
                    paymentMethodId === method.id
                      ? "border-brand-400 bg-brand-50 dark:bg-brand-900/20"
                      : "border-slate-200 dark:border-white/10",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="payment-method"
                      checked={paymentMethodId === method.id}
                      onChange={() => setPaymentMethodId(method.id)}
                    />
                    {method.name}
                  </span>
                  {method.feePercent > 0 && (
                    <span className="text-xs text-slate-400">+{method.feePercent}%</span>
                  )}
                </label>
              ))}
            </div>
          </Card>
        )}

        {quote && (
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("web.cargo.quoteTitle")}</h2>
            <div className="space-y-1 text-sm">
              {quote.pricePerKgTmt !== null && (
                <div className="flex justify-between text-slate-500">
                  <span>{t("web.cargo.pricePerKg")}</span>
                  <span>{quote.pricePerKgTmt} TMT</span>
                </div>
              )}
              {quote.pricePerItemTmt !== null && (
                <div className="flex justify-between text-slate-500">
                  <span>{t("web.cargo.pricePerItem")}</span>
                  <span>
                    {quote.pricePerItemTmt} TMT × {quote.quantity}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-500">
                <span>{t("web.cargo.pickupFee")}</span>
                <span>{quote.pickupFeeTmt} TMT</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold dark:border-white/10">
                <span>{t("web.cargo.total")}</span>
                <span>{quote.totalPriceTmt} TMT</span>
              </div>
            </div>
          </Card>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        {/* The total rides on the button itself: it is the last thing read before committing, and
            a price that lives only in a card further up gets scrolled past on a phone. */}
        <Button type="submit" className="w-full" disabled={submitting || quoteLoading || !quote || !paymentMethodId}>
          {submitting
            ? t("web.cargo.submitting")
            : quote
              ? `${t("web.cargo.submit")} — ${quote.totalPriceTmt} TMT`
              : t("web.cargo.submit")}
        </Button>
      </form>
    </div>
  );
}
