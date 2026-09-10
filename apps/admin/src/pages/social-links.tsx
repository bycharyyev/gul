import { useEffect, useState } from "react";
import type { AdminSocialLinkInput, SocialLinkDto, SocialPlatform } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

function usePlatformLabels(): Record<SocialPlatform, string> {
  const { t } = useTranslation();
  return {
    INSTAGRAM: t("admin.socialLinks.platform.INSTAGRAM"),
    TELEGRAM: t("admin.socialLinks.platform.TELEGRAM"),
    FACEBOOK: t("admin.socialLinks.platform.FACEBOOK"),
    TIKTOK: t("admin.socialLinks.platform.TIKTOK"),
    YOUTUBE: t("admin.socialLinks.platform.YOUTUBE"),
    WHATSAPP: t("admin.socialLinks.platform.WHATSAPP"),
    X: t("admin.socialLinks.platform.X"),
    VK: t("admin.socialLinks.platform.VK"),
    OTHER: t("admin.socialLinks.platform.OTHER"),
  };
}

const emptyDraft: AdminSocialLinkInput = {
  platform: "INSTAGRAM",
  url: "",
  label: "",
  isEnabled: true,
  sortOrder: 0,
};

export default function SocialLinksPage() {
  const { t } = useTranslation();
  const PLATFORM_LABELS = usePlatformLabels();
  const [links, setLinks] = useState<SocialLinkDto[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<AdminSocialLinkInput>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.listAllSocialLinks().then(setLinks).catch(() => {});
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSocialLink({ ...draft, sortOrder: links.length });
      setLinks((prev) => [...prev, created]);
      setDraft(emptyDraft);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.socialLinks.createError"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(link: SocialLinkDto) {
    const updated = await api.updateSocialLink(link.id, { isEnabled: !link.isEnabled });
    setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)));
  }

  async function remove(id: string) {
    if (!confirm(t("admin.socialLinks.deleteConfirm"))) return;
    await api.deleteSocialLink(id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.socialLinks.title")}</h1>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? t("common.cancel") : t("admin.socialLinks.addLink")}
        </Button>
      </div>
      <p className="text-sm text-slate-500">
        {t("admin.socialLinks.footerHint")}
      </p>

      {showCreate && (
        <Card className="p-5">
          <form onSubmit={create} className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.socialLinks.platformLabel")}</label>
              <Select
                value={draft.platform}
                onChange={(e) => setDraft((d) => ({ ...d, platform: e.target.value as SocialPlatform }))}
              >
                {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.socialLinks.urlLabel")}</label>
              <Input
                value={draft.url}
                onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                placeholder={t("admin.socialLinks.urlPlaceholder")}
                required
              />
            </div>
            {draft.platform === "OTHER" && (
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.socialLinks.nameLabel")}</label>
                <Input value={draft.label ?? ""} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
              </div>
            )}
            {error && <p className="col-span-2 text-sm text-rose-600">{error}</p>}
            <Button className="col-span-2" type="submit" disabled={busy}>
              {busy ? t("admin.socialLinks.adding") : t("admin.socialLinks.addSubmit")}
            </Button>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.socialLinks.colPlatform")}</th>
              <th className="px-4 py-3">{t("admin.socialLinks.colUrl")}</th>
              <th className="px-4 py-3">{t("admin.socialLinks.colStatus")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {links.map((link) => (
              <tr key={link.id}>
                <td className="px-4 py-3 font-medium">{link.label || PLATFORM_LABELS[link.platform]}</td>
                <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-500">{link.url}</td>
                <td className="px-4 py-3">
                  {link.isEnabled ? (
                    <span className="text-xs font-medium text-emerald-600">{t("admin.socialLinks.enabled")}</span>
                  ) : (
                    <span className="text-xs font-medium text-rose-600">{t("admin.socialLinks.disabled")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => toggleEnabled(link)}>
                      {link.isEnabled ? t("admin.socialLinks.disable") : t("admin.socialLinks.enable")}
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
            ))}
            {links.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.socialLinks.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
