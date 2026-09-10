"use client";

import { useEffect, useState } from "react";
import type {
  GalleryCategoryDto,
  GalleryProductDto,
  SellerGalleryProductInput,
  StorefrontDto,
} from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { Select } from "@/components/ui/select";

const NEW_PRODUCT_ID = "__new__";

export default function SellerProductsPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<GalleryCategoryDto[]>([]);
  const [products, setProducts] = useState<GalleryProductDto[]>([]);
  const [storefronts, setStorefronts] = useState<StorefrontDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load() {
    api.listMySellerProducts().then(setProducts).catch(() => {});
  }

  useEffect(() => {
    api.listGalleryCategories().then(setCategories).catch(() => {});
    // A shop with no sections still works: the field below then offers only the general list.
    api.listMyStorefronts().then(setStorefronts).catch(() => {});
    load();
  }, []);

  const selected = products.find((p) => p.id === selectedId) ?? null;

  const emptyDraft: SellerGalleryProductInput = {
    categoryId: categories[0]?.id ?? "",
    sku: "",
    name: "",
    description: "",
    imageUrl: "",
    priceTmt: 0,
    isEnabled: true,
    storefrontId: null,
  };

  async function handleCreate(input: SellerGalleryProductInput) {
    const created = await api.createMySellerProduct(input);
    setProducts((prev) => [...prev, created]);
    setSelectedId(created.id);
  }

  async function handleUpdate(id: string, input: SellerGalleryProductInput) {
    const updated = await api.updateMySellerProduct(id, input);
    setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }

  async function handleDelete(id: string) {
    if (!confirm(t("sellerCabinet.products.deleteConfirm"))) return;
    await api.deleteMySellerProduct(id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setSelectedId(null);
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-6">
      <Card className="p-2">
        <Button variant="secondary" size="sm" className="mb-2 w-full" onClick={() => setSelectedId(NEW_PRODUCT_ID)}>
          {t("sellerCabinet.products.newProduct")}
        </Button>
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => setSelectedId(product.id)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
              selectedId === product.id ? "bg-gradient-brand-soft text-brand-700" : "hover:bg-white/60 dark:hover:bg-white/5"
            }`}
          >
            <span className="truncate">{product.name}</span>
            <span className="shrink-0 text-xs text-slate-400">{product.priceTmt} TMT</span>
          </button>
        ))}
        {products.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-slate-400">{t("sellerCabinet.products.noProductsYet")}</p>
        )}
      </Card>

      <div>
        {selectedId === NEW_PRODUCT_ID && (
          <ProductForm
            key="new"
            initial={emptyDraft}
            categories={categories}
            storefronts={storefronts}
            onSubmit={handleCreate}
            submitLabel={t("sellerCabinet.products.createProduct")}
          />
        )}
        {selected && (
          <ProductForm
            key={selected.id}
            initial={{
              categoryId: selected.categoryId,
              sku: selected.sku,
              name: selected.name,
              description: selected.description ?? "",
              imageUrl: selected.imageUrl,
              priceTmt: selected.priceTmt,
              isEnabled: selected.isEnabled,
              sortOrder: selected.sortOrder,
              storefrontId: selected.storefront?.id ?? null,
            }}
            categories={categories}
            storefronts={storefronts}
            onSubmit={(input) => handleUpdate(selected.id, input)}
            onDelete={() => handleDelete(selected.id)}
            submitLabel={t("sellerCabinet.products.saveChanges")}
          />
        )}
        {!selectedId && (
          <Card className="p-8 text-center text-sm text-slate-500">{t("sellerCabinet.products.selectOrCreateHint")}</Card>
        )}
      </div>
    </div>
  );
}

function ProductForm({
  initial,
  categories,
  storefronts,
  onSubmit,
  onDelete,
  submitLabel,
}: {
  initial: SellerGalleryProductInput;
  categories: GalleryCategoryDto[];
  storefronts: StorefrontDto[];
  onSubmit: (input: SellerGalleryProductInput) => Promise<void>;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SellerGalleryProductInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SellerGalleryProductInput>(key: K, value: SellerGalleryProductInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("sellerCabinet.products.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.products.nameLabel")}</label>
            <Input value={draft.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.products.skuLabel")}</label>
            <Input value={draft.sku} onChange={(e) => set("sku", e.target.value)} placeholder="MY-001" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.products.categoryLabel")}</label>
            <Select value={draft.categoryId} onChange={(e) => set("categoryId", e.target.value)} required>
              <option value="" disabled>
                {t("sellerCabinet.products.selectCategory")}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.products.descriptionLabel")}</label>
          <Input value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </div>

        {/* Only where there are sections to choose between. A field whose one option is "no
            section" asks a question with a single answer. */}
        {storefronts.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("sellerCabinet.products.storefrontLabel")}
            </label>
            <Select
              value={draft.storefrontId ?? ""}
              onChange={(e) => set("storefrontId", e.target.value || null)}
            >
              <option value="">{t("sellerCabinet.products.noStorefront")}</option>
              {storefronts.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <ImageUploadField
          label={t("sellerCabinet.products.imageUrlLabel")}
          value={draft.imageUrl}
          onChange={(url) => set("imageUrl", url)}
          uploadLabel={t("common.uploadImageButton")}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.products.priceLabel")}</label>
            <Input type="number" value={draft.priceTmt} onChange={(e) => set("priceTmt", Number(e.target.value))} required />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.isEnabled ?? true} onChange={(e) => set("isEnabled", e.target.checked)} />
              {t("sellerCabinet.products.availableLabel")}
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("common.saving") : submitLabel}
          </Button>
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              onClick={onDelete}
            >
              {t("sellerCabinet.products.deleteProduct")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
