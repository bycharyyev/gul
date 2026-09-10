"use client";

import { useEffect, useState } from "react";
import type { AdPricingDto, GalleryProductDto, HomeSlideDetailDto, StoryDetailDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export default function SellerAdsPage() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<GalleryProductDto[]>([]);
  const [balanceTmt, setBalanceTmt] = useState(0);
  const [storyPricing, setStoryPricing] = useState<AdPricingDto | null>(null);
  const [slidePricing, setSlidePricing] = useState<AdPricingDto | null>(null);
  const [storyAds, setStoryAds] = useState<StoryDetailDto[]>([]);
  const [slideAds, setSlideAds] = useState<HomeSlideDetailDto[]>([]);

  function loadHistory() {
    api.listMyStoryAds().then(setStoryAds).catch(() => {});
    api.listMySlideAds().then(setSlideAds).catch(() => {});
  }

  function loadBalance() {
    api.getMySellerProfile().then((p) => setBalanceTmt(p.balanceTmt)).catch(() => {});
  }

  useEffect(() => {
    api.listMySellerProducts().then(setProducts).catch(() => {});
    api.getStoryAdPricing().then(setStoryPricing).catch(() => {});
    api.getSlideAdPricing().then(setSlidePricing).catch(() => {});
    loadBalance();
    loadHistory();
  }, []);

  function onPurchased() {
    loadBalance();
    loadHistory();
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <p className="text-xs font-medium uppercase text-slate-400">{t("sellerCabinet.ads.adBalance")}</p>
        <p className="mt-1 text-2xl font-bold">{balanceTmt} TMT</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdPurchaseCard
          title={t("sellerCabinet.ads.storyAdTitle")}
          description={t("sellerCabinet.ads.storyAdDescription")}
          pricing={storyPricing}
          products={products}
          onBuy={(input) => api.createMyStoryAd(input)}
          onPurchased={onPurchased}
        />
        <AdPurchaseCard
          title={t("sellerCabinet.ads.slideAdTitle")}
          description={t("sellerCabinet.ads.slideAdDescription")}
          pricing={slidePricing}
          products={products}
          onBuy={(input) => api.createMySlideAd(input)}
          onPurchased={onPurchased}
        />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">{t("sellerCabinet.ads.myStoryAds")}</h2>
        <AdHistoryList
          items={storyAds.map((s) => ({
            id: s.id,
            title: s.title,
            imageUrl: s.imageUrl,
            priceTmt: s.priceTmt,
            isActive: s.isActive,
            endsAt: s.endsAt,
          }))}
        />
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-slate-500">{t("sellerCabinet.ads.mySlideAds")}</h2>
        <AdHistoryList
          items={slideAds.map((s) => ({
            id: s.id,
            title: s.title,
            imageUrl: s.imageUrl,
            priceTmt: s.priceTmt,
            isActive: s.isActive,
            endsAt: s.endsAt,
          }))}
        />
      </Card>
    </div>
  );
}

function AdPurchaseCard({
  title,
  description,
  pricing,
  products,
  onBuy,
  onPurchased,
}: {
  title: string;
  description: string;
  pricing: AdPricingDto | null;
  products: GalleryProductDto[];
  onBuy: (input: { title: string; subtitle?: string; imageUrl: string; ctaLabel?: string; galleryProductId: string }) => Promise<unknown>;
  onPurchased: () => void;
}) {
  const { t } = useTranslation();
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const product = products.find((p) => p.id === productId);

  async function buy() {
    if (!product) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await onBuy({
        title: product.name,
        subtitle: product.description ?? undefined,
        imageUrl: product.imageUrl,
        ctaLabel: t("sellerCabinet.ads.ctaWatchProduct"),
        galleryProductId: product.id,
      });
      setSuccess(true);
      setProductId("");
      onPurchased();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("sellerCabinet.ads.buyError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>

      {pricing && (
        <p className="mt-2 text-lg font-bold">
          {pricing.priceTmt} TMT{" "}
          <span className="text-xs font-normal text-slate-400">
            {t("sellerCabinet.ads.priceForDays", { days: pricing.durationDays })}
          </span>
        </p>
      )}

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.ads.whichProductLabel")}</label>
        <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="" disabled>
            {t("sellerCabinet.ads.selectProduct")}
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({t("sellerCabinet.ads.skuLabel", { sku: p.sku })})
            </option>
          ))}
        </Select>
        {products.length === 0 && (
          <p className="mt-1 text-xs text-slate-400">{t("sellerCabinet.ads.addProductFirstHint")}</p>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {success && <p className="mt-2 text-sm text-emerald-600">{t("sellerCabinet.ads.adPurchasedSuccess")}</p>}

      <Button className="mt-4" onClick={buy} disabled={busy || !productId}>
        {busy ? t("sellerCabinet.ads.buyingInProgress") : t("sellerCabinet.ads.buyAd")}
      </Button>
    </Card>
  );
}

function AdHistoryList({
  items,
}: {
  items: { id: string; title: string; imageUrl: string; priceTmt: number | null; isActive: boolean; endsAt: string | null }[];
}) {
  const { t, locale } = useTranslation();
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">{t("sellerCabinet.ads.noAdsYet")}</p>;
  }
  const now = Date.now();
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const expired = item.endsAt ? new Date(item.endsAt).getTime() < now : false;
        const live = item.isActive && !expired;
        return (
          <div key={item.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-xs text-slate-400">
                {item.priceTmt ?? 0} TMT
                {item.endsAt
                  ? ` · ${t("sellerCabinet.ads.untilDate", { date: new Date(item.endsAt).toLocaleDateString(LOCALE_BCP47[locale]) })}`
                  : ""}
              </p>
            </div>
            <span
              className={`shrink-0 text-xs font-medium ${live ? "text-emerald-600" : "text-slate-400"}`}
            >
              {live ? t("sellerCabinet.ads.adActive") : t("sellerCabinet.ads.adEnded")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
