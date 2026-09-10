import { useEffect, useState } from "react";
import type {
  AdminStoryInput,
  GalleryProductDto,
  SellerAdminDto,
  ServiceDto,
  StoryDetailDto,
  StoryLinkType,
} from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ImageUploadField } from "@/components/ui/image-upload-field";

const NEW_STORY_ID = "__new__";

function useLinkTypeLabels(): Record<StoryLinkType, string> {
  const { t } = useTranslation();
  return {
    INTERNAL_SERVICE: t("admin.stories.linkType.INTERNAL_SERVICE"),
    EXTERNAL_URL: t("admin.stories.linkType.EXTERNAL_URL"),
    PARTNER_AD: t("admin.stories.linkType.PARTNER_AD"),
    GALLERY_PRODUCT: t("admin.stories.linkType.GALLERY_PRODUCT"),
    SELLER_SHOP: t("admin.stories.linkType.SELLER_SHOP"),
  };
}

const emptyDraft: AdminStoryInput = {
  title: "",
  subtitle: "",
  imageUrl: "",
  badgeLabel: "",
  ctaLabel: "Подробнее",
  linkType: "INTERNAL_SERVICE",
  serviceId: "",
  externalUrl: "",
  galleryProductId: "",
  sellerId: "",
  sponsorLabel: "",
  isActive: true,
  sortOrder: 0,
};

function toDraft(story: StoryDetailDto): AdminStoryInput {
  return {
    title: story.title,
    subtitle: story.subtitle ?? "",
    imageUrl: story.imageUrl,
    badgeLabel: story.badgeLabel ?? "",
    ctaLabel: story.ctaLabel ?? "",
    linkType: story.linkType,
    serviceId: story.serviceId ?? "",
    externalUrl: story.externalUrl ?? "",
    galleryProductId: story.galleryProductId ?? "",
    sellerId: story.sellerId ?? "",
    sponsorLabel: story.sponsorLabel ?? "",
    isActive: story.isActive,
    sortOrder: story.sortOrder,
    startsAt: story.startsAt ?? undefined,
    endsAt: story.endsAt ?? undefined,
  };
}

