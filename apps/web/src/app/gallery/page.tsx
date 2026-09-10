"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { GalleryCategoryDto, GalleryProductDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GalleryOrderModal } from "@/components/gallery-order-modal";

export default function GalleryPage() {
  return (
    <Suspense fallback={null}>
      <GalleryPageInner />
    </Suspense>
  );
}

function GalleryPageInner() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<GalleryCategoryDto[]>([]);
  const [products, setProducts] = useState<GalleryProductDto[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [orderingProduct, setOrderingProduct] = useState<GalleryProductDto | null>(null);

  useEffect(() => {
    api.listGalleryCategories().then(setCategories).catch(() => {});
    api.listGalleryProducts().then(setProducts).catch(() => {});
  }, []);

  const query = search.trim().toLowerCase();
  const visibleProducts = products.filter((p) => {
    if (activeCategory && p.categoryId !== activeCategory) return false;
    if (query && !p.name.toLowerCase().includes(query) && !p.sku.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("web.gallery.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("web.gallery.subtitle")}</p>
      </div>

      <div className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("web.gallery.searchPlaceholder")}
          className="max-w-sm"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium ${
            activeCategory === null
              ? "bg-gradient-brand text-white"
              : "bg-white/60 text-slate-600 backdrop-blur hover:bg-white/90 dark:bg-white/5 dark:text-slate-300"
          }`}
        >
          {t("web.gallery.allCategory")}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium ${
              activeCategory === cat.id
                ? "bg-gradient-brand text-white"
                : "bg-white/60 text-slate-600 backdrop-blur hover:bg-white/90 dark:bg-white/5 dark:text-slate-300"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visibleProducts.map((product) => (
          <Card key={product.id} className="flex flex-col overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} className="aspect-square w-full object-cover" />
            <div className="flex flex-1 flex-col p-3">
              <p className="text-sm font-semibold leading-snug">{product.name}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{t("web.gallery.sku", { sku: product.sku })}</p>
              {product.description && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{product.description}</p>
              )}
              {product.seller && (
                <Link
                  href={`/@${product.seller.handle}`}
                  className="mt-1 w-fit text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  @{product.seller.handle}
                </Link>
              )}
              <div className="mt-auto flex items-center justify-between pt-3">
                <span className="text-sm font-bold">{product.priceTmt} TMT</span>
                <button
                  onClick={() => setOrderingProduct(product)}
                  className="bg-gradient-brand cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                >
                  {t("web.gallery.orderButton")}
                </button>
              </div>
            </div>
          </Card>
        ))}
        {visibleProducts.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-slate-400">{t("web.gallery.empty")}</p>
        )}
      </div>

      {orderingProduct && <GalleryOrderModal product={orderingProduct} onClose={() => setOrderingProduct(null)} />}
    </div>
  );
}
