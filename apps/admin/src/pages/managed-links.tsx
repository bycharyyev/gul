import { useEffect, useState } from "react";
import type { AdminManagedLinkInput, ManagedLinkDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/// Everywhere the site itself already builds these -- referral, group-invite. Kept in one
/// place so this page and AppConfig on mobile never disagree about the shape of the URL.
const SITE_BASE_URL = "https://gulyaly.pro";

const emptyDraft: AdminManagedLinkInput = {
  slug: "",
  targetUrl: "",
  label: "",
  isEnabled: true,
};

export default function ManagedLinksPage() {
  const { t } = useTranslation();
  const [links, setLinks] = useState<ManagedLinkDto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<AdminManagedLinkInput>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.listAllManagedLinks().then(setLinks).catch(() => {});
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createManagedLink(draft);
      setLinks((prev) => [created, ...prev]);
      setDraft(emptyDraft);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.managedLinks.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(link: ManagedLinkDto) {
    const updated = await api.updateManagedLink(link.id, { isEnabled: !link.isEnabled });
    setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)));
  }

  async function remove(id: string) {
    if (!confirm(t("admin.managedLinks.deleteConfirm"))) return;
    await api.deleteManagedLink(id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  function copy(slug: string) {
    navigator.clipboard.writeText(`${SITE_BASE_URL}/l/${slug}`);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.managedLinks.title")}</h1>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? t("common.cancel") : t("admin.managedLinks.addLink")}
        </Button>
      </div>
      <p className="text-sm text-slate-500">{t("admin.managedLinks.hint")}</p>

      {showCreate && (
        <Card className="p-5">
          <form onSubmit={create} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.managedLinks.slugLabel")}</label>
                <Input
                  value={draft.slug}
                  onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.toLowerCase() }))}
                  placeholder="leto2026"
                  pattern="[a-z0-9-]+"
                  required
                />
                <p className="mt-1 text-xs text-slate-400">{SITE_BASE_URL}/l/{draft.slug || "..."}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.managedLinks.labelLabel")}</label>
                <Input
                  value={draft.label ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  placeholder={t("admin.managedLinks.labelPlaceholder")}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.managedLinks.targetLabel")}</label>
              <Input
                value={draft.targetUrl}
                onChange={(e) => setDraft((d) => ({ ...d, targetUrl: e.target.value }))}
                placeholder="https://gulyaly.pro/gallery/product/..."
                required
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("admin.managedLinks.addSubmit")}
            </Button>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.managedLinks.colLink")}</th>
              <th className="px-4 py-3">{t("admin.managedLinks.colTarget")}</th>
              <th className="px-4 py-3">{t("admin.managedLinks.colClicks")}</th>
              <th className="px-4 py-3">{t("admin.managedLinks.colStatus")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {links.map((link) =>
              editingId === link.id ? (
                <LinkEditRow
                  key={link.id}
                  link={link}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => {
                    setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
                    setEditingId(null);
                  }}
                />
              ) : (
                <tr key={link.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{link.label || link.slug}</div>
                    <button
                      onClick={() => copy(link.slug)}
                      className="cursor-pointer text-xs text-slate-400 hover:text-brand-600"
                      title={t("admin.managedLinks.copyLink")}
                    >
                      {SITE_BASE_URL}/l/{link.slug}
                    </button>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500">{link.targetUrl}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{link.clickCount}</td>
                  <td className="px-4 py-3">
                    {link.isEnabled ? (
                      <span className="text-xs font-medium text-emerald-600">{t("admin.managedLinks.enabled")}</span>
                    ) : (
                      <span className="text-xs font-medium text-rose-600">{t("admin.managedLinks.disabled")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditingId(link.id)}>
                        {t("common.edit")}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => toggleEnabled(link)}>
                        {link.isEnabled ? t("admin.managedLinks.disable") : t("admin.managedLinks.enable")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        onClick={() => remove(link.id)}
                      >
                        {t("common.delete")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {links.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.managedLinks.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/// Repointing an existing link is the whole feature -- the slug that's already on a poster or in
/// a Telegram post stays put, only where it leads changes.
function LinkEditRow({
  link,
  onSaved,
  onCancel,
}: {
  link: ManagedLinkDto;
  onSaved: (updated: ManagedLinkDto) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [targetUrl, setTargetUrl] = useState(link.targetUrl);
  const [label, setLabel] = useState(link.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateManagedLink(link.id, { targetUrl, label });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.managedLinks.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td colSpan={5} className="bg-slate-50 px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.managedLinks.labelLabel")}</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.managedLinks.targetLabel")}</label>
            <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? t("common.saving") : t("common.save")}
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </td>
    </tr>
  );
}
