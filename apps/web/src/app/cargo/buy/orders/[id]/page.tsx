"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import {
  purchaseApi,
  type PurchaseOrder,
} from "@/lib/marketplace-purchase-api";
import { PurchaseRoute } from "@/components/cargo/purchase-route";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const stageFor = (s: string) =>
  s === "MANUAL_REVIEW" || s === "QUOTED" || s === "AUTHORIZATION_PENDING"
    ? 1
    : ["AUTHORIZED", "PURCHASING", "PURCHASED"].includes(s)
      ? 2
      : ["AT_WAREHOUSE", "READY_TO_SHIP"].includes(s)
        ? 3
        : s === "SHIPPED" || s === "DELIVERED"
          ? 4
          : 0;
export default function PurchaseOrderPage() {
  const { t, locale } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState("");
  const [cap, setCap] = useState("");
  const [consent, setConsent] = useState(false);
  const load = () =>
    purchaseApi
      .one(id)
      .then((v) => {
        setOrder(v);
        const q = v.quotes.at(-1);
        if (q && !cap) {
          const reserve = Math.ceil(Number(q.totalTmt) * 1.2 * 100) / 100;
          setCap(String(reserve));
        }
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [id]);
  const quote = useMemo(() => order?.quotes.at(-1), [order]);
  async function accept() {
    if (!order || !quote || !consent) return;
    try {
      setOrder(
        await purchaseApi.acceptQuote(order.id, {
          quoteVersion: quote.version,
          maxAuthorizedTmt: Number(cap),
          consentAccepted: true,
          consentVersion: "web-v1",
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  if (error && !order)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p>{t("web.purchase.orderError")}</p>
        <Link href="/cargo/buy">
          <Button className="mt-4">{t("web.purchase.back")}</Button>
        </Link>
      </div>
    );
  if (!order)
    return (
      <p className="py-20 text-center text-sm text-slate-400">
        {t("common.loading")}
      </p>
    );
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-canvas-dark">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-brand-600">
            {order.id}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-black">
              {t("web.purchase.orderTitle")}
            </h1>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
              {order.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {new Date(order.createdAt).toLocaleString(LOCALE_BCP47[locale])}
          </p>
        </header>
        <PurchaseRoute active={stageFor(order.status)} />
        <div className="grid gap-5 sm:grid-cols-[1fr_260px]">
          <section className="space-y-3">
            {order.items.map((item, i) => (
              <Card className="p-4" key={item.id ?? i}>
                <p className="font-bold">
                  {item.titleSnapshot || t("web.purchase.awaitingSnapshot")}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {item.variant || t("web.purchase.noVariant")} ·{" "}
                  {item.quantity} ×
                </p>
                <a
                  className="mt-2 block truncate text-xs text-brand-600"
                  href={item.canonicalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.canonicalUrl}
                </a>
              </Card>
            ))}
            {order.status === "MANUAL_REVIEW" && (
              <Card className="border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                {t("web.purchase.reviewPending")}
              </Card>
            )}
            {order.status === "AUTHORIZATION_PENDING" && (
              <Card className="border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
                {t("web.purchase.authorizationPending")}
              </Card>
            )}
          </section>
          <aside>
            <Card className="overflow-hidden p-0">
              <div className="bg-slate-950 p-5 text-white">
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  {t("web.purchase.expected")}
                </p>
                <p className="mt-1 text-2xl font-black">
                  {quote ? `${Number(quote.totalTmt).toFixed(2)} TMT` : "—"}
                </p>
              </div>
              <div className="space-y-3 p-5">
                {quote && order.status === "QUOTED" ? (
                  <>
                    <label className="text-xs font-semibold text-slate-500">
                      {t("web.purchase.maximum")}
                      <Input
                        type="number"
                        min={Number(quote.totalTmt)}
                        step="0.01"
                        value={cap}
                        onChange={(e) => setCap(e.target.value)}
                      />
                    </label>
                    <p className="text-xs text-slate-400">
                      {t("web.purchase.maximumHint")} По умолчанию ставим мягкий
                      резерв +20%; после фактического взвешивания лишнее
                      автоматически вернётся на баланс.
                    </p>
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        className="mt-1"
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>{t("web.purchase.consent")}</span>
                    </label>
                    <Button
                      className="w-full"
                      disabled={
                        !consent || Number(cap) < Number(quote.totalTmt)
                      }
                      onClick={accept}
                    >
                      {t("web.purchase.create")}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span>{t("web.purchase.maximum")}</span>
                      <b>
                        {order.maxAuthorizedTmt
                          ? `${Number(order.maxAuthorizedTmt).toFixed(2)} TMT`
                          : "—"}
                      </b>
                    </div>
                    {Number(order.authorizedTmt) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>{t("web.purchase.authorized")}</span>
                        <b>{Number(order.authorizedTmt).toFixed(2)} TMT</b>
                      </div>
                    )}
                    {Number(order.refundedTmt) > 0 && (
                      <div className="flex justify-between text-sm text-emerald-700">
                        <span>{t("web.purchase.refunded")}</span>
                        <b>{Number(order.refundedTmt).toFixed(2)} TMT</b>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </aside>
        </div>
        <Link href="/cargo/buy">
          <Button variant="secondary">{t("web.purchase.another")}</Button>
        </Link>
      </div>
    </main>
  );
}
