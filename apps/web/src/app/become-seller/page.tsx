"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@topup-hub/api-client";
import type { CreateSellerApplicationInput } from "@topup-hub/types";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const emptyDraft: CreateSellerApplicationInput = {
  phone: "",
  email: "",
  password: "",
  fullName: "",
  handle: "",
  shopName: "",
  description: "",
};

export default function BecomeSellerPage() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CreateSellerApplicationInput>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.applyForSeller(draft);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.becomeSeller.genericError"));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="bg-hero-gradient min-h-[calc(100vh-4rem)]">
        <div className="mx-auto max-w-md px-4 py-16">
          <Card className="p-8 text-center">
            <p className="text-lg font-semibold">{t("web.becomeSeller.successTitle")}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("web.becomeSeller.successBody")}</p>
            <Link href="/" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
              {t("web.becomeSeller.backHome")}
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-hero-gradient min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="p-8">
          <h1 className="text-xl font-bold">{t("web.becomeSeller.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("web.becomeSeller.subtitle")}</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.becomeSeller.phoneLabel")}</label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                placeholder="+993..."
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.becomeSeller.emailLabel")}</label>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              <p className="mt-1 text-xs text-slate-400">{t("web.becomeSeller.emailHint")}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.becomeSeller.passwordLabel")}</label>
              <Input
                type="password"
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.becomeSeller.fullNameLabel")}</label>
              <Input
                value={draft.fullName ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.becomeSeller.handleLabel")}</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">gulyaly.com/@</span>
                <Input
                  value={draft.handle}
                  onChange={(e) => setDraft((d) => ({ ...d, handle: e.target.value.replace(/^@/, "") }))}
                  placeholder="myshop"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.becomeSeller.shopNameLabel")}</label>
              <Input
                value={draft.shopName}
                onChange={(e) => setDraft((d) => ({ ...d, shopName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("web.becomeSeller.descriptionLabel")}</label>
              <Input
                value={draft.description ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? t("web.becomeSeller.submitting") : t("web.becomeSeller.submit")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
