"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "@topup-hub/i18n";
import { api, isAuthenticated } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Preview = {
  title: string;
  memberCount: number;
  alreadyMember: boolean;
};

/**
 * The /i/<code> landing link a group's invite carries.
 *
 * A real page rather than a redirect, unlike /r/<code>: a referral link makes its pitch in the
 * message it arrives in, but an invite arrives forwarded, often from somebody the reader barely
 * knows, and the one thing they need before joining is what they would be joining.
 *
 * A signed-out visitor is sent to sign in with the code kept in the address, so landing back
 * here afterwards continues where they left off instead of starting again.
 */
export default function GroupInvitePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;

  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace(`/login?next=${encodeURIComponent(`/i/${code}`)}`);
      return;
    }
    api
      .chatInvitePreview(code)
      .then((found) => setPreview(found))
      .catch(() => setError(t("web.invite.notFound")))
      .finally(() => setLoading(false));
    // Runs once per landing: re-fetching on a translation-identity change would restart a join
    // the visitor is in the middle of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const join = useCallback(async () => {
    if (!preview) return;
    setJoining(true);
    try {
      if (!preview.alreadyMember) await api.joinChatInvite(code);
      router.replace("/chat");
    } catch {
      setError(t("web.invite.notFound"));
      setJoining(false);
    }
  }, [code, preview, router, t]);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">{t("web.invite.title")}</h1>

      <Card className="mt-6 p-8 text-center">
        {loading ? (
          <p className="text-sm text-slate-500">{t("web.invite.checking")}</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : preview ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-brand-soft">
              {/* Inline rather than an icon package: this app has no icon dependency, and one
                  glyph is not a reason to add one. */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7 text-brand-600"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="mt-4 text-xs uppercase tracking-wide text-slate-500">
              {t("web.invite.intro")}
            </p>
            <p className="mt-1 text-xl font-bold">{preview.title}</p>
            <p className="mt-1 text-sm text-slate-500">
              {preview.memberCount} {t("web.invite.members")}
            </p>
            <Button className="mt-6 w-full" onClick={() => void join()} disabled={joining}>
              {t(preview.alreadyMember ? "web.invite.open" : "web.invite.join")}
            </Button>
          </>
        ) : null}
      </Card>
    </div>
  );
}
