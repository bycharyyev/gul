import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface ProfileFormValues {
  shopName: string;
  handle: string;
  description: string;
  fullName: string;
  email: string;
  phone: string;
}

const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

/**
 * Shared editor for a shop and its owner's contacts. Used for a seller (staff edit) and for a pending
 * application. The server validates every field; this form only shows what it refuses.
 */
export function ProfileEditForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ProfileFormValues;
  onSave: (values: Partial<ProfileFormValues>) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof ProfileFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      // Empty optional fields mean "leave as is": the server would reject an empty phone.
      await onSave({
        ...values,
        description: values.description || undefined,
        fullName: values.fullName || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Название магазина
          <input className={field} value={values.shopName} maxLength={120} onChange={set("shopName")} required />
        </label>
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Username (@)
          <input className={field} value={values.handle} maxLength={32} onChange={set("handle")} required />
        </label>
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Имя владельца
          <input className={field} value={values.fullName} maxLength={120} onChange={set("fullName")} />
        </label>
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          E-mail
          <input className={field} type="email" value={values.email} onChange={set("email")} />
        </label>
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Телефон
          <input className={field} value={values.phone} placeholder="+99361234567" onChange={set("phone")} />
        </label>
      </div>
      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
        Описание
        <textarea className={field} rows={3} maxLength={500} value={values.description} onChange={set("description")} />
      </label>
      {values.email !== initial.email && (
        <p className="text-xs text-amber-700">Новый e-mail будет считаться непроверенным, владелец подтвердит его заново.</p>
      )}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
