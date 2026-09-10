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

export default function RegisterPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [phone, setPhone] = useState("");
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
      await api.register({
        phone,
        password,
        fullName: fullName || undefined,
        locale,
        referredByUsername: referralCode.trim() || undefined,
        utmSource: referral?.utmSource,
        utmMedium: referral?.utmMedium,
        utmCampaign: referral?.utmCampaign,
        referrerUrl: referral?.referrerUrl,
      });
      clearStoredReferral();
      router.push("/account");
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.register.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-hero-gradient min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="p-8">
          <h1 className="text-xl font-bold">{t("web.register.title")}</h1>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.register.phone")}</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+70000000000" />
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
