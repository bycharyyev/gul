"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PaymentMethodDto, RateDto, ServiceDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api, isAuthenticated } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Step = "service" | "details" | "payment" | "done";

export function TopupWizard() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [services, setServices] = useState<ServiceDto[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDto[]>([]);
  const [rates, setRates] = useState<RateDto[]>([]);

  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amountTmt, setAmountTmt] = useState<number>(20);
  const [currency, setCurrency] = useState<string>("RUB");
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string | null>(null);

  useEffect(() => {
    api.listServices().then(setServices).catch(() => setError(t("web.topupWizard.loadServicesError")));
    api.listPaymentMethods().then((methods) => {
      setPaymentMethods(methods);
      if (methods[0]) setPaymentMethodId(methods[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link from a promo story: /?serviceId=...#topup preselects that service.
  useEffect(() => {
    const wantedId = searchParams.get("serviceId");
    if (!wantedId || wantedId === serviceId) return;
    const service = services.find((s) => s.id === wantedId);
    if (service) selectService(service);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, services]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  const selectedRate = useMemo(
    () => rates.find((r) => r.currency === currency) ?? null,
    [rates, currency],
  );

  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((m) => m.id === paymentMethodId) ?? null,
    [paymentMethods, paymentMethodId],
  );

  const subtotal = selectedRate ? amountTmt * selectedRate.rate : 0;
  const fee = selectedPaymentMethod ? subtotal * (selectedPaymentMethod.feePercent / 100) : 0;
  const total = Math.round((subtotal + fee) * 100) / 100;

  async function selectService(service: ServiceDto) {
    setServiceId(service.id);
    setAmountTmt(Math.max(Number(service.minAmountTmt), 20));
    setError(null);
    const serviceRates = await api.listRates(service.id);
    setRates(serviceRates);
    if (!serviceRates.find((r) => r.currency === currency) && serviceRates[0]) {
      setCurrency(serviceRates[0].currency);
    }
    setStep("details");
  }

  async function submitOrder() {
    if (!serviceId || !paymentMethodId) return;

    if (!isAuthenticated()) {
      router.push(`/login?next=/`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let currentOrderId = orderId;
      if (!currentOrderId) {
        const order = await api.createOrder({
          serviceId,
          paymentMethodId,
          recipientIdentifier: recipient,
          amountTmt,
          currency: currency as never,
        });
        currentOrderId = order.id;
        setOrderId(currentOrderId);
      }

      const idempotencyKey = paymentIdempotencyKey ?? crypto.randomUUID();
      setPaymentIdempotencyKey(idempotencyKey);
      const payment = await api.initiateOrderPayment(currentOrderId, idempotencyKey);

      if (payment.redirectUrl) {
        const redirect = new URL(payment.redirectUrl);
        if (redirect.protocol !== "https:") throw new Error("Unsafe payment redirect URL");
        // A provider's configured return URL is intentionally static. Keep the owning order in
        // this tab so the return page can resume without trusting an order id supplied by the
        // provider. The API still enforces ownership when it is fetched.
        window.sessionStorage.setItem("gulyaly.pendingPaymentOrderId", currentOrderId);
        window.location.assign(redirect.toString());
        return;
      }

      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? translateError(t, e.message) : t("web.topupWizard.orderError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl p-6 sm:p-8" id="topup">
      <div className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        {(["service", "details", "payment", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full",
                step === s || (["details", "payment", "done"].indexOf(step) > i)
                  ? "bg-gradient-brand text-white"
                  : "bg-slate-100 text-slate-400 dark:bg-white/10",
              )}
            >
              {i + 1}
            </span>
            {i < 3 && <span className="h-px w-6 bg-slate-200 dark:bg-white/10" />}
          </div>
        ))}
      </div>

      {step === "service" && (
        <div>
          <h2 className="text-lg font-bold">{t("web.topupWizard.selectServiceTitle")}</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            {t("web.topupWizard.selectServiceSubtitle")}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {services.map((service) => (
              <button
                key={service.id}
                onClick={() => selectService(service)}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm font-medium transition hover:border-brand-400 hover:bg-brand-50 dark:border-white/10 dark:hover:bg-white/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-brand-100 to-accent-100 text-brand-700 dark:from-brand-900/40 dark:to-accent-900/40 dark:text-brand-200">
                  {service.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={service.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    service.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                {service.name}
              </button>
            ))}
            {services.length === 0 && (
              <p className="col-span-full text-sm text-slate-400">{t("web.topupWizard.loadingServices")}</p>
            )}
          </div>
        </div>
      )}

      {step === "details" && selectedService && (
        <div className="space-y-4">
          <button
            onClick={() => setStep("service")}
            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            ← {selectedService.name}
          </button>

          <div>
            <label className="mb-1 block text-sm font-medium">
              {selectedService.inputType === "PHONE" ? t("web.topupWizard.phoneLabel") : t("web.topupWizard.accountIdLabel")}
            </label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={selectedService.inputType === "PHONE" ? "+993 6X XXX XXX" : t("web.topupWizard.accountIdPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.topupWizard.amountLabel")}</label>
              <Input
                type="number"
                min={Number(selectedService.minAmountTmt)}
                max={Number(selectedService.maxAmountTmt)}
                value={amountTmt}
                onChange={(e) => setAmountTmt(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-slate-400">
                {t("web.topupWizard.amountRangeHint", {
                  min: selectedService.minAmountTmt,
                  max: selectedService.maxAmountTmt,
                })}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.topupWizard.currencyLabel")}</label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {rates.map((r) => (
                  <option key={r.currency} value={r.currency}>
                    {r.currency}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {selectedRate && (
            <div className="rounded-xl bg-gradient-brand-soft p-3 text-sm">
              {t("web.topupWizard.payableLabel")} <span className="font-semibold">{subtotal.toFixed(2)} {currency}</span>
            </div>
          )}

          <Button
            className="w-full"
            disabled={!recipient || amountTmt <= 0}
            onClick={() => setStep("payment")}
          >
            {t("web.topupWizard.continueButton")}
          </Button>
        </div>
      )}

      {step === "payment" && (
        <div className="space-y-4">
          <button
            onClick={() => {
              if (!orderId) setStep("details");
            }}
            disabled={Boolean(orderId)}
            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            ← {t("web.topupWizard.backButton")}
          </button>

          <h2 className="text-lg font-bold">{t("web.topupWizard.paymentMethodTitle")}</h2>
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
                  <span className="text-xs text-slate-400">
                    {t("web.topupWizard.feeLabel", { percent: method.feePercent })}
                  </span>
                )}
              </label>
            ))}
          </div>

          <div className="rounded-xl bg-gradient-brand-soft p-4 text-sm">
            <div className="flex justify-between">
              <span>{t("web.topupWizard.subtotalLabel")}</span>
              <span>{subtotal.toFixed(2)} {currency}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>{t("web.topupWizard.commissionLabel")}</span>
              <span>{fee.toFixed(2)} {currency}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold dark:border-white/10">
              <span>{t("web.topupWizard.totalLabel")}</span>
              <span>{total.toFixed(2)} {currency}</span>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <Button className="w-full" disabled={loading} onClick={submitOrder}>
            {loading
              ? t("web.topupWizard.submitting")
              : t("web.topupWizard.payButton", { amount: total.toFixed(2), currency })}
          </Button>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
            ✓
          </div>
          <h2 className="text-lg font-bold">{t("web.topupWizard.orderCreatedTitle")}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("web.topupWizard.orderCreatedBody", { orderNumber: orderId?.slice(-8) ?? "" })}
          </p>
          <Button className="w-full" onClick={() => router.push("/account")}>
            {t("web.topupWizard.goToAccountButton")}
          </Button>
        </div>
      )}
    </Card>
  );
}
