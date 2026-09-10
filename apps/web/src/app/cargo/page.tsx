"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ShipmentDto } from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api, isAuthenticated } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { ShoppingBag, Truck } from "@phosphor-icons/react/dist/ssr";
import { StatusPill } from "@/components/cargo/status-pill";
import { CargoBanner } from "@/components/cargo-banner";

export default function CargoHomePage() {
  const { t, locale } = useTranslation();
  const [shipments, setShipments] = useState<ShipmentDto[] | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      setShipments([]);
      return;
    }
    api
      .listMyShipments()
      .then(setShipments)
      .catch(() => setShipments([]));
  }, []);

  return (
    <div className="bg-hero-gradient min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <CargoBanner />
        <h1 className="text-3xl font-bold">{t("web.cargo.title")}</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">{t("web.cargo.subtitle")}</p>

        {/* Cargo does two jobs, and which one you need depends on whether you already own the
            goods. Three equal buttons made that a guess and put support on the same footing as a
            service; two cards state who each one is for, and support steps back to a link.

            No "track shipment" entry: every shipment in the list below opens its own timeline
            when tapped, so a separate lookup-by-number screen was a second door to the same room. */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link href="/cargo/create" className="group">
            <Card className="flex h-full items-start gap-4 p-5 transition group-hover:border-brand-300">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30">
                <Truck size={22} weight="duotone" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-bold">{t("web.cargo.sendButton")}</span>
                <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
                  {t("web.cargo.sendSubtitle")}
                </span>
              </span>
            </Card>
          </Link>
          <Link href="/cargo/buy" className="group">
            <Card className="flex h-full items-start gap-4 p-5 transition group-hover:border-brand-300">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30">
                <ShoppingBag size={22} weight="duotone" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-bold">{t("web.purchase.start")}</span>
                <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
                  {t("web.purchase.entrySubtitle")}
                </span>
              </span>
            </Card>
          </Link>
        </div>
        <Link href="/chat" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
          {t("web.cargo.supportButton")}
        </Link>

        {isAuthenticated() && (
          <div className="mt-12">
            <h2 className="mb-4 text-xl font-bold">{t("web.cargo.myShipmentsTitle")}</h2>
            {shipments === null && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
            {shipments && shipments.length === 0 && (
              <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {t("web.cargo.noShipments")}
              </Card>
            )}
            <div className="space-y-3">
              {shipments?.map((s) => (
                <Link key={s.id} href={`/cargo/shipments/${s.id}`}>
                  <Card className="flex items-center justify-between p-4 transition hover:bg-slate-50 dark:hover:bg-white/5">
                    <div>
                      <p className="font-mono text-sm font-semibold">{s.publicTrackingNumber}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {s.originCity.name} → {s.destinationCity.name} ·{" "}
                        {new Date(s.createdAt).toLocaleDateString(LOCALE_BCP47[locale])}
                      </p>
                    </div>
                    <StatusPill status={s.status} />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
