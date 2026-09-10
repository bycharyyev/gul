import { useEffect, useState } from "react";
import type { SellerBalanceMismatchDto } from "@topup-hub/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function SellerLedgerPage() {
  const [rows, setRows] = useState<SellerBalanceMismatchDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.reconcileSellerBalances());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось выполнить сверку");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Сверка балансов продавцов</h1>
          <p className="mt-1 text-sm text-slate-500">Кеш Seller.balanceTmt сравнивается с неизменяемым ledger.</p>
        </div>
        <Button onClick={() => void load()} disabled={loading}>Повторить сверку</Button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <Card className="border-emerald-200 bg-emerald-50 p-6 text-emerald-800">Расхождений не обнаружено.</Card>
      )}
      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-600">
              <tr><th className="p-3">Продавец</th><th className="p-3">Кеш</th><th className="p-3">Ledger</th><th className="p-3">Разница</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sellerId} className="border-t border-slate-100">
                  <td className="p-3 font-medium">@{row.handle}</td>
                  <td className="p-3">{row.cachedBalance.toFixed(2)} TMT</td>
                  <td className="p-3">{row.ledgerBalance.toFixed(2)} TMT</td>
                  <td className="p-3 font-semibold text-rose-600">{row.difference.toFixed(2)} TMT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
