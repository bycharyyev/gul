import { useEffect, useState } from "react";
import type { AdminEconomicsDto, MarketplaceSettingsDto, ServiceCostDto, UpdateMarketplaceSettingsInput } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Fetches this page's whole payload independently per card, rather than once for the whole page,
 * so a single stream's network hiccup shows an error on its own card instead of blanking
 * everything else that loaded fine (per Designer's spec). `days` is `null` for a card that must
 * never refetch when the date-range selector changes (only the seller-float card today) --
 * the backend always computes every stream in the same response regardless of the value sent, so
 * `null` still sends a fixed `days` value, it just never changes.
 */
function useEconomicsSection<T>(days: number | null, select: (dto: AdminEconomicsDto) => T) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .getAdminEconomics(days ?? 30)
      .then((dto) => {
        if (cancelled) return;
        setData(select(dto));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `select` is a fresh closure every render by design (it captures nothing but the response
    // shape) -- only `days` and an explicit retry should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, retryToken]);

  return { data, loading, error, retry: () => setRetryToken((n) => n + 1) };
}

/** Shared loading / error+retry chrome for a card whose data hasn't arrived yet. Returns null
 *  once there is data to show, so the caller renders its real content instead. */
function SectionStatus({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (loading) return <p className="py-6 text-center text-sm text-slate-400">{t("common.loading")}</p>;
  if (error) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-700">
        <span>Не удалось загрузить данные</span>
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          Повторить
        </button>
      </div>
    );
  }
  return null;
}

function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right">
        <span className="font-semibold tabular-nums">{value}</span>
        {hint && <span className="ml-1.5 text-xs text-slate-400">{hint}</span>}
      </span>
    </div>
  );
}

