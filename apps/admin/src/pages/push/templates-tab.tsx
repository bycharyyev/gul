import { useEffect, useState } from "react";
import type { PushCategory, PushTemplateDto } from "@topup-hub/types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ContentEditor } from "./content-editor";
import { CATEGORY_LABELS, type ContentDraft, draftFrom, draftIsValid, draftToInput, emptyDraft, errorText } from "./shared";

export function TemplatesTab() {
  const [templates, setTemplates] = useState<PushTemplateDto[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; name: string; draft: ContentDraft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.listPushTemplates().then(setTemplates).catch((err) => setError(errorText(err)));
  }
  useEffect(load, []);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const input = draftToInput(editing.draft);
      if (editing.id) {
        await api.updatePushTemplate(editing.id, {
          ...input,
          name: editing.name.trim(),
          titleEn: editing.draft.titleEn.trim() || null,
          bodyEn: editing.draft.bodyEn.trim() || null,
          titleTkm: editing.draft.titleTkm.trim() || null,
          bodyTkm: editing.draft.bodyTkm.trim() || null,
          imageUrl: editing.draft.imageUrl.trim() || null,
        });
      } else {
        await api.createPushTemplate({ ...input, name: editing.name.trim() });
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(template: PushTemplateDto) {
    await api.updatePushTemplate(template.id, { isEnabled: !template.isEnabled }).catch((err) => setError(errorText(err)));
    load();
  }

  async function remove(template: PushTemplateDto) {
    if (!window.confirm(`Удалить шаблон «${template.name}»? Уже отправленные рассылки не изменятся.`)) return;
    await api.deletePushTemplate(template.id).catch((err) => setError(errorText(err)));
    load();
  }

  if (editing) {
    return (
      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{editing.id ? "Изменить шаблон" : "Новый шаблон"}</h2>
        <label className="block max-w-md text-sm">
          <span className="mb-1 block font-medium text-slate-600">Название (видно только вам)</span>
          <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
        </label>
        <ContentEditor value={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy || !editing.name.trim() || !draftIsValid(editing.draft)}>
            {busy ? "Сохраняю…" : "Сохранить"}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Отмена
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Шаблон — готовый текст на трёх языках с картинкой и экраном, который можно быстро использовать в рассылке.
        </p>
        <Button onClick={() => setEditing({ id: null, name: "", draft: emptyDraft })}>Новый шаблон</Button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {templates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">Шаблонов пока нет.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((template) => (
            <Card key={template.id} className={`p-4 ${template.isEnabled ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{template.name}</p>
                  <p className="text-xs text-slate-400">{CATEGORY_LABELS[template.category as PushCategory]}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({
                        id: template.id,
                        name: template.name,
                        draft: draftFrom({ ...template, category: template.category as PushCategory }),
                      })
                    }
                  >
                    Изменить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(template)}>
                    {template.isEnabled ? "Выключить" : "Включить"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(template)}>
                    Удалить
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-sm font-medium">{template.titleRu}</p>
              <p className="line-clamp-2 text-sm text-slate-500">{template.bodyRu}</p>
              <p className="mt-2 text-xs text-slate-400">
                Языки: ru{template.titleEn ? ", en" : ""}
                {template.titleTkm ? ", tkm" : ""}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
