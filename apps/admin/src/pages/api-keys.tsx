import { useEffect, useState } from "react";
import type { ApiKeyDto, CreateApiKeyResult } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/api$/, "") + "/api";

export default function ApiKeysPage() {
  const { t, locale } = useTranslation();
  const [keys, setKeys] = useState<ApiKeyDto[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<CreateApiKeyResult | null>(null);

  function load() {
    api.listApiKeys().then(setKeys).catch(() => {});
  }

  useEffect(load, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createApiKey({ name, ownerLabel });
      setJustCreated(created);
      setKeys((prev) => [created, ...prev]);
      setName("");
      setOwnerLabel("");
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.apiKeys.createError"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(key: ApiKeyDto) {
    const updated = await api.setApiKeyEnabled(key.id, !key.isEnabled);
    setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)));
  }

  async function editRateLimit(key: ApiKeyDto) {
    const current = key.rateLimitPerMin === null ? "" : String(key.rateLimitPerMin);
    const answer = prompt(t("admin.apiKeys.rateLimitPrompt"), current);
    if (answer === null) return;

    const trimmed = answer.trim();
    // An empty answer means "back to the tier default". There is no way to express unlimited --
    // disabling a key is what the Disable button is for.
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isInteger(value) || value < 1)) {
      setError(t("admin.apiKeys.rateLimitInvalid"));
      return;
    }

    try {
      const updated = await api.setApiKeyRateLimit(key.id, value);
      setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.apiKeys.rateLimitError"));
    }
  }

  async function editScopes(key: ApiKeyDto) {
    const answer = prompt(t("admin.apiKeys.scopesPrompt"), key.scopes.join(", "));
    if (answer === null) return;

    const scopes = answer
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const updated = await api.setApiKeyScopes(key.id, scopes);
      setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.apiKeys.scopesError"));
    }
  }

  async function editExpiry(key: ApiKeyDto) {
    const current = key.expiresAt ? key.expiresAt.slice(0, 10) : "";
    const answer = prompt(t("admin.apiKeys.expiryPrompt"), current);
    if (answer === null) return;

    const trimmed = answer.trim();
    try {
      // An empty answer means "never expires". The date is sent as an ISO instant so the server
      // is not guessing a timezone from a bare date.
      const updated = await api.setApiKeyExpiry(
        key.id,
        trimmed === "" ? null : new Date(`${trimmed}T23:59:59Z`).toISOString(),
      );
      setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.apiKeys.expiryError"));
    }
  }

  async function rotate(key: ApiKeyDto) {
    if (!confirm(t("admin.apiKeys.rotateConfirm", { name: key.name }))) return;
    try {
      const result = await api.rotateApiKey(key.id);
      setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...result } : k)));
      // Shown through the same one-time banner as creation: this is the only moment the new
      // secret exists in readable form.
      setJustCreated(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.apiKeys.rotateError"));
    }
  }

  async function removeKey(key: ApiKeyDto) {
    if (!confirm(t("admin.apiKeys.deleteConfirm", { name: key.name }))) return;
    try {
      await api.deleteApiKey(key.id);
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
    } catch (err) {
      alert(err instanceof ApiError ? translateError(t, err.message) : t("admin.apiKeys.deleteError"));
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.apiKeys.title")}</h1>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? t("common.cancel") : t("admin.apiKeys.newKey")}
        </Button>
      </div>

      <Card className="p-5 text-sm text-slate-600">
        {t("admin.apiKeys.descriptionPart1")}{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">X-Api-Key</code>
        {t("admin.apiKeys.descriptionPart2")}{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">/partner/orders</code>
        {t("admin.apiKeys.descriptionPart3")}
      </Card>

      {justCreated && (
        <Card className="border-2 border-amber-300 bg-amber-50 p-5">
          <p className="mb-2 text-sm font-semibold text-amber-800">{t("admin.apiKeys.oneTimeWarning")}</p>
          <code className="block break-all rounded-lg bg-white px-3 py-2 text-sm">{justCreated.rawKey}</code>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setJustCreated(null)}>
            {t("admin.apiKeys.confirmSaved")}
          </Button>
        </Card>
      )}

      {showCreate && (
        <Card className="p-5">
          <form onSubmit={createKey} className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.apiKeys.nameLabel")}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("admin.apiKeys.namePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.apiKeys.ownerLabel")}</label>
              <Input
                value={ownerLabel}
                onChange={(e) => setOwnerLabel(e.target.value)}
                placeholder={t("admin.apiKeys.ownerPlaceholder")}
                required
              />
            </div>
            {error && <p className="col-span-2 text-sm text-rose-600">{error}</p>}
            <Button className="col-span-2" type="submit" disabled={busy}>
              {busy ? t("admin.apiKeys.creating") : t("admin.apiKeys.createButton")}
            </Button>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.apiKeys.colName")}</th>
              <th className="px-4 py-3">{t("admin.apiKeys.colPartner")}</th>
              <th className="px-4 py-3">{t("admin.apiKeys.colPrefix")}</th>
              <th className="px-4 py-3">{t("admin.apiKeys.colLastUsed")}</th>
              <th className="px-4 py-3">{t("admin.apiKeys.colScopes")}</th>
              <th className="px-4 py-3">{t("admin.apiKeys.colExpires")}</th>
              <th className="px-4 py-3">{t("admin.apiKeys.colRateLimit")}</th>
              <th className="px-4 py-3">{t("admin.apiKeys.colStatus")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {keys.map((key) => (
              <tr key={key.id}>
                <td className="px-4 py-3 font-medium">{key.name}</td>
                <td className="px-4 py-3">{key.ownerLabel}</td>
                <td className="px-4 py-3 font-mono text-xs">{key.keyPrefix}…</td>
                <td className="px-4 py-3 text-slate-500">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString(LOCALE_BCP47[locale]) : t("admin.apiKeys.never")}
                </td>
                <td className="px-4 py-3">
                  {key.scopes.length === 0 ? (
                    <span className="text-xs font-medium text-rose-600">
                      {t("admin.apiKeys.scopesNone")}
                    </span>
                  ) : (
                    <span className="font-mono text-xs">{key.scopes.join(", ")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {key.expiresAt ? (
                    <span
                      className={
                        new Date(key.expiresAt) <= new Date() ? "font-medium text-rose-600" : ""
                      }
                    >
                      {new Date(key.expiresAt).toLocaleDateString(LOCALE_BCP47[locale])}
                    </span>
                  ) : (
                    t("admin.apiKeys.never")
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {key.rateLimitPerMin === null ? (
                    <span className="text-slate-400">{t("admin.apiKeys.rateLimitDefault")}</span>
                  ) : (
                    <span>{t("admin.apiKeys.rateLimitValue", { n: String(key.rateLimitPerMin) })}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {key.isEnabled ? (
                    <span className="text-xs font-medium text-emerald-600">{t("admin.apiKeys.statusActive")}</span>
                  ) : (
                    <span className="text-xs font-medium text-rose-600">{t("admin.apiKeys.statusDisabled")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => editScopes(key)}>
                      {t("admin.apiKeys.scopesEdit")}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => editExpiry(key)}>
                      {t("admin.apiKeys.expiryEdit")}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => rotate(key)}>
                      {t("admin.apiKeys.rotate")}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => editRateLimit(key)}>
                      {t("admin.apiKeys.rateLimitEdit")}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => toggleEnabled(key)}>
                      {key.isEnabled ? t("admin.apiKeys.disable") : t("admin.apiKeys.enable")}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => removeKey(key)}>
                      {t("common.delete")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.apiKeys.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="p-5 text-xs text-slate-500">
        <p className="mb-1 font-semibold text-slate-600">{t("admin.apiKeys.exampleRequestTitle")}</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-slate-100">
{`curl -X POST ${API_BASE}/partner/orders \\
  -H "X-Api-Key: sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"serviceId":"...","paymentMethodId":"...","recipientIdentifier":"+99361234567","amountTmt":50,"currency":"RUB"}'`}
        </pre>
      </Card>
    </div>
  );
}
