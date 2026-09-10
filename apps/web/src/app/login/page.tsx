"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Where to land after signing in, when something sent the visitor here mid-task.
 *
 * Read off `window.location` at submit time rather than through `useSearchParams`: this is a
 * static route, and that hook opts the whole page out of prerendering unless it is wrapped in a
 * suspense boundary — a lot of machinery for a value only needed once, in the browser, after a
 * click.
 *
 * Only a path on this site: `next` arrives in a URL anybody can write, and following an absolute
 * one would turn our own login form into a redirector to somebody else's. `//evil.example` is a
 * protocol-relative URL, which is why a leading slash alone is not enough of a check.
 */
function safeNext(): string | null {
  const value = new URLSearchParams(window.location.search).get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login({ phone, password });
      router.push(safeNext() ?? "/account");
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.login.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-hero-gradient min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="p-8">
          <h1 className="text-xl font-bold">{t("web.login.title")}</h1>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.login.phone")}</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+70000000000" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.login.password")}</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? t("web.login.submitting") : t("web.login.submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            <Link href="/forgot-password" className="text-slate-500 hover:underline dark:text-slate-400">
              {t("web.forgot.link")}
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
            {t("web.login.noAccount")}{" "}
            <Link href="/register" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
              {t("web.login.register")}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
