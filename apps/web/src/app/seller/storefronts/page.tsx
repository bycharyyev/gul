"use client";

import { useEffect, useState } from "react";
import type { StorefrontDto, UpsertStorefrontInput } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploadField } from "@/components/ui/image-upload-field";

/**
 * The shop's own sections.
 *
 * This is what a creator asking to run several shops actually gets. A second Seller row would
 * mean a second balance, a second payout account and a second application for staff to approve;
 * a section gives them the separate shelf they were describing without any of that.
 *
 * Nothing here asks for an address: the public link is derived from the name, because the people
 * naming these run flower shops and "slug" is a word from our side of the screen.
 */
export default function SellerStorefrontsPage() {
  const { t } = useTranslation();
  const [sections, setSections] = useState<StorefrontDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api
      .listMyStorefronts()
      .then(setSections)
      .catch(() => setError(t("sellerCabinet.storefronts.loadError")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // Loading once on mount; `t` changing is a language switch, not a reason to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const made = await api.createMyStorefront({ name: name.trim() });
      setSections((prev) => [...prev, made]);
      setName("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? translateError(t, err.message)
          : t("sellerCabinet.storefronts.saveError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggle(section: StorefrontDto) {
    const updated = await api.updateMyStorefront(section.id, { isEnabled: !section.isEnabled });
    setSections((prev) => prev.map((s) => (s.id === section.id ? updated : s)));
  }

  async function remove(section: StorefrontDto) {
    // Names what happens to the stock, not "are you sure": the products survive and move back to
    // the general list, and somebody who does not know that will not risk the click.
    const ok = window.confirm(
      t("sellerCabinet.storefronts.deleteConfirm", {
        name: section.name,
        count: String(section._count.products),
      }),
    );
    if (!ok) return;
    const { movedToGeneral } = await api.deleteMyStorefront(section.id);
    setSections((prev) => prev.filter((s) => s.id !== section.id));
    if (movedToGeneral > 0) {
      setError(t("sellerCabinet.storefronts.movedNotice", { count: String(movedToGeneral) }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">{t("sellerCabinet.storefronts.title")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("sellerCabinet.storefronts.subtitle")}
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("sellerCabinet.storefronts.nameLabel")}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("sellerCabinet.storefronts.namePlaceholder")}
              maxLength={80}
            />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            {t("sellerCabinet.storefronts.create")}
          </Button>
        </form>
      </Card>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">{t("common.loading")}</p>
      ) : sections.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {t("sellerCabinet.storefronts.empty")}
        </Card>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <Card key={section.id} className="p-4">
              {editingId === section.id ? (
                <SectionEditor
                  section={section}
                  onDone={(updated) => {
                    setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{section.name}</p>
                      {!section.isEnabled && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                          {t("sellerCabinet.storefronts.hidden")}
                        </span>
                      )}
                    </div>
                    {section.description && (
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {section.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      {t("sellerCabinet.storefronts.productCount", {
                        count: String(section._count.products),
                      })}{" "}
                      · /{section.slug}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditingId(section.id)}>
                      {t("common.edit")}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void toggle(section)}>
                      {section.isEnabled
                        ? t("sellerCabinet.storefronts.hide")
                        : t("sellerCabinet.storefronts.show")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                      onClick={() => void remove(section)}
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionEditor({
  section,
  onDone,
  onCancel,
}: {
  section: StorefrontDto;
  onDone: (updated: StorefrontDto) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<UpsertStorefrontInput>({
    name: section.name,
    description: section.description ?? "",
    coverUrl: section.coverUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onDone(await api.updateMyStorefront(section.id, draft));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? translateError(t, err.message)
          : t("sellerCabinet.storefronts.saveError"),
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          {t("sellerCabinet.storefronts.nameLabel")}
        </label>
        <Input
          value={draft.name}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          maxLength={80}
          required
        />
        {draft.name.trim() !== section.name && (
          // The address is derived from the name, so a rename moves it. Said before saving,
          // because a link already sent to somebody stops working the moment this is confirmed.
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {t("sellerCabinet.storefronts.renameWarning")}
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          {t("sellerCabinet.storefronts.descriptionLabel")}
        </label>
        <Input
          value={draft.description ?? ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
          maxLength={300}
        />
      </div>
      <ImageUploadField
        label={t("sellerCabinet.storefronts.coverLabel")}
        value={draft.coverUrl ?? ""}
        onChange={(url) => setDraft((prev) => ({ ...prev, coverUrl: url }))}
        uploadLabel={t("common.uploadImageButton")}
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
