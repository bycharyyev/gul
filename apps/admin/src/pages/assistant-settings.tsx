import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageUploadField } from "@/components/ui/image-upload-field";

type Settings = Awaited<ReturnType<typeof api.getAssistantSettings>>;

/** The assistant on the sign-in page: its picture, name and status line. Empty name or status
 *  means "use the built-in text", and an empty picture means the built-in "G" mark. */
export default function AssistantSettingsPage() {
  const [form, setForm] = useState<Settings>({ logoUrl: null, name: "", statusText: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getAdminAssistantSettings()
      .then(setForm)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Не удалось загрузить настройки"));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const next = await api.updateAssistantSettings({
        logoUrl: form.logoUrl?.trim() || null,
        name: form.name,
        statusText: form.statusText,
      });
      setForm(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Контент</p>
        <h1 className="mt-1 text-2xl font-bold">Ассистент на странице входа</h1>
        <p className="mt-1 text-sm text-slate-500">Картинка, имя и строка статуса в окне чата.</p>
      </header>

      <Card className="space-y-5 p-5">
        <ImageUploadField
          label="Логотип ассистента"
          value={form.logoUrl ?? ""}
          onChange={(url) => setForm({ ...form, logoUrl: url })}
          uploadLabel="Загрузить"
          hint="Если не указан, показывается встроенная буква G."
        />
        <label className="block text-xs font-medium text-slate-500">
          Имя
          <Input
            className="mt-1"
            value={form.name}
            maxLength={40}
            placeholder="Gulyaly"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          Строка статуса
          <Input
            className="mt-1"
            value={form.statusText}
            maxLength={60}
            placeholder="на связи"
            onChange={(e) => setForm({ ...form, statusText: e.target.value })}
          />
        </label>

        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-700">Сохранено</p>}
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </Button>
      </Card>
    </div>
  );
}
