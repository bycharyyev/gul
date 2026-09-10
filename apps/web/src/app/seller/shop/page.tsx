"use client";

import { useEffect, useState } from "react";
import type { SellerMeDto, SellerTelegramStatusDto, UpdateSellerInput } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploadField } from "@/components/ui/image-upload-field";

export default function SellerShopPage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<SellerMeDto | null>(null);
  const [draft, setDraft] = useState<UpdateSellerInput>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getMySellerProfile().then((p) => {
      setProfile(p);
      setDraft({
        handle: p.handle,
        shopName: p.shopName,
        description: p.description ?? "",
        logoUrl: p.logoUrl ?? "",
        defaultPayoutDetails: p.defaultPayoutDetails ?? "",
      });
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateMySellerProfile(draft);
      setProfile(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("sellerCabinet.shop.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;

  return (
    <div className="max-w-xl space-y-6">
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.shop.shopNameLabel")}</label>
            <Input value={draft.shopName ?? ""} onChange={(e) => setDraft((d) => ({ ...d, shopName: e.target.value }))} required />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.shop.usernameLabel")}</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">gulyaly.com/@</span>
              <Input
                value={draft.handle ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, handle: e.target.value.replace(/^@/, "") }))}
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.shop.descriptionLabel")}</label>
            <Input value={draft.description ?? ""} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
          </div>

          <ImageUploadField
            label={t("sellerCabinet.shop.logoUrlLabel")}
            value={draft.logoUrl ?? ""}
            onChange={(url) => setDraft((d) => ({ ...d, logoUrl: url }))}
            uploadLabel={t("common.uploadImageButton")}
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("sellerCabinet.shop.payoutDetailsLabel")}
            </label>
            <Input
              value={draft.defaultPayoutDetails ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, defaultPayoutDetails: e.target.value }))}
              placeholder={t("sellerCabinet.shop.payoutDetailsPlaceholder")}
            />
            <p className="mt-1 text-xs text-slate-400">{t("sellerCabinet.shop.payoutDetailsHint")}</p>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          {saved && <p className="text-sm text-emerald-600">{t("sellerCabinet.shop.saved")}</p>}

          <Button type="submit" disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </form>
      </Card>

      <TelegramCard />
    </div>
  );
}

function TelegramCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SellerTelegramStatusDto | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.getMySellerTelegramStatus().then(setStatus).catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateMySellerTelegramLinkCode();
      setDeepLink(res.deepLink);
      if (res.deepLink) window.open(res.deepLink, "_blank");
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("sellerCabinet.shop.connectError"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api.unlinkMySellerTelegram();
      setDeepLink(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("sellerCabinet.shop.disconnectError"));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">{t("sellerCabinet.shop.telegramBotTitle")}</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        {t("sellerCabinet.shop.telegramBotDescription", { bot: status.botUsername ?? "sellergulyalybot" })}
      </p>

      {status.linked ? (
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("sellerCabinet.shop.connected")}
          </span>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>
            {t("sellerCabinet.shop.disconnect")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Button onClick={connect} disabled={busy}>
            {busy ? t("sellerCabinet.shop.preparingLink") : t("sellerCabinet.shop.connectTelegram")}
          </Button>
          {deepLink && (
            <p className="text-xs text-slate-400">
              {t("sellerCabinet.shop.botNotOpenedHint")}
              <a href={deepLink} target="_blank" rel="noreferrer" className="text-brand-600 underline dark:text-brand-300">
                {t("sellerCabinet.shop.clickHere")}
              </a>
              .
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </Card>
  );
}
