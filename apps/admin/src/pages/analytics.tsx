import { useEffect, useState } from "react";
import type {
  AnalyticsLinkDto,
  CreateAnalyticsLinkInput,
} from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { ExternalLink, Globe2, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { confirmAction } from "@/lib/confirm";

const BUILT_IN_LINKS = [
  {
    id: "ga4",
    title: "Google Analytics",
    description: "Ресурс gulyaly (web), GA4",
    url: "https://analytics.google.com/analytics/web/#/a227539009p358154600/reports/intelligenthome",
    faviconUrl: "https://analytics.google.com/favicon.ico",
    builtIn: true,
  },
  {
    id: "metrika",
    title: "Яндекс.Метрика",
    description: "Счётчик Gulyaly, gulyaly.com",
    url: "https://metrika.yandex.ru/dashboard?id=112566532",
    faviconUrl: "https://metrika.yandex.ru/favicon.ico",
    builtIn: true,
  },
] as const;

const EMPTY_DRAFT: CreateAnalyticsLinkInput = {
  title: "",
  description: "",
  url: "",
};

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [links, setLinks] = useState<AnalyticsLinkDto[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<CreateAnalyticsLinkInput>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAnalyticsLinks()
      .then(setLinks)
      .catch(() => setError(t("admin.analytics.loadError")));
  }, [t]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createAnalyticsLink(draft);
      setLinks((current) => [...current, created]);
      setDraft(EMPTY_DRAFT);
      setShowCreate(false);
    } catch {
      setError(t("admin.analytics.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction(t("admin.analytics.deleteConfirm")))) return;
    await api.deleteAnalyticsLink(id);
    setLinks((current) => current.filter((link) => link.id !== id));
  }

  const allLinks = [
    ...BUILT_IN_LINKS,
    ...links.map((link) => ({ ...link, builtIn: false as const })),
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{t("admin.analytics.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("admin.analytics.hint")}
          </p>
        </div>
        <Button
          onClick={() => setShowCreate((value) => !value)}
          className="gap-2"
        >
          {showCreate ? (
            <X className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {showCreate ? t("common.cancel") : t("admin.analytics.add")}
        </Button>
      </div>

      {showCreate && (
        <Card className="overflow-hidden border-brand-200 bg-gradient-to-br from-white to-brand-50/40 p-5">
          <form onSubmit={create} className="space-y-4">
            <div>
              <h2 className="font-semibold">{t("admin.analytics.addTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("admin.analytics.iconHint")}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                {t("admin.analytics.nameLabel")}
                <Input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, title: e.target.value }))
                  }
                  placeholder="PageSpeed Insights"
                  maxLength={80}
                  required
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                {t("admin.analytics.urlLabel")}
                <Input
                  type="url"
                  value={draft.url}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, url: e.target.value }))
                  }
                  placeholder="https://pagespeed.web.dev/"
                  required
                />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              {t("admin.analytics.descriptionLabel")}
              <Input
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
                placeholder={t("admin.analytics.descriptionPlaceholder")}
                maxLength={160}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-rose-600">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("admin.analytics.save")}
            </Button>
          </form>
        </Card>
      )}

      {!showCreate && error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {allLinks.map((link) => (
          <Card
            key={link.id}
            className="group relative flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <SiteIcon src={link.faviconUrl} />
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 focus:outline-none"
            >
              <span className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-brand-500" />
              <span className="block truncate font-semibold">{link.title}</span>
              <span className="block truncate text-sm text-slate-500">
                {link.description || new URL(link.url).hostname}
              </span>
            </a>
            {!link.builtIn && (
              <button
                type="button"
                onClick={() => remove(link.id)}
                className="relative z-10 rounded-lg p-2 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
                aria-label={t("admin.analytics.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <ExternalLink
              className="h-4 w-4 shrink-0 text-slate-400"
              aria-hidden="true"
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

function SiteIcon({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {broken ? (
        <Globe2 className="h-5 w-5 text-brand-600" aria-hidden="true" />
      ) : (
        <img
          src={src}
          alt=""
          className="h-6 w-6 object-contain"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}
