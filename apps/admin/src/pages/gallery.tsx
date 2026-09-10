import { useEffect, useState } from "react";
import type { AdminGalleryCategoryInput, AdminGalleryProductInput, GalleryCategoryDto, GalleryProductDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ImageUploadField } from "@/components/ui/image-upload-field";

const NEW_PRODUCT_ID = "__new__";

const emptyCategoryDraft: AdminGalleryCategoryInput = { name: "", slug: "", isEnabled: true };

export default function GalleryPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<GalleryCategoryDto[]>([]);
  const [products, setProducts] = useState<GalleryProductDto[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<AdminGalleryCategoryInput>(emptyCategoryDraft);

  function loadCategories() {
    return api.listAllGalleryCategories().then(setCategories).catch(() => {});
  }

  function loadProducts() {
    return api.listAllGalleryProducts().then(setProducts).catch(() => {});
  }

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, []);

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    const created = await api.createGalleryCategory(categoryDraft);
    setCategories((prev) => [...prev, created]);
    setCategoryDraft(emptyCategoryDraft);
    setShowCategoryForm(false);
  }

  async function deleteCategory(id: string) {
    if (!confirm(t("admin.gallery.deleteCategoryConfirm"))) return;
    try {
      await api.deleteGalleryCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? translateError(t, err.message) : t("admin.gallery.deleteCategoryError"));
    }
  }

  async function handleCreateProduct(input: AdminGalleryProductInput) {
    const created = await api.createGalleryProduct(input);
    setProducts((prev) => [...prev, created]);
    setSelectedProductId(created.id);
  }

  async function handleUpdateProduct(id: string, input: AdminGalleryProductInput) {
    const updated = await api.updateGalleryProduct(id, input);
    setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }

  async function handleDeleteProduct(id: string) {
    if (!confirm(t("admin.gallery.deleteProductConfirm"))) return;
    await api.deleteGalleryProduct(id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setSelectedProductId(null);
  }

  const emptyProductDraft: AdminGalleryProductInput = {
    categoryId: categories[0]?.id ?? "",
    sku: "",
    name: "",
    description: "",
    imageUrl: "",
    priceTmt: 0,
    isEnabled: true,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.gallery.title")}</h1>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-slate-500">{t("admin.gallery.categoriesHeading")}</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowCategoryForm((v) => !v)}>
            {showCategoryForm ? t("common.cancel") : t("admin.gallery.addCategory")}
          </Button>
        </div>

        {showCategoryForm && (
          <form onSubmit={createCategory} className="mb-3 grid grid-cols-3 gap-2">
            <Input
              value={categoryDraft.name}
              onChange={(e) => setCategoryDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t("admin.gallery.name")}
              required
            />
            <Input
              value={categoryDraft.slug}
              onChange={(e) => setCategoryDraft((d) => ({ ...d, slug: e.target.value }))}
              placeholder={t("admin.gallery.slugPlaceholder")}
              required
            />
            <Button type="submit" size="sm">
              {t("admin.gallery.create")}
            </Button>
          </form>
        )}

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm"
            >
              {cat.name}
              <button
                onClick={() => deleteCategory(cat.id)}
                className="cursor-pointer text-slate-400 hover:text-rose-600"
                aria-label={t("admin.gallery.deleteCategoryAria", { name: cat.name })}
              >
                ×
              </button>
            </span>
          ))}
          {categories.length === 0 && <p className="text-sm text-slate-400">{t("admin.gallery.noCategories")}</p>}
        </div>
      </Card>

      <div className="grid grid-cols-[280px_1fr] gap-6">
        <Card className="p-2">
          <Button
            variant="secondary"
            size="sm"
            className="mb-2 w-full"
            onClick={() => setSelectedProductId(NEW_PRODUCT_ID)}
          >
            {t("admin.gallery.newProduct")}
          </Button>
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => setSelectedProductId(product.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                selectedProductId === product.id ? "bg-gradient-brand-soft text-brand-700" : "hover:bg-slate-50"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">
                {product.name}
                {product.seller && (
                  <span className="ml-1.5 text-xs text-slate-400">@{product.seller.handle}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{product.priceTmt} TMT</span>
            </button>
          ))}
          {products.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-400">{t("admin.gallery.noProducts")}</p>}
        </Card>

        <div>
          {selectedProductId === NEW_PRODUCT_ID && (
            <ProductForm
              key="new"
              initial={emptyProductDraft}
              categories={categories}
              onSubmit={handleCreateProduct}
              submitLabel={t("admin.gallery.createProductSubmit")}
            />
          )}
          {selectedProduct && (
            <ProductForm
              key={selectedProduct.id}
              initial={{
                categoryId: selectedProduct.categoryId,
                sku: selectedProduct.sku,
                name: selectedProduct.name,
                description: selectedProduct.description ?? "",
                imageUrl: selectedProduct.imageUrl,
                priceTmt: selectedProduct.priceTmt,
                isEnabled: selectedProduct.isEnabled,
                sortOrder: selectedProduct.sortOrder,
              }}
              categories={categories}
              onSubmit={(input) => handleUpdateProduct(selectedProduct.id, input)}
              onDelete={() => handleDeleteProduct(selectedProduct.id)}
              submitLabel={t("admin.gallery.saveProductSubmit")}
            />
          )}
          {!selectedProductId && (
            <Card className="p-8 text-center text-sm text-slate-500">{t("admin.gallery.selectProductPrompt")}</Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductForm({
  initial,
  categories,
  onSubmit,
  onDelete,
  submitLabel,
}: {
  initial: AdminGalleryProductInput;
  categories: GalleryCategoryDto[];
  onSubmit: (input: AdminGalleryProductInput) => Promise<void>;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AdminGalleryProductInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AdminGalleryProductInput>(key: K, value: AdminGalleryProductInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.gallery.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.gallery.name")}</label>
            <Input value={draft.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.gallery.skuLabel")}</label>
            <Input value={draft.sku} onChange={(e) => set("sku", e.target.value)} placeholder="FLW-001" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.gallery.categoryLabel")}</label>
            <Select value={draft.categoryId} onChange={(e) => set("categoryId", e.target.value)} required>
              <option value="" disabled>
                {t("admin.gallery.selectCategoryOption")}
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
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.gallery.descriptionLabel")}</label>
          <Input value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </div>

        <ImageUploadField
          label={t("admin.gallery.imageUrlLabel")}
          value={draft.imageUrl}
          onChange={(url) => set("imageUrl", url)}
          uploadLabel={t("common.uploadImageButton")}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.gallery.priceLabel")}</label>
            <Input
              type="number"
              value={draft.priceTmt}
              onChange={(e) => set("priceTmt", Number(e.target.value))}
              required
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isEnabled ?? true}
                onChange={(e) => set("isEnabled", e.target.checked)}
              />
              {t("admin.gallery.availableLabel")}
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("common.saving") : submitLabel}
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" size="sm" onClick={onDelete}>
              {t("admin.gallery.deleteProductSubmit")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
