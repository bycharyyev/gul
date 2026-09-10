"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "@topup-hub/i18n";
import { shopApiKeyScopes } from "@topup-hub/types";
import { Card } from "@/components/ui/card";
import { API_SECTIONS, METHOD_COLORS, type DocEndpoint } from "./endpoints";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(
  /\/$/,
  "",
);

/**
 * The Seller API, written for the person integrating against it.
 *
 * Deliberately one page rather than a section per route: somebody arriving here has a token and a
 * question, and the answer to almost every first question is on the first screen — where to send
 * the request, which header carries the token, and what a scope costs them. The reference below
 * is for the second question.
 */
export default function SellerApiDocsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold">{t("sellerCabinet.apiDocs.title")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          {t("sellerCabinet.apiDocs.subtitle")}
        </p>
      </div>

      {/* Everything needed for a first successful request, before any reference. */}
      <Card className="space-y-4 p-5">
        <h3 className="font-semibold">{t("sellerCabinet.apiDocs.startTitle")}</h3>
        <Field label={t("sellerCabinet.apiDocs.baseUrl")} value={`${API_BASE}/seller-api`} />
        <Field label={t("sellerCabinet.apiDocs.authHeader")} value="X-Api-Key: sk_shop_…" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("sellerCabinet.apiDocs.tokenHint")}{" "}
          <Link href="/seller/api-keys" className="font-medium text-brand-600 hover:underline">
            {t("seller.nav.apiKeys")}
          </Link>
          .
        </p>
        <CodeBlock
          code={`curl ${API_BASE}/seller-api/me \\
  -H "X-Api-Key: $GULYALY_TOKEN"`}
        />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("sellerCabinet.apiDocs.meHint")}
        </p>
      </Card>

      {/* Scopes before the reference: every route below names one, and a reader who does not know
          what they are will not understand a single row of it. */}
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">{t("sellerCabinet.apiDocs.scopesTitle")}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("sellerCabinet.apiDocs.scopesIntro")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {shopApiKeyScopes.map((scope) => (
            <div
              key={scope}
              className="rounded-lg border border-slate-200/70 px-3 py-2 dark:border-white/10"
            >
              <code className="text-xs font-semibold">{scope}</code>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t(`sellerCabinet.apiKeys.scope.${scope}`)}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">{t("sellerCabinet.apiDocs.limitsTitle")}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("sellerCabinet.apiDocs.limitsIntro")}
        </p>
        <CodeBlock
          code={`X-Quota-Limit: 60
X-Quota-Remaining: 41
X-Quota-Reset: 23`}
        />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("sellerCabinet.apiDocs.limitsRetry")}
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">{t("sellerCabinet.apiDocs.errorsTitle")}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("sellerCabinet.apiDocs.errorsIntro")}
        </p>
        <CodeBlock
          code={`{
  "statusCode": 403,
  "message": "API key is missing the \\"products:write\\" scope"
}`}
        />
      </Card>

      {API_SECTIONS.map((section) => (
        <section key={section.id} className="space-y-3">
          <div>
            <h3 className="font-semibold">{t(section.title)}</h3>
            <p className="mt-0.5 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              {t(section.intro)}
            </p>
          </div>
          <div className="space-y-2">
            {section.endpoints.map((endpoint) => (
              <EndpointRow key={`${endpoint.method} ${endpoint.path}`} endpoint={endpoint} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: DocEndpoint }) {
  const { t } = useTranslation();
  // Bodies are collapsed by default: the reference is read by scanning for a path, and eight
  // expanded JSON blocks would bury the list this page exists to show.
  const [open, setOpen] = useState(false);

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => endpoint.body && setOpen((v) => !v)}
        className={`flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left ${
          endpoint.body ? "cursor-pointer hover:bg-white/60 dark:hover:bg-white/5" : "cursor-default"
        }`}
      >
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${METHOD_COLORS[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <code className="min-w-0 flex-1 break-all text-sm font-medium">{endpoint.path}</code>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
          {endpoint.scope}
        </span>
      </button>
      <div className="border-t border-slate-200/70 px-4 py-2 dark:border-white/10">
        <p className="text-xs text-slate-500 dark:text-slate-400">{t(endpoint.summary)}</p>
        {endpoint.body && open && <CodeBlock className="mt-2" code={endpoint.body} />}
        {endpoint.body && !open && (
          <p className="mt-1 text-[11px] text-brand-600 dark:text-brand-300">
            {t("sellerCabinet.apiDocs.showBody")}
          </p>
        )}
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <code className="mt-0.5 block break-all text-sm font-semibold">{value}</code>
    </div>
  );
}

function CodeBlock({ code, className = "" }: { code: string; className?: string }) {
  return (
    // Scrolls inside itself: a long curl line must not make the whole page scroll sideways.
    <pre
      className={`overflow-x-auto rounded-lg bg-slate-900 px-3 py-2.5 text-xs leading-relaxed text-slate-100 ${className}`}
    >
      <code>{code}</code>
    </pre>
  );
}
