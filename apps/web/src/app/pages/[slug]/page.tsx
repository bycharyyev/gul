"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ContentPageDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";

// Content pages are free-text, admin-authored (see apps/admin's Content Pages editor) rather
// than static UI chrome, so they aren't in the shared dictionary -- each page carries its own
// optional per-locale override columns instead, falling back to the base (Russian) text when a
// translation hasn't been written yet.
function resolveLocalized(page: ContentPageDto, locale: string): { title: string; body: string } {
  if (locale === "en") return { title: page.titleEn || page.title, body: page.bodyEn || page.body };
  if (locale === "tkm") return { title: page.titleTkm || page.title, body: page.bodyTkm || page.body };
  return { title: page.title, body: page.body };
}

export default function ContentPagePage() {
  const { t, locale } = useTranslation();
  const params = useParams<{ slug: string }>();
  const [page, setPage] = useState<ContentPageDto | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.slug) return;
    api
      .getContentPage(params.slug)
      .then(setPage)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.slug]);

  const localized = page ? resolveLocalized(page, locale) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {notFound && !loading && (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">{t("web.cmsPage.notFound")}</Card>
      )}

      {localized && (
        <article>
          <h1 className="text-2xl font-bold tracking-tight">{localized.title}</h1>
          <div className="mt-6 space-y-4 text-sm text-slate-600 dark:text-slate-300">{renderBody(localized.body)}</div>
        </article>
      )}
    </div>
  );
}

function renderBody(body: string) {
  return body.split(/\n\n+/).map((block, i) => {
    if (block.startsWith("## ")) {
      return (
        <h2 key={i} className="pt-2 text-lg font-semibold text-slate-900 dark:text-white">
          {block.slice(3)}
        </h2>
      );
    }
    return (
      <p key={i} className="leading-relaxed">
        {block}
      </p>
    );
  });
}
