import { useEffect, useState } from "react";
import type { AdminEconomicsDto, MarketplaceSettingsDto } from "@topup-hub/types";
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
            Валовая выручка и издержки по потокам — не итоговая прибыль. Себестоимость товаров и
            услуг в базе не отслеживается (см. docs/analysis/UNIT_ECONOMICS.md, находка E-01), так
            что общей суммы «прибыль» здесь намеренно нет.
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
                  </div>
                ))}
              </div>
            )
          )}
        </Card>

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

        {/* ---- Referral cost: styled distinctly as a cost, never a negative number ---- */}
        <Card className="border-rose-200 bg-rose-50/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-500">Реферальная программа</h2>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-700">
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