export default function StoriesPage() {
  const { t } = useTranslation();
  const [stories, setStories] = useState<StoryDetailDto[]>([]);
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [galleryProducts, setGalleryProducts] = useState<GalleryProductDto[]>([]);
  const [sellers, setSellers] = useState<SellerAdminDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function loadStories() {
    return api
      .listAllStories()
      .then(setStories)
      .catch(() => {
        // onSessionExpired already redirects to /login on 401
      });
  }

  useEffect(() => {
    loadStories();
    api.listAllServices().then(setServices).catch(() => {});
    api.listAllGalleryProducts().then(setGalleryProducts).catch(() => {});
    api.listSellers().then(setSellers).catch(() => {});
  }, []);

  const selectedStory = stories.find((s) => s.id === selectedId) ?? null;

  async function handleCreate(input: AdminStoryInput) {
    const created = await api.createStory({ ...input, sortOrder: stories.length });
    setStories((prev) => [...prev, created]);
    setSelectedId(created.id);
  }

  async function handleUpdate(id: string, input: AdminStoryInput) {
    const updated = await api.updateStory(id, input);
    setStories((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleDelete(id: string) {
    if (!confirm(t("admin.stories.deleteConfirm"))) return;
    await api.deleteStory(id);
    setStories((prev) => prev.filter((s) => s.id !== id));
    setSelectedId(null);
  }

  async function move(id: string, direction: -1 | 1) {
    const sorted = [...stories].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = sorted.findIndex((s) => s.id === id);
    const swapWith = sorted[index + direction];
    const current = sorted[index];
    if (!swapWith || !current) return;
    const [updatedCurrent, updatedSwap] = await Promise.all([
      api.updateStory(current.id, { sortOrder: swapWith.sortOrder }),
      api.updateStory(swapWith.id, { sortOrder: current.sortOrder }),
    ]);
    setStories((prev) =>
      prev.map((s) => (s.id === updatedCurrent.id ? updatedCurrent : s.id === updatedSwap.id ? updatedSwap : s)),
    );
  }

  const sortedStories = [...stories].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6">
      <Card className="p-2">
        <Button
          variant="secondary"
          size="sm"
          className="mb-2 w-full"
          onClick={() => setSelectedId(NEW_STORY_ID)}
        >
          {t("admin.stories.newStory")}
        </Button>
        {sortedStories.map((story, i) => (
          <div
            key={story.id}
            className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
              selectedId === story.id ? "bg-gradient-brand-soft text-brand-700" : "hover:bg-slate-50"
            }`}
          >
            <button
              onClick={() => setSelectedId(story.id)}
              className="flex flex-1 items-center justify-between gap-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{story.title || t("admin.stories.untitled")}</span>
                {story.seller && (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    @{story.seller.handle}
                  </span>
                )}
              </span>
              {!story.isActive && <span className="shrink-0 text-xs text-slate-400">{t("admin.stories.off")}</span>}
            </button>
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(story.id, -1)}
                className="px-1 text-xs text-slate-400 hover:text-brand-600 disabled:opacity-30"
                aria-label={t("admin.stories.moveUp")}
              >
                ▲
              </button>
              <button
                type="button"
                disabled={i === sortedStories.length - 1}
                onClick={() => move(story.id, 1)}
                className="px-1 text-xs text-slate-400 hover:text-brand-600 disabled:opacity-30"
                aria-label={t("admin.stories.moveDown")}
              >
                ▼
              </button>
            </div>
          </div>
        ))}
        {sortedStories.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-slate-400">{t("admin.stories.empty")}</p>
        )}
      </Card>

      <div className="space-y-6">
        {selectedId === NEW_STORY_ID && (
          <StoryForm
            key="new"
            initial={emptyDraft}
            services={services}
            galleryProducts={galleryProducts}
            sellers={sellers}
            onSubmit={handleCreate}
            submitLabel={t("admin.stories.createSubmit")}
          />
        )}

        {selectedStory && (
          <StoryForm
            key={selectedStory.id}
            initial={toDraft(selectedStory)}
            services={services}
            galleryProducts={galleryProducts}
            sellers={sellers}
            onSubmit={(input) => handleUpdate(selectedStory.id, input)}
            onDelete={() => handleDelete(selectedStory.id)}
            submitLabel={t("admin.stories.saveSubmit")}
          />
        )}

        {!selectedId && (
          <Card className="p-8 text-center text-sm text-slate-500">
            {t("admin.stories.emptyStateHint")}
          </Card>
        )}
      </div>
    </div>
  );
}

function StoryForm({
  initial,
  services,
  galleryProducts,
  sellers,
  onSubmit,
  onDelete,
  submitLabel,
}: {
  initial: AdminStoryInput;
  services: ServiceDto[];
  galleryProducts: GalleryProductDto[];
  sellers: SellerAdminDto[];
  onSubmit: (input: AdminStoryInput) => Promise<void>;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const LINK_TYPE_LABELS = useLinkTypeLabels();
  const [draft, setDraft] = useState<AdminStoryInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AdminStoryInput>(key: K, value: AdminStoryInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.stories.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.titleLabel")}</label>
            <Input value={draft.title} onChange={(e) => set("title", e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.badgeLabel")}</label>
            <Input
              value={draft.badgeLabel ?? ""}
              onChange={(e) => set("badgeLabel", e.target.value)}
              placeholder={t("admin.stories.badgePlaceholder")}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.subtitleLabel")}</label>
          <Input value={draft.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
        </div>

        <ImageUploadField
          label={t("admin.stories.imageLabel")}
          value={draft.imageUrl}
          onChange={(url) => set("imageUrl", url)}
          uploadLabel={t("common.uploadImageButton")}
          required
        />

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.linkTypeLabel")}</label>
          <Select
            value={draft.linkType}
            onChange={(e) => set("linkType", e.target.value as StoryLinkType)}
          >
            {Object.entries(LINK_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {draft.linkType === "INTERNAL_SERVICE" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.serviceLabel")}</label>
            <Select value={draft.serviceId ?? ""} onChange={(e) => set("serviceId", e.target.value)} required>
              <option value="" disabled>
                {t("admin.stories.chooseService")}
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {draft.linkType === "GALLERY_PRODUCT" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.galleryProductLabel")}</label>
            <Select
              value={draft.galleryProductId ?? ""}
              onChange={(e) => set("galleryProductId", e.target.value)}
              required
            >
              <option value="" disabled>
                {t("admin.stories.chooseProduct")}
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
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.sellerShopLabel")}</label>
            <Select value={draft.sellerId ?? ""} onChange={(e) => set("sellerId", e.target.value)} required>
              <option value="" disabled>
                {t("admin.stories.chooseSeller")}
              </option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  @{s.handle} — {s.shopName}
                </option>
              ))}
            </Select>
          </div>
        )}

        {(draft.linkType === "EXTERNAL_URL" || draft.linkType === "PARTNER_AD") && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.externalUrlLabel")}</label>
              <Input
                value={draft.externalUrl ?? ""}
                onChange={(e) => set("externalUrl", e.target.value)}
                placeholder="https://…"
                required
              />
            </div>
            {draft.linkType === "PARTNER_AD" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.sponsorLabel")}</label>
                <Input
                  value={draft.sponsorLabel ?? ""}
                  onChange={(e) => set("sponsorLabel", e.target.value)}
                  placeholder={t("admin.stories.sponsorPlaceholder")}
                />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.ctaLabelLabel")}</label>
            <Input value={draft.ctaLabel ?? ""} onChange={(e) => set("ctaLabel", e.target.value)} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive ?? true}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              {t("admin.stories.activeLabel")}
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.startsAtLabel")}</label>
            <Input
              type="datetime-local"
              value={draft.startsAt ? draft.startsAt.slice(0, 16) : ""}
              onChange={(e) => set("startsAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.stories.endsAtLabel")}</label>
            <Input
              type="datetime-local"
              value={draft.endsAt ? draft.endsAt.slice(0, 16) : ""}
              onChange={(e) => set("endsAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            />
          </div>
        </div>

        {draft.linkType === "PARTNER_AD" && (
          <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
            {t("admin.stories.partnerAdNotice")}
          </span>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("admin.stories.saving") : submitLabel}
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" size="sm" onClick={onDelete}>
              {t("admin.stories.deleteStory")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
