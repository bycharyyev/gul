"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";

/**
 * The /l/<slug> short link a marketing campaign hands out. No screen of its own, like /r/<code>:
 * whoever followed this link already saw the pitch wherever it was posted, and the fastest path
 * is straight through to wherever it points -- a product, a promo, an external page, whatever
 * staff set it to in the admin. `window.location.replace`, not the Next router: the target is an
 * arbitrary absolute URL, not necessarily a route this app itself owns.
 *
 * On Android with the app installed, App Links intercepts this before the browser ever loads it
 * (see infra/android/README for the assetlinks.json half of that) -- this page only runs at all
 * when the app isn't installed, or the click happened somewhere that never hands off to it.
 */
export default function ShortLinkPage() {
  const { t } = useTranslation();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .resolveManagedLink(slug)
      .then((link) => {
        if (!cancelled) window.location.replace(link.targetUrl);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
    // Runs once per landing, the same reasoning as the /i/<code> page: re-resolving on every
    // unrelated re-render would restart a redirect that may already be underway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!notFound) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="p-8 text-center text-sm text-slate-500">
          {t("web.shortLink.checking")}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-8 text-center text-sm text-rose-600">
        {t("web.shortLink.notFound")}
      </Card>
    </div>
  );
}
