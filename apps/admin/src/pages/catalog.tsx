import { useEffect, useState } from "react";
import type { AdminServiceInput, CurrencyCode, RateDto, ServiceDto } from "@topup-hub/types";
import { CURRENCY_CODES } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ImageUploadField } from "@/components/ui/image-upload-field";

const NEW_SERVICE_ID = "__new__";

const emptyDraft: AdminServiceInput = {
  code: "",
  name: "",
  description: "",
  logoUrl: "",
  inputType: "PHONE",
  validationRegex: "",
  minAmountTmt: 5,
  maxAmountTmt: 500,
  isEnabled: true,
};

export default function CatalogPage() {
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rates, setRates] = useState<RateDto[]>([]);
  const [savingCurrency, setSavingCurrency] = useState<CurrencyCode | null>(null);

  function loadServices() {
    return api
      .listAllServices()
      .then(setServices)
      .catch(() => {
        // onSessionExpired already redirects to /login on 401
      });
  }

  useEffect(() => {
    loadServices().then(() => {
      // no-op; selection defaults to the "create" panel until the admin picks one
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId || selectedId === NEW_SERVICE_ID) {
      setRates([]);
      return;
    }
    api
      .listRates(selectedId)
      .catch(() => [])
      .then(setRates);
  }, [selectedId]);

  const selectedService = services.find((s) => s.id === selectedId) ?? null;

  function rateFor(currency: CurrencyCode) {
    return rates.find((r) => r.currency === currency);
  }

  async function saveRate(currency: CurrencyCode, value: number, enabled: boolean) {
    if (!selectedId) return;
    setSavingCurrency(currency);
    try {
      const updated = await api.upsertRate(selectedId, { currency, rate: value, enabled });
      setRates((prev) => [...prev.filter((r) => r.currency !== currency), updated]);
    } finally {
      setSavingCurrency(null);
    }
  }

  async function handleCreate(input: AdminServiceInput) {
    const created = await api.createService(input);
    setServices((prev) => [...prev, created]);
    setSelectedId(created.id);
  }

  async function handleUpdate(id: string, input: AdminServiceInput) {
    const updated = await api.updateService(id, input);
    setServices((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleDelete(id: string) {
    if (!confirm(t("admin.catalog.deleteServiceConfirm"))) return;
    await api.deleteService(id);
    setServices((prev) => prev.filter((s) => s.id !== id));
    setSelectedId(null);
  }

  return (
    <div className="grid grid-cols-[240px_1fr] gap-6">
      <Card className="p-2">
        <Button
          variant="secondary"
          size="sm"
          className="mb-2 w-full"
          onClick={() => setSelectedId(NEW_SERVICE_ID)}
        >
          {t("admin.catalog.newService")}
        </Button>
        {services.map((service) => (
          <button
            key={service.id}
            onClick={() => setSelectedId(service.id)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
              selectedId === service.id ? "bg-gradient-brand-soft text-brand-700" : "hover:bg-slate-50"
            }`}
          >
            <span>{service.name}</span>
            {!service.isEnabled && <span className="text-xs text-slate-400">{t("admin.catalog.disabledTag")}</span>}
          </button>
        ))}
      </Card>

      <div className="space-y-6">
        {selectedId === NEW_SERVICE_ID && (
          <ServiceForm key="new" initial={emptyDraft} onSubmit={handleCreate} submitLabel={t("admin.catalog.createSubmit")} />
        )}

        {selectedService && (
          <>
            <ServiceForm
              key={selectedService.id}
              initial={{
                code: selectedService.code,
                name: selectedService.name,
                description: selectedService.description ?? "",
                logoUrl: selectedService.logoUrl ?? "",
                inputType: selectedService.inputType,
                validationRegex: selectedService.validationRegex ?? "",
                minAmountTmt: selectedService.minAmountTmt,
                maxAmountTmt: selectedService.maxAmountTmt,
                isEnabled: selectedService.isEnabled,
              }}
              onSubmit={(input) => handleUpdate(selectedService.id, input)}
              onDelete={() => handleDelete(selectedService.id)}
              submitLabel={t("admin.catalog.saveSubmit")}
            />

            <Card>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t("admin.catalog.colCurrency")}</th>
                    <th className="px-4 py-3">{t("admin.catalog.colRate")}</th>
                    <th className="px-4 py-3">{t("admin.catalog.colEnabled")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {CURRENCY_CODES.map((currency) => (
                    <RateRow
                      key={currency}
                      currency={currency}
                      rate={rateFor(currency)}
                      saving={savingCurrency === currency}
                      onSave={saveRate}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

        {!selectedId && (
          <Card className="p-8 text-center text-sm text-slate-500">
            {t("admin.catalog.selectPrompt")}
          </Card>
        )}
      </div>
    </div>
  );
}

function ServiceForm({
  initial,
  onSubmit,
  onDelete,
  submitLabel,
}: {
  initial: AdminServiceInput;
  onSubmit: (input: AdminServiceInput) => Promise<void>;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AdminServiceInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AdminServiceInput>(key: K, value: AdminServiceInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.catalog.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.catalog.codeLabel")}</label>
            <Input value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.catalog.nameLabel")}</label>
            <Input value={draft.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.catalog.descriptionLabel")}</label>
          <Input value={draft.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </div>

        <ImageUploadField
          label={t("admin.catalog.logoUrlLabel")}
          value={draft.logoUrl ?? ""}
          onChange={(url) => set("logoUrl", url)}
          uploadLabel={t("common.uploadImageButton")}
          hint={t("admin.catalog.logoHint")}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.catalog.inputTypeLabel")}</label>
            <Select value={draft.inputType} onChange={(e) => set("inputType", e.target.value as "PHONE" | "ACCOUNT_ID")}>
              <option value="PHONE">{t("admin.catalog.inputTypePhone")}</option>
              <option value="ACCOUNT_ID">{t("admin.catalog.inputTypeAccountId")}</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.catalog.regexLabel")}</label>
            <Input value={draft.validationRegex ?? ""} onChange={(e) => set("validationRegex", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.catalog.minAmountLabel")}</label>
            <Input
              type="number"
              value={draft.minAmountTmt}
              onChange={(e) => set("minAmountTmt", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.catalog.maxAmountLabel")}</label>
            <Input
              type="number"
              value={draft.maxAmountTmt}
              onChange={(e) => set("maxAmountTmt", Number(e.target.value))}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.isEnabled ?? true}
            onChange={(e) => set("isEnabled", e.target.checked)}
          />
          {t("admin.catalog.enabledCheckbox")}
        </label>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("common.saving") : submitLabel}
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" size="sm" onClick={onDelete}>
              {t("admin.catalog.deleteServiceButton")}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function RateRow({
  currency,
  rate,
  saving,
  onSave,
}: {
  currency: CurrencyCode;
  rate?: RateDto;
  saving: boolean;
  onSave: (currency: CurrencyCode, value: number, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(rate?.rate ?? 0);
  const [enabled, setEnabled] = useState(rate?.enabled ?? true);

  useEffect(() => {
    setValue(rate?.rate ?? 0);
    setEnabled(rate?.enabled ?? true);
  }, [rate]);

  return (
    <tr>
      <td className="px-4 py-3 font-medium">{currency}</td>
      <td className="px-4 py-3">
        <input
          type="number"
          step="0.0001"
          className="h-9 w-32 rounded-lg border border-slate-200 px-2 text-sm"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
      </td>
      <td className="px-4 py-3">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      </td>
      <td className="px-4 py-3 text-right">
        <button
          disabled={saving}
          onClick={() => onSave(currency, value, enabled)}
          className="bg-gradient-brand rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "…" : t("common.save")}
        </button>
      </td>
    </tr>
  );
}
