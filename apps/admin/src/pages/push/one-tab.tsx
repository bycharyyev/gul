import { useEffect, useState } from "react";
import type { PushTemplateDto, PushUserHitDto } from "@topup-hub/types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ContentEditor } from "./content-editor";
import { type ContentDraft, draftIsValid, draftToInput, emptyDraft, errorText } from "./shared";

/** A notification to one person, found by phone, name or username. Recorded as a one-person campaign. */
export function OneTab() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PushUserHitDto[]>([]);
  const [picked, setPicked] = useState<PushUserHitDto | null>(null);
  const [draft, setDraft] = useState<ContentDraft>(emptyDraft);
  const [templates, setTemplates] = useState<PushTemplateDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    api.listPushTemplates().then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    if (picked || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api.searchPushUsers(query).then(setHits).catch(() => setHits([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, picked]);

  async function send() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.sendPushToOne(picked.id, draftToInput(draft));
      setDone(`Отправлено: ${picked.fullName || picked.phone}. Результат смотрите во вкладке «Рассылки».`);
      setDraft(emptyDraft);
      setPicked(null);
      setQuery("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Личное уведомление одному человеку: например, ответ по заказу или предупреждение. Получить его может только тот,
        кто уже заходил в приложение.
      </p>

      <Card className="space-y-4 p-5">
        <div className="max-w-md">
          <span className="mb-1 block text-sm font-medium text-slate-600">Кому</span>
          {picked ? (
            <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm">
              <span>
                <b>{picked.fullName || picked.username || picked.phone}</b> · {picked.phone} ·{" "}
                {picked.country ?? "страна не определена"} · устройств: {picked.devices}
              </span>
              <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setPicked(null)}>
                Изменить
              </button>
            </div>
          ) : (
            <>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Телефон, имя или username (от 2 символов)"
              />
              {hits.length > 0 && (
                <div className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {hits.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      onClick={() => setPicked(hit)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span>
                        <b>{hit.fullName || hit.username || "—"}</b> · {hit.phone}
                      </span>
                      <span className={`text-xs ${hit.devices > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                        {hit.devices > 0 ? `устройств: ${hit.devices}` : "нет приложения"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {picked && (
          <>
            {picked.devices === 0 && (
              <p className="text-sm text-amber-600">
                У этого человека нет приложения или он не входил в аккаунт, отправить не получится.
              </p>
            )}
            <ContentEditor value={draft} onChange={setDraft} templates={templates} />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button onClick={send} disabled={busy || picked.devices === 0 || !draftIsValid(draft)}>
              {busy ? "Отправляю…" : "Отправить"}
            </Button>
          </>
        )}
        {done && <p className="text-sm text-emerald-600">{done}</p>}
      </Card>
    </div>
  );
}
