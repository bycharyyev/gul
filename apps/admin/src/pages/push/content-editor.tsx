import { useState } from "react";
import type { PushCategory, PushTemplateDto } from "@topup-hub/types";
import { Input } from "@/components/ui/input";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { Select } from "@/components/ui/select";
import { CATEGORY_OPTIONS, ROUTE_OPTIONS, type ContentDraft, draftFrom } from "./shared";

const LANGS = [
  { key: "Ru", label: "Русский", required: true },
  { key: "En", label: "English", required: false },
  { key: "Tkm", label: "Türkmen", required: false },
] as const;

const TITLE_MAX = 120;
const BODY_MAX = 500;

/**
 * The wording of a push: category, screen it opens, picture, and the text in three languages.
 * A person gets their own language and the Russian text when a translation is left empty. The
 * preview shows roughly what the phone draws (round picture, title, text).
 */
export function ContentEditor({
  value,
  onChange,
  templates,
}: {
  value: ContentDraft;
  onChange: (next: ContentDraft) => void;
  /** When given, a "start from a template" picker is shown. */
  templates?: PushTemplateDto[];
}) {
  const [lang, setLang] = useState<(typeof LANGS)[number]["key"]>("Ru");
  const set = <K extends keyof ContentDraft>(key: K, next: ContentDraft[K]) => onChange({ ...value, [key]: next });
  const titleKey = `title${lang}` as keyof ContentDraft;
  const bodyKey = `body${lang}` as keyof ContentDraft;
  const title = value[titleKey];
  const body = value[bodyKey];
  const previewTitle = value[titleKey] || value.titleRu || "Заголовок";
  const previewBody = value[bodyKey] || value.bodyRu || "Текст уведомления";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {templates && templates.length > 0 && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Взять из шаблона</span>
            <Select
              value=""
              onChange={(e) => {
                const template = templates.find((t) => t.id === e.target.value);
                if (template) onChange(draftFrom({ ...template, category: template.category as PushCategory }));
              }}
            >
              <option value="">— написать с нуля —</option>
              {templates
                .filter((t) => t.isEnabled)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Раздел</span>
            <Select value={value.category} onChange={(e) => set("category", e.target.value as PushCategory)}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Что откроется по нажатию</span>
            <Select value={value.route} onChange={(e) => set("route", e.target.value)}>
              {ROUTE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <ImageUploadField
          label="Картинка (необязательно)"
          value={value.imageUrl}
          onChange={(url) => set("imageUrl", url)}
          uploadLabel="Загрузить"
          placeholder="https://…/logo.png или загрузите файл"
          hint="Покажется круглой иконкой, как аватар в мессенджере. Лучше квадратная картинка."
        />

        <div>
          <div className="mb-2 flex gap-1">
            {LANGS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLang(l.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  lang === l.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {l.label}
                {l.required ? " *" : ""}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 flex justify-between font-medium text-slate-600">
                <span>Заголовок</span>
                <span className="text-xs font-normal text-slate-400">
                  {title.length}/{TITLE_MAX}
                </span>
              </span>
              <Input value={title} maxLength={TITLE_MAX} onChange={(e) => set(titleKey, e.target.value as never)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 flex justify-between font-medium text-slate-600">
                <span>Текст</span>
                <span className="text-xs font-normal text-slate-400">
                  {body.length}/{BODY_MAX}
                </span>
              </span>
              <textarea
                value={body}
                maxLength={BODY_MAX}
                rows={4}
                onChange={(e) => set(bodyKey, e.target.value as never)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </label>
            {lang !== "Ru" && (
              <p className="text-xs text-slate-400">
                Если оставить пустым, людям с этим языком уйдёт русский текст.
              </p>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase text-slate-400">Как выглядит на телефоне</p>
        <div className="rounded-2xl bg-slate-100 p-3">
          <div className="flex items-start gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
              G
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-400">Gulyaly · сейчас</p>
              <p className="truncate text-sm font-semibold text-slate-900">{previewTitle}</p>
              <p className="line-clamp-3 text-sm text-slate-600">{previewBody}</p>
            </div>
            {value.imageUrl ? (
              <img
                src={value.imageUrl}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <div className="h-11 w-11 shrink-0 rounded-full bg-slate-200" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
