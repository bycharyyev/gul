import { useEffect, useState } from "react";
import type { AdminPaymentMethodDto, AdminPaymentMethodPatch, AdminServiceInput, PaymentMethodDto, PaymentProviderInfoDto, CurrencyCode, OrderDetailDto, RateDto, ServiceDto } from "@topup-hub/types";
import { CURRENCY_CODES } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { useNavigate } from "react-router-dom";
import { confirmAction } from "@/lib/confirm";

/** A hand-edited rate older than this is flagged; matches the server's stale-rate alert (E-06). */
const RATE_STALE_MS = 3 * 24 * 60 * 60_000;

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
  const [orders, setOrders] = useState<OrderDetailDto[]>([]);
  const navigate = useNavigate();

  function loadServices() {
    return api
      .listAllServices()
      .then(setServices)
      .catch(() => {
        // onSessionExpired already redirects to /login on 401
      });
  }

  useEffect(() => {
    Promise.all([loadServices(), api.listAllOrders().then(setOrders).catch(() => [])]).then(() => {
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
  const activeServices = services.filter((service) => service.isEnabled).length;
  const completedOrders = orders.filter((order) => order.status === "COMPLETED");
  const serviceStats = services.map((service) => {
    const serviceOrders = orders.filter((order) => order.serviceId === service.id);
    const completed = serviceOrders.filter((order) => order.status === "COMPLETED");
    return { service, total: serviceOrders.length, completed: completed.length, volume: completed.reduce((sum, order) => sum + Number(order.amountTmt), 0) };
  }).sort((a, b) => b.total - a.total);
  const neverOrdered = serviceStats.filter((item) => item.total === 0).length;

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
    if (!(await confirmAction(t("admin.catalog.deleteServiceConfirm")))) return;
    await api.deleteService(id);
    setServices((prev) => prev.filter((s) => s.id !== id));
    setSelectedId(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Product operations</p><h1 className="mt-1 text-2xl font-bold">Каталог и сервисы</h1><p className="mt-1 text-sm text-slate-500">Управляйте товарами, ценами, продажами и рекламными размещениями.</p></div>
        <Button onClick={() => setSelectedId(NEW_SERVICE_ID)}>{t("admin.catalog.newService")}</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CatalogMetric label="Всего сервисов" value={services.length} detail={`${activeServices} активных`} />
        <CatalogMetric label="Заказов выполнено" value={completedOrders.length} detail="по всем сервисам" tone="green" />
        <CatalogMetric label="Объём продаж" value={`${completedOrders.reduce((sum, order) => sum + Number(order.amountTmt), 0).toFixed(0)} TMT`} detail="по выполненным заказам" />
        <CatalogMetric label="Без заказов" value={neverOrdered} detail="сервисов требуют продвижения" tone={neverOrdered ? "amber" : "green"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold">Продажи по сервисам</h2><p className="text-xs text-slate-500">Что покупают чаще всего и где нужна реклама</p></div><button onClick={() => navigate("/orders")} className="text-xs font-semibold text-brand-600 hover:underline">Открыть заказы</button></div>
        <div className="divide-y divide-slate-100">
          {serviceStats.slice(0, 6).map(({ service, total, completed, volume }) => <button key={service.id} onClick={() => setSelectedId(service.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700">{service.name.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{service.name}</span><span className="text-xs text-slate-500">{completed} выполнено · {volume.toFixed(0)} TMT</span></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{total} заказов</span></button>)}
          {services.length === 0 && <p className="p-5 text-sm text-slate-400">Нет сервисов</p>}
        </div>
      </Card>
      <Card className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-brand-600">Продвижение</p><h2 className="mt-1 text-lg font-bold">Создать размещение</h2><p className="mt-1 text-sm text-slate-500">Запускайте продвижение выбранного сервиса в нужном месте.</p><div className="mt-4 grid grid-cols-2 gap-2">{([["/home-slides", "Баннер на главной"], ["/stories", "История"], ["/feed/moderation", "Лента"], ["/gallery", "Галерея"]] as const).map(([path, label]) => <button key={path} onClick={() => navigate(path)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-xs font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50">{label}<span className="mt-1 block text-[10px] font-normal text-slate-400">Открыть раздел →</span></button>)}</div></Card>
      </div>

      <PaymentMethodsCard />

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
                    <th className="px-4 py-3">{t("admin.catalog.colUpdated")}</th>
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
    </div>
  );
}

function CatalogMetric({ label, value, detail, tone = "brand" }: { label: string; value: string | number; detail: string; tone?: "brand" | "green" | "amber" }) {
  const color = tone === "green" ? "border-emerald-200 bg-emerald-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-brand-100 bg-white";
  return <Card className={`border p-4 ${color}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Card>;
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
  const { t, locale } = useTranslation();
  const [value, setValue] = useState(rate?.rate ?? 0);
  const updatedAt = rate?.updatedAt ? new Date(rate.updatedAt) : null;
  // Same threshold as the "fx-rates-stale" alert (EmailAlertService).
  const stale = updatedAt !== null && Date.now() - updatedAt.getTime() > RATE_STALE_MS;
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
      <td className="px-4 py-3 text-xs">
        {updatedAt ? (
          <span
            className={stale ? "font-medium text-amber-700" : "text-slate-500"}
            title={stale ? t("admin.catalog.rateStaleHint") : undefined}
          >
            {updatedAt.toLocaleDateString(LOCALE_BCP47[locale])}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
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

/**
 * Payment methods customers can pick at checkout, fully editable: on/off, name, which acquiring
 * adapter serves it, fee and order, plus new methods for codes that have none. A new acquirer's
 * method arrives switched off (ADR-0005) and is switched on here after a test payment went
 * through. The API refuses to enable a method -- or move a live one -- onto an adapter whose keys
 * are not on the server; only ADMIN may change anything. Keys themselves never pass through the
 * console: they live in GitHub secrets and are written by the set-*-credentials workflows.
 */
const PAYMENT_CODES: PaymentMethodDto["code"][] = ["CARD", "SBP", "MIR", "CRYPTO", "MANUAL"];

const PAYMENT_ERRORS: Record<string, string> = {
  PAYMENT_PROVIDER_NOT_CONFIGURED: "У этого провайдера нет ключей на сервере — включить или переключить на него нельзя",
  PAYMENT_PROVIDER_UNKNOWN: "Такого провайдера нет в этой версии API",
  PAYMENT_METHOD_CODE_TAKEN: "Способ с таким кодом уже есть — измените существующий",
};

function paymentError(err: unknown): string {
  if (err instanceof ApiError) return PAYMENT_ERRORS[err.message] ?? (err.status === 403 ? "Нужна роль ADMIN" : err.message);
  return "Не удалось сохранить";
}

function PaymentMethodsCard() {
  const [methods, setMethods] = useState<AdminPaymentMethodDto[] | null>(null);
  const [providers, setProviders] = useState<PaymentProviderInfoDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.listAllPaymentMethods().then(setMethods).catch(() => setError("Не удалось загрузить способы оплаты"));
    api.listPaymentProviders().then(setProviders).catch(() => setProviders([]));
  }
  useEffect(load, []);

  const freeCodes = PAYMENT_CODES.filter((c) => !methods?.some((m) => m.code === c));

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Способы оплаты</h2>
      <p className="mb-3 text-xs text-slate-500">
        Что видят клиенты при оплате. Новый способ включайте только после успешного тестового платежа. Крипту можно
        переключать между Heleket и CryptoCloud — если один не работает, выберите другой провайдер и сохраните.
      </p>
      {error && <p className="mb-2 text-sm text-rose-600">{error}</p>}
      {!methods ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : (
        <div className="space-y-3">
          {methods.map((m) => (
            <PaymentMethodRow key={m.id} method={m} providers={providers} onSaved={load} />
          ))}
          {freeCodes.length > 0 && <NewPaymentMethod codes={freeCodes} providers={providers} onCreated={load} />}
        </div>
      )}

      <h3 className="mb-1 mt-5 text-sm font-semibold">Провайдеры на сервере</h3>
      <div className="divide-y divide-slate-100 text-sm">
        {providers.map((p) => (
          <div key={p.key} className="flex items-center justify-between py-1.5">
            <span>
              {p.label} <span className="text-xs text-slate-400">({p.key})</span>
            </span>
            <span className={p.configured ? "text-xs font-semibold text-emerald-700" : "text-xs text-amber-600"}>
              {p.configured ? "ключи есть" : "нет ключей"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Ключи задаются не здесь, а в секретах GitHub и записываются на серверы workflow set-*-credentials — так они не
        проходят через браузер.
      </p>
    </Card>
  );
}

function PaymentMethodRow({
  method,
  providers,
  onSaved,
}: {
  method: AdminPaymentMethodDto;
  providers: PaymentProviderInfoDto[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(method.name);
  const [provider, setProvider] = useState(method.provider);
  const [fee, setFee] = useState(String(Number(method.feePercent)));
  const [order, setOrder] = useState(String(method.sortOrder));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== method.name ||
    provider !== method.provider ||
    Number(fee.replace(",", ".")) !== Number(method.feePercent) ||
    Number(order) !== method.sortOrder;

  async function save(patch: AdminPaymentMethodPatch, confirmText?: string) {
    if (confirmText && !(await confirmAction(confirmText))) return;
    setBusy(true);
    setError(null);
    try {
      await api.updatePaymentMethod(method.id, patch);
      onSaved();
    } catch (err) {
      setError(paymentError(err));
    } finally {
      setBusy(false);
    }
  }

  function saveEdits() {
    const feeNum = Number(fee.replace(",", "."));
    const orderNum = Number(order);
    if (!name.trim()) return setError("Название не может быть пустым");
    if (!Number.isFinite(feeNum) || feeNum < 0 || feeNum > 50) return setError("Комиссия — от 0 до 50 %");
    if (!Number.isInteger(orderNum) || orderNum < 0) return setError("Порядок — целое число от 0");
    const patch: AdminPaymentMethodPatch = {};
    if (name.trim() !== method.name) patch.name = name.trim();
    if (provider !== method.provider) patch.provider = provider;
    if (feeNum !== Number(method.feePercent)) patch.feePercent = feeNum;
    if (orderNum !== method.sortOrder) patch.sortOrder = orderNum;
    void save(
      patch,
      patch.provider && method.isEnabled
        ? `Переключить «${method.name}» на ${patch.provider}? Новые оплаты пойдут через него сразу.`
        : undefined,
    );
  }

  const known = providers.some((p) => p.key === method.provider);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{method.code}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            method.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {method.isEnabled ? "Включён" : "Выключен"}
        </span>
        {!method.providerConfigured && <span className="text-xs text-amber-600">провайдер без ключей</span>}
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          disabled={busy}
          onClick={() =>
            void save(
              { isEnabled: !method.isEnabled },
              method.isEnabled ? undefined : `Включить «${method.name}» для всех клиентов?`,
            )
          }
        >
          {method.isEnabled ? "Выключить" : "Включить"}
        </Button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr]">
        <label className="text-xs text-slate-500">
          Название для клиентов
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="text-xs text-slate-500">
          Провайдер
          <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {!known && <option value={method.provider}>{method.provider}</option>}
            {providers.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
                {p.configured ? "" : " — нет ключей"}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-slate-500">
          Комиссия, %
          <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" />
        </label>
        <label className="text-xs text-slate-500">
          Порядок
          <Input value={order} onChange={(e) => setOrder(e.target.value)} inputMode="numeric" />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      {dirty && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" disabled={busy} onClick={saveEdits}>
            {busy ? "…" : "Сохранить"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setName(method.name);
              setProvider(method.provider);
              setFee(String(Number(method.feePercent)));
              setOrder(String(method.sortOrder));
              setError(null);
            }}
          >
            Отмена
          </Button>
        </div>
      )}
    </div>
  );
}

function NewPaymentMethod({
  codes,
  providers,
  onCreated,
}: {
  codes: PaymentMethodDto["code"][];
  providers: PaymentProviderInfoDto[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(codes[0]);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState(providers[0]?.key ?? "manual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        + Добавить способ оплаты
      </Button>
    );
  }

  async function create() {
    if (!name.trim()) return setError("Введите название");
    setBusy(true);
    setError(null);
    try {
      if (!code) return;
      await api.createPaymentMethod({ code, name: name.trim(), provider });
      setOpen(false);
      setName("");
      onCreated();
    } catch (err) {
      setError(paymentError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_2fr]">
        <label className="text-xs text-slate-500">
          Код
          <Select value={code} onChange={(e) => setCode(e.target.value as PaymentMethodDto["code"])}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-slate-500">
          Название для клиентов
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Например, СБП" />
        </label>
        <label className="text-xs text-slate-500">
          Провайдер
          <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
                {p.configured ? "" : " — нет ключей"}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-400">Создаётся выключенным — включите после тестового платежа.</p>
      {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={busy} onClick={create}>
          {busy ? "…" : "Создать"}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