function fmt(n: number) {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} TMT`;
}

export default function EconomicsPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);

  const topups = useEconomicsSection(days, (d) => d.topups);
  const gallery = useEconomicsSection(days, (d) => d.gallery);
  const purchases = useEconomicsSection(days, (d) => d.marketplacePurchases);
  const cargo = useEconomicsSection(days, (d) => d.cargo);
  const referralCost = useEconomicsSection(days, (d) => d.referralCost);
  // Never refetched by the date-range selector: a point-in-time balance, not a period total.
  const sellerFloat = useEconomicsSection(null, (d) => d.sellerFloat);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Экономика</h1>
          <p className="mt-1 text-sm text-slate-500">
            Валовая выручка и издержки по потокам — не итоговая прибыль. Маржа пополнений
            считается только по заказам, у которых при создании была задана себестоимость
            сервиса (см. docs/analysis/UNIT_ECONOMICS.md, находка E-01), поэтому общей суммы
            «прибыль» здесь намеренно нет.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                days === d ? "bg-white shadow-sm text-brand-700" : "text-slate-500"
              }`}
            >
              {t("admin.dashboard.daysButton", { days: d })}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- Top-ups ---- */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Пополнения</h2>
          <SectionStatus loading={topups.loading} error={topups.error} onRetry={topups.retry} />
          {!topups.loading && !topups.error && topups.data && (
            topups.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Нет завершённых заказов за период</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {topups.data.map((row) => (
                  <div key={`${row.serviceCode}-${row.currency}`} className="py-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-slate-400">
                        {row.serviceCode} · {row.currency}
                      </span>
                      <span className="text-xs text-slate-400">{row.count} заказ(ов)</span>
                    </div>
                    <StatRow label="Валовый оборот (GMV)" value={fmt(row.gmvTmt)} />
                    <StatRow label="Комиссии, удержанные с заказа" value={fmt(row.feesTmt)} />
                    <StatRow label="Средний чек" value={fmt(row.avgAmountTmt)} />
                    {row.costedCount > 0 ? (
                      <StatRow
                        label="Маржа на номинале"
                        value={fmt(row.costedGmvTmt - row.costTmt)}
                        hint={row.costedCount < row.count ? `по ${row.costedCount} из ${row.count}` : undefined}
                      />
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Маржа: себестоимость не задана</p>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </Card>

        {/* ---- Cost basis per service: the input behind the top-up margin above ---- */}
        <ServiceCostCard />

        {/* ---- Take-rate setting: directly above the gallery-sales card ---- */}
        <TakeRateCard />

        {/* ---- Gallery marketplace sales ---- */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Продажи в галерее (маркетплейс)</h2>
          <SectionStatus loading={gallery.loading} error={gallery.error} onRetry={gallery.retry} />
          {!gallery.loading && !gallery.error && gallery.data && (
            <div>
              <StatRow label="Валовые продажи (GMV)" value={fmt(gallery.data.grossSalesTmt)} />
              <StatRow label="Выручка от рекламы продавцов" value={fmt(gallery.data.adRevenueTmt)} />
              {gallery.data.platformFeeTmt > 0 ? (
                <StatRow label="Комиссия платформы с продаж" value={fmt(gallery.data.platformFeeTmt)} />
              ) : (
                <p className="mt-1 text-xs text-slate-400">0% — комиссия не установлена</p>
              )}
            </div>
          )}
        </Card>

        {/* ---- Marketplace purchases (buy-for-the-customer) ---- */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Выкуп с зарубежных маркетплейсов</h2>
          <SectionStatus loading={purchases.loading} error={purchases.error} onRetry={purchases.retry} />
          {!purchases.loading && !purchases.error && purchases.data && (
            purchases.data.count === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Нет доставленных заказов за период</p>
            ) : (
              <div>
                <StatRow label="Доставлено заказов" value={String(purchases.data.count)} />
                <StatRow label="Сервисные сборы" value={fmt(purchases.data.serviceFeesTmt)} />
                <StatRow label="Доставка (оплачено клиентом)" value={fmt(purchases.data.shippingTmt)} />
              </div>
            )
          )}
        </Card>

        {/* ---- Cargo ---- */}
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Карго</h2>
          <SectionStatus loading={cargo.loading} error={cargo.error} onRetry={cargo.retry} />
          {!cargo.loading && !cargo.error && cargo.data && (
            cargo.data.count === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Нет оплаченных отправлений за период</p>
            ) : (
              <div>
                <StatRow label="Оплаченных отправлений" value={String(cargo.data.count)} />
                <StatRow label="Тарифная выручка" value={fmt(cargo.data.tariffRevenueTmt)} />
              </div>
            )
          )}
        </Card>

        {/* ---- Referral cost: distinguished from the plain revenue cards by the "Издержка" label
             badge alone, never a card-level color treatment -- amber and rose are both already
             spoken for elsewhere in this app (pending/warning and error, respectively), and this
             card is neither of those, so no tint reads correctly here. Zinc is unused anywhere
             else in apps/admin, so it carries no borrowed status meaning. ---- */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-500">Реферальная программа</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
              Издержка
            </span>
          </div>
          <SectionStatus loading={referralCost.loading} error={referralCost.error} onRetry={referralCost.retry} />
          {!referralCost.loading && !referralCost.error && referralCost.data && (
            referralCost.data.count === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Нет выплаченных наград за период</p>
            ) : (
              <div>
                <StatRow label="Начислено наград" value={String(referralCost.data.count)} />
                <StatRow label="Выплачено (деньги, ушедшие с платформы)" value={fmt(referralCost.data.costTmt)} />
              </div>
            )
          )}
        </Card>

        {/* ---- Seller ad pricing: a setting, full width, before the float row ---- */}
        <AdPricingCard />

        {/* ---- Seller float: point-in-time liability, own full-width row, neutral background ---- */}
        <Card className="border-slate-300 bg-slate-50 p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">Остаток на балансах продавцов</h2>
          <SectionStatus loading={sellerFloat.loading} error={sellerFloat.error} onRetry={sellerFloat.retry} />
          {!sellerFloat.loading && !sellerFloat.error && sellerFloat.data && (
            <StatRow label="Сумма, которую платформа должна продавцам (Seller.balanceTmt)" value={fmt(sellerFloat.data.owedTmt)} />
          )}
          <p className="mt-3 text-xs text-slate-500">
            Остаток на момент загрузки страницы — не зависит от выбранного периода и не меняется
            при переключении диапазона дат выше. Деньги выводятся вручную (заявки на вывод).
          </p>
        </Card>
      </div>
    </div>
  );
}

/** Parses a cost-percent input: "" clears the cost (null), otherwise 0..100 with ≤2 decimals. */
function parseCostPercent(raw: string): number | null | undefined {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100 || Math.round(n * 100) !== n * 100) return undefined;
  return n;
}

function ServiceCostCard() {
  const [rows, setRows] = useState<ServiceCostDto[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toDraft = (r: ServiceCostDto) => (r.costPercent === null ? "" : String(r.costPercent));

  function load() {
    setLoading(true);
    setLoadError(false);
    api
      .listServiceCosts()
      .then((list) => {
        setRows(list);
        setDrafts(Object.fromEntries(list.map((r) => [r.serviceId, toDraft(r)])));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function save(row: ServiceCostDto) {
    const parsed = parseCostPercent(drafts[row.serviceId] ?? "");
    if (parsed === undefined) return;
    setSavingId(row.serviceId);
    setSaveError(null);
    try {
      const updated = await api.setServiceCost(row.serviceId, parsed);
      setRows((prev) => prev?.map((r) => (r.serviceId === updated.serviceId ? updated : r)) ?? null);
      setDrafts((d) => ({ ...d, [updated.serviceId]: toDraft(updated) }));
    } catch {
      setSaveError(`Не удалось сохранить себестоимость ${row.code} (нужна роль ADMIN)`);
      setDrafts((d) => ({ ...d, [row.serviceId]: toDraft(row) }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-500">Себестоимость сервисов пополнения</h2>
      {loading && <p className="py-6 text-center text-sm text-slate-400">Загрузка…</p>}
      {!loading && loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-700">
          <span>Не удалось загрузить себестоимость</span>
          <button type="button" onClick={load} className="font-semibold underline underline-offset-2">
            Повторить
          </button>
        </div>
      )}
      {!loading && !loadError && rows && (
        <>
          {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Нет сервисов</p>}
          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
              const draft = drafts[row.serviceId] ?? "";
              const parsed = parseCostPercent(draft);
              const unchanged = parsed === row.costPercent;
              const busy = savingId === row.serviceId;
              return (
                <div key={row.serviceId} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{row.name}</div>
                    <div className="text-xs uppercase text-slate-400">{row.code}</div>
                  </div>
                  <div className="relative w-28">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      placeholder="не задана"
                      aria-label={`Себестоимость ${row.code}, %`}
                      aria-invalid={parsed === undefined}
                      value={draft}
                      disabled={busy}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.serviceId]: e.target.value }))}
                      className="pr-7"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                  </div>
                  <Button type="button" onClick={() => save(row)} disabled={busy || parsed === undefined || unchanged}>
                    {busy ? "…" : "Сохранить"}
                  </Button>
                </div>
              );
            })}
          </div>
          {saveError && <p className="mt-2 text-xs text-rose-600">{saveError}</p>}
          <p className="mt-3 text-xs text-slate-400">
            Сколько процентов от номинала пополнения платформа платит поставщику (например, 97,5).
            Фиксируется в заказе в момент создания: изменение влияет только на новые заказы. Пустое
            поле — себестоимость не задана, маржа по таким заказам не считается. Маржа на номинале
            не учитывает курсовую разницу и комиссии эквайринга.
          </p>
        </>
      )}
    </Card>
  );
}

const MAX_TAKE_RATE = 100;
const MIN_TAKE_RATE = 0;

function TakeRateCard() {
  const [settings, setSettings] = useState<MarketplaceSettingsDto | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(false);
    api
      .getMarketplaceSettings()
      .then((s) => {
        setSettings(s);
        setDraft(String(s.takeRatePercent));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function validate(raw: string): number | null {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < MIN_TAKE_RATE || n > MAX_TAKE_RATE) return null;
    return n;
  }

  const parsed = validate(draft);
  const isInvalid = draft.trim() !== "" && parsed === null;

  async function save() {
    if (!settings || parsed === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateMarketplaceSettings({ takeRatePercent: parsed });
      setSettings(updated);
      setDraft(String(updated.takeRatePercent));
    } catch {
      setSaveError("Не удалось сохранить ставку");
      // Revert to the last value actually saved on the server, not what was typed.
      setDraft(String(settings.takeRatePercent));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-500">Комиссия маркетплейса (take rate)</h2>
      {loading && <p className="py-6 text-center text-sm text-slate-400">Загрузка…</p>}
      {!loading && loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-700">
          <span>Не удалось загрузить настройку</span>
          <button type="button" onClick={load} className="font-semibold underline underline-offset-2">
            Повторить
          </button>
        </div>
      )}
      {!loading && !loadError && settings && (
        <>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Ставка, % от суммы продажи</label>
              <div className="relative">
                <Input
                  type="number"
                  min={MIN_TAKE_RATE}
                  max={MAX_TAKE_RATE}
                  step="0.01"
                  value={draft}
                  disabled={saving}
                  onChange={(e) => setDraft(e.target.value)}
                  className="pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
              </div>
            </div>
            <Button type="button" onClick={save} disabled={saving || isInvalid}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
          {isInvalid && <p className="mt-2 text-xs text-rose-600">Введите число от 0 до 100</p>}
          {saveError && <p className="mt-2 text-xs text-rose-600">{saveError}</p>}
          <p className="mt-3 text-xs text-slate-400">
            Применяется только к новым продажам, оформленным после сохранения — уже размещённые
            заказы сохраняют ставку, действовавшую в момент заказа.{" "}
            {settings.takeRatePercent === 0 && "Сейчас 0% — продавцы получают 100% суммы продажи."}
          </p>
        </>
      )}
    </Card>
  );
}

type AdPricingField = "storyAdPriceTmt" | "storyAdDurationDays" | "slideAdPriceTmt" | "slideAdDurationDays";

const AD_PRICING_FIELDS: { key: AdPricingField; label: string; unit: string; min: number; max: number; integer: boolean }[] = [
  { key: "storyAdPriceTmt", label: "История — цена", unit: "TMT", min: 0, max: 100000, integer: false },
  { key: "storyAdDurationDays", label: "История — срок показа", unit: "дн.", min: 1, max: 365, integer: true },
  { key: "slideAdPriceTmt", label: "Слайд на главной — цена", unit: "TMT", min: 0, max: 100000, integer: false },
  { key: "slideAdDurationDays", label: "Слайд на главной — срок показа", unit: "дн.", min: 1, max: 365, integer: true },
];

/** Prices sellers pay for story and home-slide ads -- were constants in code (E-05). */
function AdPricingCard() {
  const [settings, setSettings] = useState<MarketplaceSettingsDto | null>(null);
  const [draft, setDraft] = useState<Record<AdPricingField, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toDraft = (s: MarketplaceSettingsDto) =>
    Object.fromEntries(AD_PRICING_FIELDS.map((f) => [f.key, String(s[f.key])])) as Record<AdPricingField, string>;

  function load() {
    setLoading(true);
    setLoadError(false);
    api
      .getMarketplaceSettings()
      .then((s) => {
        setSettings(s);
        setDraft(toDraft(s));
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function parse(field: (typeof AD_PRICING_FIELDS)[number], raw: string): number | null {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < field.min || n > field.max) return null;
    if (field.integer && !Number.isInteger(n)) return null;
    // At most two decimals, compared with a tolerance: 0.29 * 100 is 28.999999999999996 in floating point.
    if (!field.integer && Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return null;
    return n;
  }

  const parsed = draft ? AD_PRICING_FIELDS.map((f) => ({ field: f, value: parse(f, draft[f.key]) })) : [];
  const hasInvalid = parsed.some((p) => p.value === null);
  const changed = settings ? parsed.filter((p) => p.value !== null && p.value !== settings[p.field.key]) : [];

  async function save() {
    if (!settings || hasInvalid || changed.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const input: UpdateMarketplaceSettingsInput = Object.fromEntries(
        changed.map((p) => [p.field.key, p.value as number]),
      );
      const updated = await api.updateMarketplaceSettings(input);
      setSettings(updated);
      setDraft(toDraft(updated));
    } catch {
      setSaveError("Не удалось сохранить цены рекламы");
      setDraft(toDraft(settings));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold text-slate-500">Цены рекламы для продавцов</h2>
      {loading && <p className="py-6 text-center text-sm text-slate-400">Загрузка…</p>}
      {!loading && loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-3 text-sm text-rose-700">
          <span>Не удалось загрузить настройки</span>
          <button type="button" onClick={load} className="font-semibold underline underline-offset-2">
            Повторить
          </button>
        </div>
      )}
      {!loading && !loadError && settings && draft && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {AD_PRICING_FIELDS.map((f) => {
              const invalid = parse(f, draft[f.key]) === null;
              return (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-slate-500">{f.label}</label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={f.min}
                      max={f.max}
                      step={f.integer ? "1" : "0.01"}
                      value={draft[f.key]}
                      disabled={saving}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      className="pr-12"
                      aria-invalid={invalid}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      {f.unit}
                    </span>
                  </div>
                  {invalid && (
                    <p className="mt-1 text-xs text-rose-600">
                      {f.integer ? `Целое число от ${f.min} до ${f.max}` : `Число от ${f.min} до ${f.max}, до 2 знаков`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Применяется к рекламе, купленной после сохранения: уже оплаченная реклама сохраняет свою
              цену и срок.
            </p>
            <Button type="button" onClick={save} disabled={saving || hasInvalid || changed.length === 0}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
          {saveError && <p className="mt-2 text-xs text-rose-600">{saveError}</p>}
        </>
      )}
    </Card>
  );
}
