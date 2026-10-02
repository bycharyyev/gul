"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { clearStoredReferral, getStoredReferral, type StoredReferral } from "@/lib/referral";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ClassicRegister() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  // Set once the code has been mailed: the form then asks for the code instead.
  const [sentTo, setSentTo] = useState<{ email: string; minutes: number } | null>(null);
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [referral, setReferral] = useState<StoredReferral | null>(null);
  // Editable and separate from `referral.code`: a code arriving via /r/<code> is a starting
  // point, not a lock -- someone who mistyped a code by hand, or who wants to swap in a friend's
  // instead, must be able to change it right here rather than lose attribution entirely.
  const [referralCode, setReferralCode] = useState("");

  useEffect(() => {
    const stored = getStoredReferral();
    setReferral(stored);
    setReferralCode(stored?.code ?? "");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const started = await api.register({
        email: email.trim().toLowerCase(),
        password,
        fullName: fullName || undefined,
        locale,
        referredByUsername: referralCode.trim() || undefined,
        utmSource: referral?.utmSource,
        utmMedium: referral?.utmMedium,
        utmCampaign: referral?.utmCampaign,
        referrerUrl: referral?.referrerUrl,
      });
      setSentTo({ email: started.email, minutes: started.expiresInMinutes });
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.register.genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    setLoading(true);
    setError(null);
    try {
      await api.confirmRegistration({ email: sentTo.email, code: code.trim() });
      clearStoredReferral();
      router.push("/account");
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.register.genericError"));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <div>
        <div className="mx-auto max-w-md">
          <Card className="p-8">
            <h1 className="text-xl font-bold">{t("web.register.codeTitle")}</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t("web.register.codeHint", { email: sentTo.email, minutes: String(sentTo.minutes) })}
            </p>
            <form className="mt-6 space-y-4" onSubmit={onConfirm}>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("web.register.codeLabel")}</label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <Button className="w-full" disabled={loading || code.length !== 6} type="submit">
                {loading ? t("web.register.confirming") : t("web.register.confirm")}
              </Button>
            </form>
            <div className="mt-4 flex justify-between text-sm">
              <button
                type="button"
                className="text-slate-500 hover:underline dark:text-slate-400"
                onClick={() => {
                  setSentTo(null);
                  setError(null);
                }}
              >
                {t("web.register.changeEmail")}
              </button>
              <button
                type="button"
                className="font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-300"
                disabled={loading}
                onClick={(e) => onSubmit(e as unknown as React.FormEvent)}
              >
                {t("web.register.resend")}
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-md">
        <Card className="p-8">
          <h1 className="text-xl font-bold">{t("web.register.title")}</h1>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.register.email")}</label>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.register.fullName")}</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.register.password")}</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                <Users size={16} className="text-brand-500" aria-hidden="true" />
                {t("web.register.referralLabel")}
              </label>
              <Input
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder={t("web.register.referralPlaceholder")}
                autoCapitalize="off"
                autoCorrect="off"
              />
              {referral?.code && (
                <p className="mt-1 text-xs text-slate-400">{t("web.register.referredBy", { username: referral.code })}</p>
              )}
            </div>

            {referralCode.trim() && (
              <div className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{t("web.register.antifraudNote")}</span>
              </div>
            )}

            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? t("web.register.submitting") : t("web.register.submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            {t("web.register.haveAccount")}{" "}
            <Link href="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
              {t("web.register.login")}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
