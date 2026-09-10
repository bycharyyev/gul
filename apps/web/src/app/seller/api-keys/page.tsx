"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreateSellerApiKeyInput, SellerApiKeyDto, ShopApiKeyScope } from "@topup-hub/types";
import { shopApiKeyScopes } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DEFAULT_SCOPES: ShopApiKeyScope[] = ["products:read"];

export default function SellerApiKeysPage() {
  const { t, locale } = useTranslation();
  const [keys, setKeys] = useState<SellerApiKeyDto[]>([]);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [scopes, setScopes] = useState<ShopApiKeyScope[]>(DEFAULT_SCOPES);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCreate = name.trim().length > 0 && scopes.length > 0 && !busy;

  function load() {
    api.listMySellerApiKeys().then(setKeys).catch(() => setError(t("sellerCabinet.apiKeys.loadError")));
  }

  useEffect(load, []);

  function toggleScope(scope: ShopApiKeyScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setBusy("create");
    setError(null);
    try {
      const input: CreateSellerApiKeyInput = {
        name: name.trim(),
        scopes,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
      };
      const created = await api.createMySellerApiKey(input);
      setKeys((prev) => [created, ...prev]);
      setRawKey(created.rawKey);
      setName("");
      setExpiresAt("");
      setScopes(DEFAULT_SCOPES);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("sellerCabinet.apiKeys.createError"));
    } finally {
      setBusy(null);
    }
  }

  async function setEnabled(key: SellerApiKeyDto, isEnabled: boolean) {
    setBusy(key.id);
    setError(null);
    try {
      const updated = await api.setMySellerApiKeyEnabled(key.id, isEnabled);
      setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)));
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("sellerCabinet.apiKeys.updateError"));
    } finally {
      setBusy(null);
    }
  }

  async function rotate(key: SellerApiKeyDto) {
    if (!confirm(t("sellerCabinet.apiKeys.rotateConfirm"))) return;
    setBusy(key.id);
    setError(null);
    try {
      const updated = await api.rotateMySellerApiKey(key.id);
      setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)));
      setRawKey(updated.rawKey);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("sellerCabinet.apiKeys.updateError"));
    } finally {
      setBusy(null);
    }
  }

  async function remove(key: SellerApiKeyDto) {
    if (!confirm(t("sellerCabinet.apiKeys.deleteConfirm", { name: key.name }))) return;
    setBusy(key.id);
    setError(null);
    try {
      await api.deleteMySellerApiKey(key.id);
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("sellerCabinet.apiKeys.updateError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="p-5">
        <h2 className="text-lg font-bold">{t("sellerCabinet.apiKeys.title")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("sellerCabinet.apiKeys.subtitle")}</p>
        <form className="mt-5 space-y-4" onSubmit={createKey}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.apiKeys.nameLabel")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("sellerCabinet.apiKeys.namePlaceholder")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("sellerCabinet.apiKeys.expiresLabel")}</label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">{t("sellerCabinet.apiKeys.expiresHint")}</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">{t("sellerCabinet.apiKeys.scopesLabel")}</p>
            <div className="grid gap-2">
              {shopApiKeyScopes.map((scope) => (
                <label key={scope} className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  <span>
                    <span className="font-medium">{t(`sellerCabinet.apiKeys.scope.${scope}`)}</span>
                    <span className="block text-xs text-slate-400">{scope}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" disabled={!canCreate} className="w-full">
            {busy === "create" ? t("common.saving") : t("sellerCabinet.apiKeys.create")}
          </Button>
        </form>
      </Card>

      <div className="space-y-4">
        {rawKey && <RawKeyCard value={rawKey} onClose={() => setRawKey(null)} />}
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-4 dark:border-white/10">
            <h3 className="font-semibold">{t("sellerCabinet.apiKeys.activeTitle")}</h3>
            <p className="text-xs text-slate-400">{t("sellerCabinet.apiKeys.limitHint")}</p>
          </div>
          {keys.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">{t("sellerCabinet.apiKeys.empty")}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {keys.map((key) => (
                <KeyRow
                  key={key.id}
                  item={key}
                  busy={busy === key.id}
                  locale={LOCALE_BCP47[locale]}
                  onToggle={() => setEnabled(key, !key.isEnabled)}
                  onRotate={() => rotate(key)}
                  onDelete={() => remove(key)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function RawKeyCard({ value, onClose }: { value: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }

  return (
    <Card className="border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-emerald-900 dark:text-emerald-100">{t("sellerCabinet.apiKeys.rawTitle")}</p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200">{t("sellerCabinet.apiKeys.rawHint")}</p>
        </div>
        <button className="text-sm text-emerald-800 dark:text-emerald-100" onClick={onClose}>
          ×
        </button>
      </div>
      <code className="mt-3 block overflow-x-auto rounded-xl bg-white p-3 text-xs text-slate-900 dark:bg-black/30 dark:text-slate-100">
        {value}
      </code>
      <Button className="mt-3" size="sm" variant="secondary" onClick={copy}>
        {copied ? t("sellerCabinet.apiKeys.copied") : t("sellerCabinet.apiKeys.copy")}
      </Button>
    </Card>
  );
}

function KeyRow({
  item,
  busy,
  locale,
  onToggle,
  onRotate,
  onDelete,
}: {
  item: SellerApiKeyDto;
  busy: boolean;
  locale: string;
  onToggle: () => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const expires = useMemo(
    () => (item.expiresAt ? new Date(item.expiresAt).toLocaleDateString(locale) : t("sellerCabinet.apiKeys.never")),
    [item.expiresAt, locale, t],
  );

  return (
    <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{item.name}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs ${item.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {item.isEnabled ? t("sellerCabinet.apiKeys.enabled") : t("sellerCabinet.apiKeys.disabled")}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {item.keyPrefix}… · {t("sellerCabinet.apiKeys.expiresShort", { date: expires })}
        </p>
        <p className="mt-2 flex flex-wrap gap-1">
          {item.scopes.map((scope) => (
            <span key={scope} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {scope}
            </span>
          ))}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onToggle}>
          {item.isEnabled ? t("sellerCabinet.apiKeys.disable") : t("sellerCabinet.apiKeys.enable")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRotate}>
          {t("sellerCabinet.apiKeys.rotate")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete}>
          {t("sellerCabinet.apiKeys.delete")}
        </Button>
      </div>
    </div>
  );
}
