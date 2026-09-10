"use client";

import { useState } from "react";
import type { TrackedOrderDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";

export default function TrackOrderPage() {
  const { t, locale } = useTranslation();
  const [orderId, setOrderId] = useState("");
  const [recipientIdentifier, setRecipientIdentifier] = useState("");
  const [result, setResult] = useState<TrackedOrderDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const tracked = await api.trackOrder({
        orderId: orderId.trim(),
        recipientIdentifier: recipientIdentifier.trim(),
      });
      setResult(tracked);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.track.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">{t("web.track.title")}</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("web.track.subtitle")}</p>

      <Card className="mt-6 p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.track.orderIdLabel")}</label>
            <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="cmxxxxxxxxx" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.track.recipientLabel")}</label>
            <Input
              value={recipientIdentifier}
              onChange={(e) => setRecipientIdentifier(e.target.value)}
              placeholder="+993 6X XXX XXX"
              required
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? t("web.track.submitting") : t("web.track.submit")}
          </Button>
        </form>
      </Card>

      {result && (
        <Card className="mt-6 p-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">{result.serviceName}</p>
            <StatusBadge status={result.status} />
          </div>
          <dl className="space-y-1 text-sm text-slate-500 dark:text-slate-400">
            <div className="flex justify-between">
              <dt>{t("web.track.amountLabel")}</dt>
              <dd>
                {result.amountTmt} TMT · {result.amountCharged} {result.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>{t("web.track.createdLabel")}</dt>
              <dd>{new Date(result.createdAt).toLocaleString(LOCALE_BCP47[locale])}</dd>
            </div>
            {result.completedAt && (
              <div className="flex justify-between">
                <dt>{t("web.track.completedLabel")}</dt>
                <dd>{new Date(result.completedAt).toLocaleString(LOCALE_BCP47[locale])}</dd>
              </div>
            )}
            {result.failureReason && (
              <div className="flex justify-between gap-4 text-rose-600">
                <dt className="shrink-0">{t("web.track.failureReasonLabel")}</dt>
                <dd className="text-right">{result.failureReason}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}
    </div>
  );
}
