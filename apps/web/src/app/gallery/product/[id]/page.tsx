"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { GalleryProductDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { GalleryOrderModal } from "@/components/gallery-order-modal";

/**
 * The web landing a product's own Share sheet (and a managed link pointed at a product) falls
 * back to when the app isn't installed. A real page, not a redirect: someone who followed a
 * shared product link wants to see the product, and ordering works here too -- the same
 * GalleryOrderModal the shop page uses -- so this is never a dead end for someone without the app.
 */
export default function ProductLandingPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<GalleryProductDto | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    api
      .getGalleryProduct(params.id)
      .then(setProduct)
      .catch(() => setNotFound(true));
  }, [params.id]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg font-semibold">{t("web.productPage.notFoundTitle")}</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("web.productPage.notFoundBody")}</p>
      </div>
    );
  }

  if (!product) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Card className="grid gap-6 overflow-hidden p-6 sm:grid-cols-2 sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt={product.name}
          className="aspect-square w-full rounded-xl2 object-cover"
        />
        <div className="flex flex-col">
          <h1 className="text-xl font-bold leading-snug">{product.name}</h1>
          <p className="mt-1 text-xs text-slate-400">{t("web.shopPage.sku", { sku: product.sku })}</p>
          {product.seller && (
            <a href={`/@${product.seller.handle}`} className="mt-2 text-sm text-brand-600 dark:text-brand-300">
              {product.seller.shopName}
            </a>
          )}
          {product.description && (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{product.description}</p>
          )}
          <div className="mt-auto flex items-center justify-between pt-6">
            <span className="text-xl font-bold">{product.priceTmt} TMT</span>
            <button
              onClick={() => setOrdering(true)}
              className="bg-gradient-brand cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              {t("web.shopPage.orderButton")}
            </button>
          </div>
        </div>
      </Card>

      {ordering && <GalleryOrderModal product={product} onClose={() => setOrdering(false)} />}
    </div>
  );
}
