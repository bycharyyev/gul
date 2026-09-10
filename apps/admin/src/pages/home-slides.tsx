import { useEffect, useState } from "react";
import type {
  AdminHomeSlideInput,
  GalleryProductDto,
  HomeSlideDetailDto,
  HomeSlideLinkType,
  SellerAdminDto,
  ServiceDto,
} from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ImageUploadField } from "@/components/ui/image-upload-field";

const NEW_SLIDE_ID = "__new__";

function useLinkTypeLabels(): Record<HomeSlideLinkType, string> {
  const { t } = useTranslation();
  return {
    INTERNAL_SERVICE: t("admin.homeSlides.linkType.INTERNAL_SERVICE"),
    EXTERNAL_URL: t("admin.homeSlides.linkType.EXTERNAL_URL"),
    GALLERY_PRODUCT: t("admin.homeSlides.linkType.GALLERY_PRODUCT"),
    SELLER_SHOP: t("admin.homeSlides.linkType.SELLER_SHOP"),
    NONE: t("admin.homeSlides.linkType.NONE"),
  };
}

const emptyDraft: AdminHomeSlideInput = {
  title: "",
  subtitle: "",
  imageUrl: "",
  ctaLabel: "Подробнее",
  linkType: "NONE",
  serviceId: "",
  externalUrl: "",
  galleryProductId: "",
  sellerId: "",
  sponsorLabel: "",
  isActive: true,
  sortOrder: 0,
};

function toDraft(slide: HomeSlideDetailDto): AdminHomeSlideInput {
  return {
    title: slide.title,
    subtitle: slide.subtitle ?? "",
    imageUrl: slide.imageUrl,
    ctaLabel: slide.ctaLabel ?? "",
    linkType: slide.linkType,
    serviceId: slide.serviceId ?? "",
    externalUrl: slide.externalUrl ?? "",
    galleryProductId: slide.galleryProductId ?? "",
    sellerId: slide.sellerId ?? "",
    sponsorLabel: slide.sponsorLabel ?? "",
    isActive: slide.isActive,
    sortOrder: slide.sortOrder,
    startsAt: slide.startsAt ?? undefined,
    endsAt: slide.endsAt ?? undefined,
  };
}

