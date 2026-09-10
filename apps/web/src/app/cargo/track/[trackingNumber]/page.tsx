"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { PublicTrackingDto } from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/cargo/status-pill";
import { cargoStatusLabel } from "@/lib/cargo-status";

export default function PublicTrackingPage() {
  const { t, locale } = useTranslation();
  const params = useParams<{ trackingNumber: string }>();
  const [result, setResult] = useState<PublicTrackingDto | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!params.trackingNumber) return;
    api
      .trackShipment(params.trackingNumber)
      .then(setResult)
      .catch(() => setNotFound(true));
  }, [params.trackingNumber]);

  if (notFound) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center text-slate-500">{t("web.cargo.trackNotFound")}</div>;
  }
  if (!result) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-lg font-bold">{result.publicTrackingNumber}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {result.originCity.name} → {result.destinationCity.name}
          </p>
        </div>
        <StatusPill status={result.status} />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-500">{t("web.cargo.timeline")}</h2>
        <div className="space-y-4">
          {result.trackingEvents.map((ev, i) => (
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
    </div>
  );
}
