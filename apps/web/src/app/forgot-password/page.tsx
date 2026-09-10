"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Must match the server DTO -- these are the bounds the API enforces. */
const CODE_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;

/**
 * `inputmode="numeric"` is only a hint to the on-screen keyboard; it does not restrict what can
 * be entered, and a physical keyboard (or paste) sails straight past it. Letters really did end
 * up in the code field. Strip anything that is not a digit as it is typed.
 */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/**
 * Two steps in one page: ask for the address, then enter the code and a new password.
 *
 * The confirmation form is reached whatever the API says about the address, because the API
 * deliberately does not reveal whether an account exists -- branching the UI on that would
 * reintroduce exactly the disclosure the backend avoids.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [expiresIn, setExpiresIn] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { expiresInMinutes } = await api.requestPasswordReset(email.trim());
      setExpiresIn(expiresInMinutes);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.forgot.requestError"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset(e: React.FormEvent) {
    e.preventDefault();
    // Checked here, not only server-side: class-validator's messages come back in English and
    // joined into one string, which is neither translatable nor readable. Catching it before the
    // request means the user always sees their own language.
    if (code.length !== CODE_LENGTH) {
      setError(t("web.forgot.codeLength"));
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("web.forgot.passwordTooShort").replace("{min}", String(MIN_PASSWORD_LENGTH)));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("web.account.passwordMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.confirmPasswordReset({ email: email.trim(), code, newPassword });
      setDone(true);
      // Every session was revoked server-side, so there is nothing to return to but the login
      // form -- send them there rather than leaving a dead-end success screen.
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.forgot.confirmError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="p-6">
        <h1 className="mb-1 text-xl font-bold">{t("web.forgot.title")}</h1>

        {done ? (
          <p className="mt-4 text-sm text-emerald-600">{t("web.forgot.success")}</p>
        ) : step === "request" ? (
          <form onSubmit={requestCode} className="mt-4 space-y-4">
            <p className="text-sm text-slate-400">{t("web.forgot.requestHint")}</p>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.account.emailLabel")}</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? t("common.saving") : t("web.forgot.sendCode")}
            </Button>
          </form>
        ) : (
          <form onSubmit={confirmReset} className="mt-4 space-y-4">
            <p className="text-sm text-slate-400">
              {t("web.forgot.confirmHint").replace("{email}", email).replace("{minutes}", String(expiresIn))}
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.account.emailCodeLabel")}</label>
              <Input
                value={code}
                onChange={(e) => setCode(digitsOnly(e.target.value))}
                inputMode="numeric"
                maxLength={CODE_LENGTH}
                autoComplete="one-time-code"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.account.newPassword")}</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.account.confirmPassword")}</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.length !== CODE_LENGTH || !newPassword}>
                {busy ? t("common.saving") : t("web.forgot.resetPassword")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep("request")} disabled={busy}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        )}

        <p className="mt-6 text-sm text-slate-400">
          <Link href="/login" className="underline">
            {t("web.forgot.backToLogin")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
