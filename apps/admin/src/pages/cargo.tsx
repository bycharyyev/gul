import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  CargoBannerAdminDto,
  CargoCityDto,
  CargoExchangeRateDto,
  CargoItemTypeAdminDto,
  CargoTariffBracketDto,
  ShipmentListItemDto,
} from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

type BracketDraftRow = { minWeightKg: string; pricePerKgRub: string; pickupFeeRub: string };

function ExchangeRateCard() {
  const { t, locale } = useTranslation();
  const [rate, setRate] = useState<CargoExchangeRateDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ rubPerUsd: "", tmtPerUsd: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.getCargoExchangeRate();
    setRate(data);
    if (data) setForm({ rubPerUsd: String(data.rubPerUsd), tmtPerUsd: String(data.tmtPerUsd) });
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.rubPerUsd || !form.tmtPerUsd) return;
    setBusy(true);
    try {
      const updated = await api.updateCargoExchangeRate({
        rubPerUsd: Number(form.rubPerUsd),
        tmtPerUsd: Number(form.tmtPerUsd),
      });
      setRate(updated);
    } finally {
      setBusy(false);
    }
  }

  const impliedRubPerTmt =
    form.rubPerUsd && form.tmtPerUsd ? (Number(form.rubPerUsd) / Number(form.tmtPerUsd)).toFixed(2) : null;

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-500">{t("admin.cargo.exchangeRateTitle")}</h2>
      <p className="mb-3 text-xs text-slate-400">{t("admin.cargo.exchangeRateHint")}</p>
      {loaded && !rate && <p className="mb-3 text-xs text-amber-600">{t("admin.cargo.exchangeRateNotSet")}</p>}
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">{t("admin.cargo.rubPerUsd")}</label>
          <Input
            type="number"
            min={0}
            step="0.0001"
            className="w-32"
            value={form.rubPerUsd}
            onChange={(e) => setForm({ ...form, rubPerUsd: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">{t("admin.cargo.tmtPerUsd")}</label>
          <Input
            type="number"
            min={0}
            step="0.0001"
            className="w-32"
            value={form.tmtPerUsd}
            onChange={(e) => setForm({ ...form, tmtPerUsd: e.target.value })}
          />
        </div>
        <Button type="submit" size="sm" disabled={busy || !form.rubPerUsd || !form.tmtPerUsd}>
          {t("admin.cargo.saveExchangeRate")}
        </Button>
        {impliedRubPerTmt && (
          <span className="text-xs text-slate-400">{t("admin.cargo.impliedRubPerTmt", { rate: impliedRubPerTmt })}</span>
        )}
      </form>
      {rate && (
        <p className="mt-2 text-xs text-slate-400">
          {t("admin.cargo.exchangeRateUpdatedAt")} {new Date(rate.updatedAt).toLocaleString(LOCALE_BCP47[locale])}
        </p>
      )}
    </Card>
  );
}

const STATUS_OPTIONS = [
  "",
  "PENDING_PAYMENT",
  "PAID",
  "PICKUP_REQUESTED",
  "PICKUP_CONFIRMED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_DESTINATION",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "ON_HOLD",
  "EXCEPTION",
];

/**
 * Origin and destination are two independent lists: every enabled destination can receive from
 * every enabled origin, so there is nothing to pair up here -- adding a Russian city makes it
 * available to all six provinces at once.
 */
function CitiesPanel() {
  const { t } = useTranslation();
  const [cities, setCities] = useState<CargoCityDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ role: "ORIGIN" | "DESTINATION"; country: string; name: string }>({
    role: "ORIGIN",
    country: "RU",
    name: "",
  });

  async function load() {
    setCities(await api.listCargoCitiesAdmin());
  }

  useEffect(() => {
    load();
  }, []);

  async function addCity(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api.createCargoCity({ ...form, name: form.name.trim() });
      setForm({ ...form, name: "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(city: CargoCityDto) {
    setBusy(true);
    try {
      await api.updateCargoCity(city.id, { isEnabled: !city.isEnabled });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const origins = cities.filter((c) => c.role === "ORIGIN");
  const destinations = cities.filter((c) => c.role === "DESTINATION");

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.cargo.citiesTitle")}</h2>

      <form onSubmit={addCity} className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-100 p-3 sm:grid-cols-4">
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "ORIGIN" | "DESTINATION" })}>
          <option value="ORIGIN">{t("admin.cargo.roleOrigin")}</option>
          <option value="DESTINATION">{t("admin.cargo.roleDestination")}</option>
        </Select>
        <Input
          placeholder={t("admin.cargo.country")}
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value })}
          required
        />
        <Input
          placeholder={t("admin.cargo.cityName")}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Button type="submit" size="sm" disabled={busy}>
          {t("admin.cargo.addCity")}
        </Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { label: t("admin.cargo.roleOrigin"), list: origins },
          { label: t("admin.cargo.roleDestination"), list: destinations },
        ].map((column) => (
          <div key={column.label}>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">{column.label}</p>
            <div className="space-y-1">
              {column.list.length === 0 && <p className="text-xs text-slate-400">{t("admin.cargo.noCities")}</p>}
              {column.list.map((city) => (
                <div key={city.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span className={city.isEnabled ? "" : "text-slate-400 line-through"}>
                    {city.name} <span className="text-xs text-slate-400">{city.country}</span>
                  </span>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => toggle(city)}>
                    {city.isEnabled ? t("admin.cargo.disable") : t("admin.cargo.enable")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * What is shipped decides how it is priced. A per-item type quotes a flat RUB price per unit and
 * ignores weight; a per-kg type is priced from the weight brackets below and can set the minimum
 * the partner will accept. Editing is by `code`, so the three real types stay stable identities.
 */
function ItemTypesPanel() {
  const { t } = useTranslation();
  const [types, setTypes] = useState<CargoItemTypeAdminDto[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    code: "",
    name: "",
    description: "",
    pricingUnit: "PER_KG" as "PER_KG" | "PER_ITEM",
    pricePerItemRub: "",
    minWeightKg: "",
    isEnabled: true,
  });
  const [busy, setBusy] = useState(false);

  async function load() {
    setTypes(await api.listCargoItemTypesAdmin());
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(type: CargoItemTypeAdminDto) {
    setEditing(type.id);
    setDraft({
      code: type.code,
      name: type.name,
      description: type.description ?? "",
      pricingUnit: type.pricingUnit,
      pricePerItemRub: type.pricePerItemRub === null ? "" : String(type.pricePerItemRub),
      minWeightKg: type.minWeightKg === null ? "" : String(type.minWeightKg),
      isEnabled: type.isEnabled,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.upsertCargoItemType({
        code: draft.code,
        name: draft.name,
        description: draft.description || undefined,
        pricingUnit: draft.pricingUnit,
        // The API rejects a price on a weighed type and demands one on a counted type, so send
        // exactly the field that applies rather than both.
        pricePerItemRub: draft.pricingUnit === "PER_ITEM" ? Number(draft.pricePerItemRub) : null,
        minWeightKg: draft.pricingUnit === "PER_KG" && draft.minWeightKg ? Number(draft.minWeightKg) : null,
        isEnabled: draft.isEnabled,
      });
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">{t("admin.cargo.itemTypesTitle")}</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setEditing("new");
            setDraft({
              code: "",
              name: "",
              description: "",
              pricingUnit: "PER_KG",
              pricePerItemRub: "",
              minWeightKg: "",
              isEnabled: true,
            });
          }}
        >
          {t("admin.cargo.newItemType")}
        </Button>
      </div>

      {editing && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-lg border border-slate-100 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              placeholder={t("admin.cargo.itemTypeCode")}
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              disabled={editing !== "new"}
              required
            />
            <Input
              placeholder={t("admin.cargo.itemTypeName")}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
          </div>
          <Input
            placeholder={t("admin.cargo.itemTypeDescription")}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={draft.pricingUnit}
              onChange={(e) => setDraft({ ...draft, pricingUnit: e.target.value as "PER_KG" | "PER_ITEM" })}
            >
              <option value="PER_KG">{t("admin.cargo.perKg")}</option>
              <option value="PER_ITEM">{t("admin.cargo.perItem")}</option>
            </Select>
            {draft.pricingUnit === "PER_ITEM" ? (
              <Input
                type="number"
                min={0.01}
                step="0.01"
                placeholder={t("admin.cargo.pricePerItemRub")}
                value={draft.pricePerItemRub}
                onChange={(e) => setDraft({ ...draft, pricePerItemRub: e.target.value })}
                required
              />
            ) : (
              <Input
                type="number"
                min={0}
                step="0.1"
                placeholder={t("admin.cargo.minWeightKgLabel")}
                value={draft.minWeightKg}
                onChange={(e) => setDraft({ ...draft, minWeightKg: e.target.value })}
              />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isEnabled}
              onChange={(e) => setDraft({ ...draft, isEnabled: e.target.checked })}
            />
            {t("admin.cargo.itemTypeEnabled")}
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {t("admin.cargo.save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
              {t("admin.cargo.cancel")}
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {types.map((type) => (
          <div key={type.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <div>
              <span className={type.isEnabled ? "font-medium" : "font-medium text-slate-400 line-through"}>
                {type.name}
              </span>
              <span className="ml-2 text-xs text-slate-400">
                {type.pricingUnit === "PER_ITEM"
                  ? `${type.pricePerItemRub} RUB/${t("admin.cargo.pcs")}`
                  : type.minWeightKg
                    ? `${t("admin.cargo.perKg")}, ${t("admin.cargo.minShort")} ${type.minWeightKg} kg`
                    : t("admin.cargo.perKg")}
              </span>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(type)}>
              {t("admin.cargo.edit")}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** One global bracket set, priced against every direction -- see CargoService.setTariffBrackets. */
function TariffPanel({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const [brackets, setBrackets] = useState<CargoTariffBracketDto[]>([]);
  const [draft, setDraft] = useState<BracketDraftRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    // The public directions payload is the same source the customer form prices from, so admin
    // reads exactly what a customer would be quoted rather than a separate view of it.
    const data = await api.listCargoDirections();
    setBrackets(
      data.weightBrackets.map((b, i) => ({
        id: String(i),
        minWeightKg: b.minWeightKg,
        pricePerKgRub: b.pricePerKgRub,
        pickupFeeRub: b.pickupFeeRub,
        isActive: true,
      })),
    );
  }

  useEffect(() => {
    load();
  }, []);

  function startEditing() {
    setDraft(
      brackets.length > 0
        ? brackets.map((b) => ({
            minWeightKg: String(b.minWeightKg),
            pricePerKgRub: String(b.pricePerKgRub),
            pickupFeeRub: String(b.pickupFeeRub),
          }))
        : [{ minWeightKg: "0", pricePerKgRub: "", pickupFeeRub: "0" }],
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const rows = draft
      .filter((b) => b.minWeightKg !== "" && b.pricePerKgRub !== "")
      .map((b) => ({
        minWeightKg: Number(b.minWeightKg),
        pricePerKgRub: Number(b.pricePerKgRub),
        pickupFeeRub: Number(b.pickupFeeRub || 0),
      }));
    if (rows.length === 0) return;
    setBusy(true);
    try {
      await api.setCargoTariffBrackets({ brackets: rows });
      setDraft(null);
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">{t("admin.cargo.tariffTitle")}</h2>
        {!draft && (
          <Button size="sm" variant="secondary" onClick={startEditing}>
            {brackets.length > 0 ? t("admin.cargo.editTariff") : t("admin.cargo.setTariff")}
          </Button>
        )}
      </div>

      {!draft && (
        <div className="space-y-1">
          {brackets.length === 0 && <p className="text-xs text-slate-400">{t("admin.cargo.noActiveTariff")}</p>}
          {brackets.map((b) => (
            <div key={b.id} className="text-xs text-slate-500">
              {t("admin.cargo.bracketFrom", { weight: b.minWeightKg })}: {b.pricePerKgRub} RUB/kg
              {Number(b.pickupFeeRub) > 0 ? ` + ${b.pickupFeeRub} RUB` : ""}
            </div>
          ))}
        </div>
      )}

      {draft && (
        <form onSubmit={save} className="space-y-2">
          {draft.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder={t("admin.cargo.minWeightKg")}
                className="w-28"
                value={row.minWeightKg}
                onChange={(e) => setDraft(draft.map((r, j) => (j === i ? { ...r, minWeightKg: e.target.value } : r)))}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder={t("admin.cargo.pricePerKg")}
                className="w-36"
                value={row.pricePerKgRub}
                onChange={(e) => setDraft(draft.map((r, j) => (j === i ? { ...r, pricePerKgRub: e.target.value } : r)))}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder={t("admin.cargo.pickupFee")}
                className="w-36"
                value={row.pickupFeeRub}
                onChange={(e) => setDraft(draft.map((r, j) => (j === i ? { ...r, pickupFeeRub: e.target.value } : r)))}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={draft.length <= 1}
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}
              >
                {t("admin.cargo.removeBracket")}
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setDraft([...draft, { minWeightKg: "", pricePerKgRub: "", pickupFeeRub: "0" }])}
            >
              {t("admin.cargo.addBracket")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {t("admin.cargo.saveBrackets")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {t("admin.cargo.cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/** Ad slot shown at the top of the customer-facing Cargo pages. */
function BannersPanel() {
  const { t } = useTranslation();
  const [banners, setBanners] = useState<CargoBannerAdminDto[]>([]);
  const [draft, setDraft] = useState<{ id?: string; title: string; subtitle: string; imageUrl: string; linkUrl: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function load() {
    setBanners(await api.listCargoBannersAdmin());
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      await api.upsertCargoBanner({
        id: draft.id,
        title: draft.title,
        subtitle: draft.subtitle || undefined,
        imageUrl: draft.imageUrl,
        linkUrl: draft.linkUrl || undefined,
      });
      setDraft(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.deleteCargoBanner(id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">{t("admin.cargo.bannersTitle")}</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setDraft({ title: "", subtitle: "", imageUrl: "", linkUrl: "" })}
        >
          {t("admin.cargo.newBanner")}
        </Button>
      </div>

      {draft && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-lg border border-slate-100 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              placeholder={t("admin.cargo.bannerTitle")}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              required
            />
            <Input
              placeholder={t("admin.cargo.bannerSubtitle")}
              value={draft.subtitle}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
            />
          </div>
          <Input
            placeholder={t("admin.cargo.bannerImageUrl")}
            value={draft.imageUrl}
            onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
            required
          />
          <Input
            placeholder={t("admin.cargo.bannerLinkUrl")}
            value={draft.linkUrl}
            onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {t("admin.cargo.save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              {t("admin.cargo.cancel")}
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {banners.length === 0 && <p className="text-xs text-slate-400">{t("admin.cargo.noBanners")}</p>}
        {banners.map((banner) => (
          <div key={banner.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <div className="flex min-w-0 items-center gap-3">
              <img src={banner.imageUrl} alt="" className="h-8 w-14 shrink-0 rounded object-cover" />
              <span className={banner.isEnabled ? "truncate" : "truncate text-slate-400 line-through"}>{banner.title}</span>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDraft({
                    id: banner.id,
                    title: banner.title,
                    subtitle: banner.subtitle ?? "",
                    imageUrl: banner.imageUrl,
                    linkUrl: banner.linkUrl ?? "",
                  })
                }
              >
                {t("admin.cargo.edit")}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => remove(banner.id)}>
                {t("admin.cargo.delete")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function CargoPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<ShipmentListItemDto[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api.listShipmentsAdmin({ status: status || undefined, search: search || undefined });
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.cargo.title")}</h1>

      <ExchangeRateCard />

      <CitiesPanel />

      <ItemTypesPanel />

      <TariffPanel onChanged={load} />

      <BannersPanel />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <h2 className="mr-auto text-sm font-semibold text-slate-500">{t("admin.cargo.shipmentsTitle")}</h2>
          <Input
            placeholder={t("admin.cargo.searchPlaceholder")}
            className="w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s || t("admin.cargo.allStatuses")}
              </option>
            ))}
          </Select>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.cargo.colTracking")}</th>
              <th className="px-4 py-3">{t("admin.cargo.colCustomer")}</th>
              <th className="px-4 py-3">{t("admin.cargo.colRoute")}</th>
              <th className="px-4 py-3">{t("admin.cargo.colCargoType")}</th>
              <th className="px-4 py-3">{t("admin.cargo.colWeight")}</th>
              <th className="px-4 py-3">{t("admin.cargo.colPrice")}</th>
              <th className="px-4 py-3">{t("admin.cargo.colStatus")}</th>
              <th className="px-4 py-3">{t("admin.cargo.colCreated")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loading &&
              items.map((s) => (
                <tr key={s.id} onClick={() => navigate(`/cargo/${s.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{s.publicTrackingNumber}</td>
                  <td className="px-4 py-3">{s.user.fullName || s.user.phone}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.originCity.name} → {s.destinationCity.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{s.itemType.name}</td>
                  {/* Weighed or counted, never both -- show whichever this shipment was billed on. */}
                  <td className="px-4 py-3">
                    {s.declaredWeightKg !== null ? `${s.declaredWeightKg} kg` : `${s.quantity} ${t("admin.cargo.pcs")}`}
                  </td>
                  <td className="px-4 py-3">{s.totalPriceTmt} TMT</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(s.createdAt).toLocaleString(LOCALE_BCP47[locale])}</td>
                </tr>
              ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-400">
                  {t("admin.cargo.noShipments")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
