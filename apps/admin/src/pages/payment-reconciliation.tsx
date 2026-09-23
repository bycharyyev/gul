import { useEffect, useState } from "react";
import type { PaymentReconciliationDto } from "@topup-hub/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const actionLabel: Record<PaymentReconciliationDto["action"], string> = {
  LOOKUP_AVAILABLE: "Можно проверить у провайдера",
  LOOKED_UP: "Проверен у провайдера",
  MANUAL_REVIEW: "Нужна ручная проверка",
  SETTLED: "Подтверждён и проведён",
  SUCCEEDED_REQUIRES_REFUND: "Оплачен после отмены — нужен возврат",
  LOOKUP_FAILED: "Ошибка запроса провайдера",
  PAYMENT_DETAILS_MISMATCH: "Сумма или валюта провайдера не совпадает",
  IGNORED_TERMINAL_PAYMENT: "Поздний ответ сохранён, итог не изменён",
  PROVIDER_UNAVAILABLE: "Провайдер недоступен",
};

export default function PaymentReconciliationPage() {
  const [rows, setRows] = useState<PaymentReconciliationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.reconcilePayments(15));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось выполнить сверку платежей");
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.runPaymentReconciliation(15));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось запустить сверку платежей");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Сверка платежей</h1>
          <p className="mt-1 text-sm text-slate-500">
            Неопределённые и незавершённые попытки старше 15 минут. Новое списание автоматически не создаётся.
          </p>
        </div>
        <Button onClick={() => void run()} disabled={loading}>Запустить сверку</Button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <Card className="border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
          Платежей, требующих сверки, нет.
        </Card>
      )}
      {rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr>
                <th className="p-3">Платёж</th><th className="p-3">Заказ</th><th className="p-3">Провайдер</th>
                <th className="p-3">Статус</th><th className="p-3">Результат сверки</th><th className="p-3">Обновлён</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.paymentId} className="border-t border-slate-100">
                  <td className="p-3 font-mono text-xs">{row.paymentId}</td>
                  <td className="p-3"><a className="text-blue-600 hover:underline" href={`/orders/${row.orderId}`}>{row.orderId}</a></td>
                  <td className="p-3">{row.provider}</td>
                  <td className="p-3 font-semibold">{row.status}</td>
                  <td className="p-3">{actionLabel[row.action]}</td>
                  <td className="p-3">{new Date(row.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
