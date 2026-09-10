import { useEffect, useState } from "react";
import type { AdminContentPageInput, ContentPageDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const NEW_PAGE_ID = "__new__";

/// The slug the mobile app fetches for its welcome screen. Kept next to the editor because the
/// editor is the only place a person can break it.
const WELCOME_SLUG = "welcome";

const emptyDraft: AdminContentPageInput = { slug: "", title: "", body: "" };

export default function ContentPagesPage() {
  const { t } = useTranslation();
  const [pages, setPages] = useState<ContentPageDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function loadPages() {
    return api
      .listAllContentPages()
      .then(setPages)
      .catch(() => {
        // onSessionExpired already redirects to /login on 401
      });
  }

  useEffect(() => {
    loadPages();
  }, []);

  const selectedPage = pages.find((p) => p.id === selectedId) ?? null;

  async function handleCreate(input: AdminContentPageInput) {
    const created = await api.createContentPage(input);
    setPages((prev) => [...prev, created]);
    setSelectedId(created.id);
  }

  async function handleUpdate(id: string, input: AdminContentPageInput) {
    const updated = await api.updateContentPage(id, input);
    setPages((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }

  async function handleDelete(id: string) {
    if (!confirm(t("admin.contentPages.deleteConfirm"))) return;
    await api.deleteContentPage(id);
    setPages((prev) => prev.filter((p) => p.id !== id));
    setSelectedId(null);
  }

  return (
    <div className="grid grid-cols-[240px_1fr] gap-6">
      <Card className="p-2">
        <Button
          variant="secondary"
          size="sm"
          className="mb-2 w-full"
          onClick={() => setSelectedId(NEW_PAGE_ID)}
        >
          {t("admin.contentPages.newPage")}
        </Button>
        {pages.map((page) => (
          <button
            key={page.id}
            onClick={() => setSelectedId(page.id)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
              selectedId === page.id ? "bg-gradient-brand-soft text-brand-700" : "hover:bg-slate-50"
            }`}
          >
            <span className="truncate">{page.title}</span>
            <span className="shrink-0 text-xs text-slate-400">/{page.slug}</span>
          </button>
        ))}
        {pages.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-slate-400">{t("admin.contentPages.empty")}</p>
        )}
      </Card>

      <div className="space-y-6">
        {selectedId === NEW_PAGE_ID && (
          <PageForm key="new" initial={emptyDraft} onSubmit={handleCreate} submitLabel={t("admin.contentPages.createSubmit")} />
        )}

        {selectedPage && (
          <PageForm
            key={selectedPage.id}
            initial={{
              slug: selectedPage.slug,
              title: selectedPage.title,
              body: selectedPage.body,
              titleEn: selectedPage.titleEn ?? undefined,
              bodyEn: selectedPage.bodyEn ?? undefined,
              titleTkm: selectedPage.titleTkm ?? undefined,
              bodyTkm: selectedPage.bodyTkm ?? undefined,
            }}
            onSubmit={(input) => handleUpdate(selectedPage.id, input)}
            onDelete={() => handleDelete(selectedPage.id)}
            submitLabel={t("admin.contentPages.saveSubmit")}
          />
        )}

        {!selectedId && (
          <Card className="p-8 text-center text-sm text-slate-500">
            {t("admin.contentPages.emptyStateHint")}{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">faq</code>,{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">privacy</code>,{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">offer</code>.
          </Card>
        )}
      </div>
    </div>
  );
}

type ContentLang = "ru" | "en" | "tkm";

const LANG_FIELDS: Record<ContentLang, { title: keyof AdminContentPageInput; body: keyof AdminContentPageInput }> = {
  ru: { title: "title", body: "body" },
  en: { title: "titleEn", body: "bodyEn" },
  tkm: { title: "titleTkm", body: "bodyTkm" },
};

function PageForm({
  initial,
  onSubmit,
  onDelete,
  submitLabel,
}: {
  initial: AdminContentPageInput;
  onSubmit: (input: AdminContentPageInput) => Promise<void>;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AdminContentPageInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<ContentLang>("ru");

  function set<K extends keyof AdminContentPageInput>(key: K, value: AdminContentPageInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.contentPages.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const langLabels: Record<ContentLang, string> = {
    ru: t("admin.contentPages.langRu"),
    en: t("admin.contentPages.langEn"),
    tkm: t("admin.contentPages.langTkm"),
  };
  const fields = LANG_FIELDS[lang];
  const titleValue = (draft[fields.title] as string | undefined) ?? "";
  const bodyValue = (draft[fields.body] as string | undefined) ?? "";
  // The mobile app reads this one slug for its welcome screen, and splits the body in a way no
  // other page here uses. Whoever edits it should not have to know that from a commit message.
  const isWelcome = draft.slug === WELCOME_SLUG;

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.contentPages.slugLabel")}</label>
          <Input
            value={draft.slug}
            onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="faq"
            required
            className="max-w-xs"
          />
        </div>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(Object.keys(LANG_FIELDS) as ContentLang[]).map((code) => {
            const hasContent = code === "ru" || Boolean(draft[LANG_FIELDS[code].title] && draft[LANG_FIELDS[code].body]);
            return (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                  lang === code ? "bg-white shadow-sm text-brand-700" : "text-slate-500"
                }`}
              >
                {langLabels[code]}
                {!hasContent && (
                  <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                    ({t("admin.contentPages.langMissing")})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {isWelcome && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
            {t("admin.contentPages.welcomeNotice")}
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.contentPages.titleLabel")}</label>
          <Input
            value={titleValue}
            onChange={(e) => set(fields.title, e.target.value as AdminContentPageInput[typeof fields.title])}
            required={lang === "ru"}
          />
          {isWelcome && <p className="mt-1 text-xs text-slate-400">{t("admin.contentPages.welcomeTitleHint")}</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.contentPages.bodyLabel")}</label>
          <textarea
            value={bodyValue}
            onChange={(e) => set(fields.body, e.target.value as AdminContentPageInput[typeof fields.body])}
            rows={14}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            required={lang === "ru"}
          />
          <p className="mt-1 text-xs text-slate-400">
            {isWelcome ? t("admin.contentPages.welcomeBodyHint") : t("admin.contentPages.bodyHint")}{" "}
            {lang !== "ru" && t("admin.contentPages.langHint")}
          </p>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("admin.contentPages.saving") : submitLabel}
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" size="sm" onClick={onDelete}>
              {t("admin.contentPages.deletePage")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
