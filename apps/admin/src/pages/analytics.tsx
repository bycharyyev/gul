import { BarChart3, ExternalLink } from "lucide-react";
import { useTranslation } from "@topup-hub/i18n";
import { Card } from "@/components/ui/card";

// External dashboards, not embeddable here -- both GA4 and Yandex Metrika refuse to render
// inside an iframe (X-Frame-Options), so "one place" means one page of links that open the
// real dashboards in a new tab, not an embedded view.
const LINKS = [
  {
    key: "ga4",
    href: "https://analytics.google.com/analytics/web/#/a227539009p358154600/reports/intelligenthome",
  },
  {
    key: "metrika",
    href: "https://metrika.yandex.ru/dashboard?id=112566532",
  },
] as const;

export default function AnalyticsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("admin.analytics.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.analytics.hint")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {LINKS.map(({ key, href }) => (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block transition hover:-translate-y-0.5"
          >
            <Card className="flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-brand-soft text-brand-700">
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{t(`admin.analytics.${key}.title`)}</span>
                <span className="block text-sm text-slate-500">{t(`admin.analytics.${key}.subtitle`)}</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
