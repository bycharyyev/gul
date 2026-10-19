import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type SellerDetail = Awaited<ReturnType<typeof api.getAdminSeller>>;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 break-all text-sm text-slate-800">{children || "—"}</div>
    </div>
  );
}

/** Everything the console knows about one shop: contacts, sections, totals, and a direct line to the
 *  seller through platform support. Opened from the sellers list. */
export function SellerDetailPanel({ sellerId, onClose }: { sellerId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<SellerDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError("");
    setSent("");
    api
      .getAdminSeller(sellerId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить продавца");
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  async function send() {
    if (!detail || !message.trim()) return;
    setSending(true);
    setSent("");
    setError("");
    try {
      const thread = await api.openStaffSupportThread(detail.user.id);
      await api.sendStaffSupportMessage(thread.id, { body: message.trim() });
      setMessage("");
      setSent("Сообщение отправлено в поддержку продавца");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  if (error && !detail) {
    return (
      <Card className="p-5">
        <p className="text-sm text-rose-600">{error}</p>
        <Button className="mt-3" variant="secondary" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </Card>
    );
  }
  if (!detail) return <Card className="p-5 text-sm text-slate-400">Загрузка…</Card>;

  const orders = Object.entries(detail.stats.ordersByStatus);
  return (
    <Card className="space-y-6 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{detail.shopName}</h2>
          <p className="text-sm text-brand-600">@{detail.handle}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail">
          {detail.user.email && (
            <a className="text-brand-600 underline" href={`mailto:${detail.user.email}`}>
              {detail.user.email}
            </a>
          )}
          {detail.user.email && !detail.user.emailVerified && <span className="ml-2 text-xs text-amber-600">не подтверждён</span>}
        </Field>
        <Field label="Телефон">
          {detail.user.phone && (
            <a className="text-brand-600 underline" href={`tel:${detail.user.phone}`}>
              {detail.user.phone}
            </a>
          )}
        </Field>
        <Field label="Имя владельца">{detail.user.fullName}</Field>
        <Field label="Аккаунт создан">{formatDate(detail.user.createdAt)}</Field>
        <Field label="Магазин создан">{formatDate(detail.createdAt)}</Field>
        <Field label="Telegram">{detail.telegramLinked ? "привязан" : "не привязан"}</Field>
        <Field label="Баланс">{`${detail.balanceTmt} TMT`}</Field>
        <Field label="Статус">
          <span className={detail.isEnabled ? "text-emerald-600" : "text-rose-600"}>
            {detail.isEnabled ? "активен" : "отключён"}
          </span>
          {detail.user.isBlocked && <span className="ml-2 text-xs text-rose-600">аккаунт заблокирован</span>}
        </Field>
      </section>

      {detail.description && (
        <section>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Описание</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{detail.description}</p>
        </section>
      )}

      <section>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Статистика</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Товаров</p>
            <p className="text-xl font-bold">{detail.stats.productCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Выручка (доставлено)</p>
            <p className="text-xl font-bold">{detail.stats.totalRevenueTmt} TMT</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Разделов витрины</p>
            <p className="text-xl font-bold">{detail.storefronts.length}</p>
          </div>
        </div>
        {orders.length > 0 && (
          <p className="mt-3 text-sm text-slate-600">
            Заказы по статусам:{" "}
            {orders.map(([status, count]) => `${status} — ${count}`).join(", ")}
          </p>
        )}
      </section>

      <section>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Написать продавцу</p>
        <p className="mt-1 text-xs text-slate-400">Сообщение уйдёт в его диалог с поддержкой, откуда он сможет ответить.</p>
        <textarea
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          rows={3}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Текст сообщения"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button size="sm" onClick={() => void send()} disabled={sending || !message.trim()}>
            {sending ? "Отправляю…" : "Отправить в поддержку"}
          </Button>
          {sent && <span className="text-sm text-emerald-700">{sent}</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </section>
    </Card>
  );
}