export default function HomeSlidesPage() {
  const { t } = useTranslation();
  const [slides, setSlides] = useState<HomeSlideDetailDto[]>([]);
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [galleryProducts, setGalleryProducts] = useState<GalleryProductDto[]>([]);
  const [sellers, setSellers] = useState<SellerAdminDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function loadSlides() {
    return api
      .listAllHomeSlides()
      .then(setSlides)
      .catch(() => {});
  }

  useEffect(() => {
    loadSlides();
    api.listAllServices().then(setServices).catch(() => {});
    api.listAllGalleryProducts().then(setGalleryProducts).catch(() => {});
    api.listSellers().then(setSellers).catch(() => {});
  }, []);

  const selectedSlide = slides.find((s) => s.id === selectedId) ?? null;

  async function handleCreate(input: AdminHomeSlideInput) {
    const created = await api.createHomeSlide({ ...input, sortOrder: slides.length });
    setSlides((prev) => [...prev, created]);
    setSelectedId(created.id);
  }

  async function handleUpdate(id: string, input: AdminHomeSlideInput) {
    const updated = await api.updateHomeSlide(id, input);
    setSlides((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleDelete(id: string) {
    if (!confirm(t("admin.homeSlides.deleteConfirm"))) return;
    await api.deleteHomeSlide(id);
    setSlides((prev) => prev.filter((s) => s.id !== id));
    setSelectedId(null);
  }

  async function move(id: string, direction: -1 | 1) {
    const sorted = [...slides].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = sorted.findIndex((s) => s.id === id);
    const swapWith = sorted[index + direction];
    const current = sorted[index];
    if (!swapWith || !current) return;
    const [updatedCurrent, updatedSwap] = await Promise.all([
      api.updateHomeSlide(current.id, { sortOrder: swapWith.sortOrder }),
      api.updateHomeSlide(swapWith.id, { sortOrder: current.sortOrder }),
    ]);
    setSlides((prev) =>
      prev.map((s) => (s.id === updatedCurrent.id ? updatedCurrent : s.id === updatedSwap.id ? updatedSwap : s)),
    );
  }

  const sortedSlides = [...slides].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6">
      <Card className="p-2">
        <Button variant="secondary" size="sm" className="mb-2 w-full" onClick={() => setSelectedId(NEW_SLIDE_ID)}>
          {t("admin.homeSlides.newSlide")}
        </Button>
        {sortedSlides.map((slide, i) => (
          <div
            key={slide.id}
            className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
              selectedId === slide.id ? "bg-gradient-brand-soft text-brand-700" : "hover:bg-slate-50"
            }`}
          >
            <button
              onClick={() => setSelectedId(slide.id)}
              className="flex flex-1 items-center justify-between gap-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{slide.title || t("admin.homeSlides.untitled")}</span>
                {slide.seller && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    @{slide.seller.handle}
                  </span>
                )}
              </span>
              {!slide.isActive && <span className="shrink-0 text-xs text-slate-400">{t("admin.homeSlides.off")}</span>}
            </button>
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(slide.id, -1)}
                className="px-1 text-xs text-slate-400 hover:text-brand-600 disabled:opacity-30"
                aria-label={t("admin.homeSlides.moveUp")}
              >
                ▲
              </button>
              <button
                type="button"
                disabled={i === sortedSlides.length - 1}
                onClick={() => move(slide.id, 1)}
                className="px-1 text-xs text-slate-400 hover:text-brand-600 disabled:opacity-30"
                aria-label={t("admin.homeSlides.moveDown")}
              >
                ▼
              </button>
            </div>
          </div>
        ))}
        {sortedSlides.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-slate-400">{t("admin.homeSlides.empty")}</p>
        )}
      </Card>

      <div className="space-y-6">
        {selectedId === NEW_SLIDE_ID && (
          <SlideForm
            key="new"
            initial={emptyDraft}
            services={services}
            galleryProducts={galleryProducts}
            sellers={sellers}
            onSubmit={handleCreate}
            submitLabel={t("admin.homeSlides.createSubmit")}
          />
        )}

        {selectedSlide && (
          <SlideForm
            key={selectedSlide.id}
            initial={toDraft(selectedSlide)}
            services={services}
            galleryProducts={galleryProducts}
            sellers={sellers}
            onSubmit={(input) => handleUpdate(selectedSlide.id, input)}
            onDelete={() => handleDelete(selectedSlide.id)}
            submitLabel={t("admin.homeSlides.saveSubmit")}
          />
        )}

        {!selectedId && (
          <Card className="p-8 text-center text-sm text-slate-500">
            {t("admin.homeSlides.emptyStateHint")}
          </Card>
        )}
      </div>
    </div>
  );
}

function SlideForm({
  initial,
  services,
  galleryProducts,
  sellers,
  onSubmit,
  onDelete,
  submitLabel,
}: {
  initial: AdminHomeSlideInput;
  services: ServiceDto[];
  galleryProducts: GalleryProductDto[];
  sellers: SellerAdminDto[];
  onSubmit: (input: AdminHomeSlideInput) => Promise<void>;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const LINK_TYPE_LABELS = useLinkTypeLabels();
  const [draft, setDraft] = useState<AdminHomeSlideInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AdminHomeSlideInput>(key: K, value: AdminHomeSlideInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.homeSlides.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.titleLabel")}</label>
          <Input value={draft.title} onChange={(e) => set("title", e.target.value)} required />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.subtitleLabel")}</label>
          <Input value={draft.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
        </div>

        <ImageUploadField
          label={t("admin.homeSlides.imageLabel")}
          value={draft.imageUrl}
          onChange={(url) => set("imageUrl", url)}
          uploadLabel={t("common.uploadImageButton")}
          placeholder={t("admin.homeSlides.imagePlaceholder")}
          required
        />

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.linkTypeLabel")}</label>
          <Select value={draft.linkType} onChange={(e) => set("linkType", e.target.value as HomeSlideLinkType)}>
            {Object.entries(LINK_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {draft.linkType === "INTERNAL_SERVICE" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.serviceLabel")}</label>
            <Select value={draft.serviceId ?? ""} onChange={(e) => set("serviceId", e.target.value)} required>
              <option value="" disabled>
                {t("admin.homeSlides.chooseService")}
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {draft.linkType === "EXTERNAL_URL" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.externalUrlLabel")}</label>
            <Input
              value={draft.externalUrl ?? ""}
              onChange={(e) => set("externalUrl", e.target.value)}
              placeholder={t("admin.homeSlides.imagePlaceholder")}
              required
            />
          </div>
        )}

        {draft.linkType === "GALLERY_PRODUCT" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.galleryProductLabel")}</label>
            <Select
              value={draft.galleryProductId ?? ""}
              onChange={(e) => set("galleryProductId", e.target.value)}
              required
            >
              <option value="" disabled>
                {t("admin.homeSlides.chooseProduct")}
              </option>
              {galleryProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {draft.linkType === "SELLER_SHOP" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.sellerShopLabel")}</label>
            <Select value={draft.sellerId ?? ""} onChange={(e) => set("sellerId", e.target.value)} required>
              <option value="" disabled>
                {t("admin.homeSlides.chooseSeller")}
              </option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  @{s.handle} — {s.shopName}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.ctaLabelLabel")}</label>
            <Input value={draft.ctaLabel ?? ""} onChange={(e) => set("ctaLabel", e.target.value)} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.isActive ?? true} onChange={(e) => set("isActive", e.target.checked)} />
              {t("admin.homeSlides.activeLabel")}
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.startsAtLabel")}</label>
            <Input
              type="datetime-local"
              value={draft.startsAt ? draft.startsAt.slice(0, 16) : ""}
              onChange={(e) => set("startsAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.homeSlides.endsAtLabel")}</label>
            <Input
              type="datetime-local"
              value={draft.endsAt ? draft.endsAt.slice(0, 16) : ""}
              onChange={(e) => set("endsAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("admin.homeSlides.saving") : submitLabel}
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" size="sm" onClick={onDelete}>
              {t("admin.homeSlides.deleteSlide")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
