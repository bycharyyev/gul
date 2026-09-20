import { useEffect, useMemo, useState } from "react";
import type {
  CountryOptionDto,
  PushAudience,
  PushAudiencePreviewDto,
  PushCampaignDetailDto,
  PushCampaignDto,
  PushTemplateDto,
} from "@topup-hub/types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/stat-card";
import { ContentEditor } from "./content-editor";
import {
  CATEGORY_LABELS,
  LOCALE_OPTIONS,
  ROLE_OPTIONS,
  STATUS_LABELS,
  countryName,
  draftIsValid,
  draftToInput,
  emptyDraft,
  errorText,
  formatDateTime,
  type ContentDraft,
} from "./shared";
import { confirmAction } from "@/lib/confirm";

function StatusPill({ status }: { status: PushCampaignDto["status"] }) {
  const meta = STATUS_LABELS[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}>{meta.label}</span>;
}

function audienceLabel(audience: PushAudience, names: Map<string, string>): string {
  if (audience.type === "ALL") return "Все с приложением";
  if (audience.type === "USERS") return `Выбранные люди (${audience.userIds?.length ?? 0})`;
  const parts: string[] = [];
  if (audience.countries?.length) parts.push(audience.countries.map((c) => countryName(c, names)).join(", "));
  if (audience.locales?.length) parts.push(audience.locales.join("/"));
  if (audience.roles?.length) parts.push(audience.roles.map((r) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r).join(", "));
  return parts.join(" · ") || "Фильтр";
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
        active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// ---- Create ----

function CampaignForm({
  templates,
  countries,
  onDone,
  onCancel,
}: {
  templates: PushTemplateDto[];
  countries: CountryOptionDto[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<ContentDraft>(emptyDraft);
  const [mode, setMode] = useState<"ALL" | "FILTER">("ALL");
  const [selCountries, setSelCountries] = useState<string[]>([]);
  const [selLocales, setSelLocales] = useState<string[]>([]);
  const [selRoles, setSelRoles] = useState<string[]>([]);
  const [when, setWhen] = useState<"draft" | "now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [preview, setPreview] = useState<PushAudiencePreviewDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audience: PushAudience = useMemo(
    () =>
      mode === "ALL"
        ? { type: "ALL" }
        : {
            type: "FILTER",
            ...(selCountries.length ? { countries: selCountries } : {}),
            ...(selLocales.length ? { locales: selLocales } : {}),
            ...(selRoles.length ? { roles: selRoles } : {}),
          },
    [mode, selCountries, selLocales, selRoles],
  );
  const filterEmpty = mode === "FILTER" && !selCountries.length && !selLocales.length && !selRoles.length;

  useEffect(() => {
    if (filterEmpty) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .previewPushAudience(audience)
        .then((p) => {
          setPreview(p);
          setPreviewError(null);
        })
        .catch((err) => setPreviewError(errorText(err)));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [audience, filterEmpty]);

  const scheduleValid = when !== "later" || (scheduledAt !== "" && new Date(scheduledAt).getTime() > Date.now());
  const canSubmit = name.trim() !== "" && draftIsValid(draft) && !filterEmpty && scheduleValid && !busy;

  async function submit() {
    if (when === "now") {
      const who = preview ? `${preview.users} чел. (${preview.devices} устройств)` : "выбранной аудитории";
      if (!(await confirmAction(`Отправить сейчас ${who}? Отменить после отправки нельзя.`))) return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createPushCampaign({
        name: name.trim(),
        content: draftToInput(draft),
        audience,
        ...(when === "later" ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        ...(when === "now" ? { sendNow: true } : {}),
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-6 p-5">
      <h2 className="text-lg font-semibold">Новая рассылка</h2>

      <label className="block max-w-md text-sm">
        <span className="mb-1 block font-medium text-slate-600">Название (видно только вам)</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Скидки для Турции" />
      </label>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">1. Что отправить</h3>
        <ContentEditor value={draft} onChange={setDraft} templates={templates} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase text-slate-500">2. Кому</h3>
        <div className="flex gap-2">
          <Chip active={mode === "ALL"} onClick={() => setMode("ALL")}>
            Всем с приложением
          </Chip>
          <Chip active={mode === "FILTER"} onClick={() => setMode("FILTER")}>
            По условиям
          </Chip>
        </div>
        {mode === "FILTER" && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Страна</p>
              <div className="flex flex-wrap gap-1.5">
                {countries.map((c) => (
                  <Chip
                    key={c.code}
                    active={selCountries.includes(c.code)}
                    onClick={() => setSelCountries(toggleIn(selCountries, c.code))}
                  >
                    {c.name.ru}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Язык приложения</p>
              <div className="flex flex-wrap gap-1.5">
                {LOCALE_OPTIONS.map((l) => (
                  <Chip key={l.value} active={selLocales.includes(l.value)} onClick={() => setSelLocales(toggleIn(selLocales, l.value))}>
                    {l.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Кто</p>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_OPTIONS.map((r) => (
                  <Chip key={r.value} active={selRoles.includes(r.value)} onClick={() => setSelRoles(toggleIn(selRoles, r.value))}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-400">Условия из разных групп работают вместе («и»), внутри группы — «или».</p>
          </div>
        )}
        <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm">
          {filterEmpty ? (
            <span className="text-slate-500">Выберите хотя бы одно условие.</span>
          ) : previewError ? (
            <span className="text-rose-600">{previewError}</span>
          ) : preview ? (
            <span>
              Получат: <b>{preview.users}</b> чел. на <b>{preview.devices}</b> устройствах.
              {preview.withoutApp > 0 && (
                <span className="text-slate-500"> Ещё {preview.withoutApp} подходят, но не заходили в приложение.</span>
              )}
            </span>
          ) : (
            <span className="text-slate-400">Считаю аудиторию…</span>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase text-slate-500">3. Когда</h3>
        <div className="flex flex-wrap gap-2">
          <Chip active={when === "now"} onClick={() => setWhen("now")}>
            Отправить сейчас
          </Chip>
          <Chip active={when === "later"} onClick={() => setWhen("later")}>
            Запланировать
          </Chip>
          <Chip active={when === "draft"} onClick={() => setWhen("draft")}>
            Сохранить черновик
          </Chip>
        </div>
        {when === "later" && (
          <label className="block max-w-xs text-sm">
            <span className="mb-1 block font-medium text-slate-600">Дата и время (по вашему времени)</span>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            {scheduledAt && !scheduleValid && <span className="text-xs text-rose-600">Время должно быть в будущем.</span>}
          </label>
        )}
      </section>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={!canSubmit}>
          {busy ? "Сохраняю…" : when === "now" ? "Отправить" : when === "later" ? "Запланировать" : "Сохранить черновик"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </Card>
  );
}

// ---- Detail ----

function CampaignDetail({ id, names, onBack }: { id: string; names: Map<string, string>; onBack: () => void }) {
  const [campaign, setCampaign] = useState<PushCampaignDetailDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.getPushCampaign(id).then(setCampaign).catch((err) => setError(errorText(err)));
  }
  useEffect(load, [id]);

  // A campaign that is still being sent keeps changing; check again until it finishes.
  useEffect(() => {
    if (campaign?.status !== "SENDING") return;
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [campaign?.status]);

  async function act(action: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !(await confirmAction(confirmText))) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!campaign) return <p className="text-sm text-slate-400">{error ?? "Загрузка…"}</p>;
  const canStart = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm font-medium text-brand-600 hover:underline">
        ← Все рассылки
      </button>
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{campaign.name}</h2>
            <p className="text-sm text-slate-500">
              {CATEGORY_LABELS[campaign.category]} · {audienceLabel(campaign.audience, names)}
            </p>
          </div>
          <StatusPill status={campaign.status} />
        </div>
        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <p className="font-semibold">{campaign.titleRu}</p>
          <p className="text-slate-600">{campaign.bodyRu}</p>
          {(campaign.titleEn || campaign.titleTkm) && (
            <p className="mt-2 text-xs text-slate-400">
              Переводы: {campaign.titleEn ? "English" : ""}
              {campaign.titleEn && campaign.titleTkm ? ", " : ""}
              {campaign.titleTkm ? "Türkmen" : ""}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Создана {formatDateTime(campaign.createdAt)}
          {campaign.scheduledAt && ` · запланирована на ${formatDateTime(campaign.scheduledAt)}`}
          {campaign.startedAt && ` · начата ${formatDateTime(campaign.startedAt)}`}
          {campaign.finishedAt && ` · закончена ${formatDateTime(campaign.finishedAt)}`}
        </p>
        {campaign.lastError && <p className="text-sm text-rose-600">Ошибка: {campaign.lastError}</p>}
        {canStart && (
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() => act(() => api.sendPushCampaign(id), "Отправить рассылку сейчас? Отменить после отправки нельзя.")}
            >
              Отправить сейчас
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => act(() => api.cancelPushCampaign(id), "Отменить рассылку?")}>
              Отменить
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Отправлено" value={campaign.stats.sent} />
        <StatCard label="Доставлено" value={campaign.stats.delivered} />
        <StatCard label="Открыто" value={campaign.stats.opened} />
        <StatCard label="Игнор" value={campaign.stats.ignored} />
        <StatCard label="Открываемость" value={`${campaign.stats.openRate}%`} />
        <StatCard label="Ошибки" value={campaign.stats.failed} />
      </div>

      {campaign.byCountry.length > 0 && (
        <Card className="overflow-x-auto p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">По странам</h3>
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="pb-2 font-medium" />
                <th className="pb-2 text-right font-medium">Отправлено</th>
                <th className="pb-2 text-right font-medium">Доставлено</th>
                <th className="pb-2 text-right font-medium">Открыто</th>
                <th className="pb-2 text-right font-medium">Открываемость</th>
              </tr>
            </thead>
            <tbody>
              {campaign.byCountry.map((row) => (
                <tr key={row.country} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{countryName(row.country, names)}</td>
                  <td className="py-2 text-right tabular-nums">{row.sent}</td>
                  <td className="py-2 text-right tabular-nums">{row.delivered}</td>
                  <td className="py-2 text-right tabular-nums">{row.opened}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{row.openRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ---- Tab ----

export function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<PushCampaignDto[] | null>(null);
  const [templates, setTemplates] = useState<PushTemplateDto[]>([]);
  const [countries, setCountries] = useState<CountryOptionDto[]>([]);
  const [view, setView] = useState<{ kind: "list" } | { kind: "new" } | { kind: "detail"; id: string }>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);

  const names = useMemo(() => new Map(countries.map((c) => [c.code, c.name.ru])), [countries]);

  function load() {
    api.listPushCampaigns().then(setCampaigns).catch((err) => setError(errorText(err)));
  }
  useEffect(() => {
    load();
    api.listPushTemplates().then(setTemplates).catch(() => {});
    api.listPushCountries().then(setCountries).catch(() => {});
  }, []);

  if (view.kind === "new") {
    return (
      <CampaignForm
        templates={templates}
        countries={countries}
        onCancel={() => setView({ kind: "list" })}
        onDone={() => {
          load();
          setView({ kind: "list" });
        }}
      />
    );
  }
  if (view.kind === "detail") {
    return (
      <CampaignDetail
        id={view.id}
        names={names}
        onBack={() => {
          load();
          setView({ kind: "list" });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Рассылка — уведомление сразу многим людям: всем, по стране, языку или роли. Можно отправить сейчас, на
          определённое время или сохранить черновик.
        </p>
        <Button onClick={() => setView({ kind: "new" })}>Новая рассылка</Button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {campaigns === null ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : campaigns.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">Рассылок пока не было.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="p-3 font-medium">Рассылка</th>
                <th className="p-3 font-medium">Кому</th>
                <th className="p-3 font-medium">Статус</th>
                <th className="p-3 text-right font-medium">Доставлено</th>
                <th className="p-3 text-right font-medium">Открыто</th>
                <th className="p-3 text-right font-medium">Открываемость</th>
                <th className="p-3 font-medium">Когда</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => setView({ kind: "detail", id: c.id })}
                >
                  <td className="p-3">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-slate-400">{CATEGORY_LABELS[c.category]}</p>
                  </td>
                  <td className="p-3 text-slate-600">{audienceLabel(c.audience, names)}</td>
                  <td className="p-3">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="p-3 text-right tabular-nums">{c.stats?.delivered ?? 0}</td>
                  <td className="p-3 text-right tabular-nums">{c.stats?.opened ?? 0}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{c.stats?.openRate ?? 0}%</td>
                  <td className="p-3 text-slate-500">{formatDateTime(c.finishedAt ?? c.scheduledAt ?? c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
