"use client";

import { useEffect, useState } from "react";
import type { WithdrawalRequestDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_CLASSNAME: Record<string, string> = {
  PENDING: "text-amber-600 dark:text-amber-400",
  PAID: "text-emerald-600 dark:text-emerald-400",
  REJECTED: "text-rose-600 dark:text-rose-400",
};

export function WithdrawalPanel({
  balanceTmt,
  defaultPayoutDetails,
  onWithdrawn,
}: {
  balanceTmt: number;
  defaultPayoutDetails: string | null;
  onWithdrawn: () => void;
}) {
  const { t, locale } = useTranslation();
  const [history, setHistory] = useState<WithdrawalRequestDto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(!defaultPayoutDetails);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.listMyWithdrawals().then(setHistory).catch(() => {});
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createMyWithdrawal({ amountTmt: Number(amount), payoutDetails });
      if (saveAsDefault && payoutDetails !== defaultPayoutDetails) {
        await api.updateMySellerProfile({ defaultPayoutDetails: payoutDetails }).catch(() => {});
      }
      setAmount("");
      setShowForm(false);
      load();
      onWithdrawn();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.withdrawalPanel.genericError"));
    } finally {
      setBusy(false);
    }
  }

  const hasPending = history.some((h) => h.status === "PENDING");

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase text-slate-500">{t("web.withdrawalPanel.title")}</h2>
          <p className="text-xs text-slate-400">{t("web.withdrawalPanel.available", { balance: balanceTmt })}</p>
        </div>
        {!showForm && (
          <Button
            size="sm"
            onClick={() => {
              setPayoutDetails(defaultPayoutDetails ?? "");
              setSaveAsDefault(!defaultPayoutDetails);
              setShowForm(true);
            }}
            disabled={hasPending || balanceTmt <= 0}
          >
            {t("web.withdrawalPanel.requestButton")}
          </Button>
        )}
      </div>

      {hasPending && !showForm && (
        <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">{t("web.withdrawalPanel.pendingNotice")}</p>
      )}

      {showForm && (
        <form onSubmit={submit} className="mb-4 space-y-3 rounded-lg bg-slate-50 p-4 dark:bg-white/5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("web.withdrawalPanel.amountLabel")}
            </label>
            <Input
              type="number"
              min={1}
              max={balanceTmt}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("web.withdrawalPanel.payoutDetailsLabel")}
            </label>
            <Input
              value={payoutDetails}
              onChange={(e) => setPayoutDetails(e.target.value)}
              placeholder={t("web.withdrawalPanel.payoutDetailsPlaceholder")}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
            />
            {t("web.withdrawalPanel.saveDefaultLabel")}
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t("web.withdrawalPanel.submitting") : t("web.withdrawalPanel.submit")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          {history.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/5"
            >
              <div>
                <p className="font-medium">{h.amountTmt} TMT</p>
                <p className="text-xs text-slate-400">{new Date(h.createdAt).toLocaleString(LOCALE_BCP47[locale])}</p>
              </div>
              <span className={cn("text-xs font-medium", STATUS_CLASSNAME[h.status])}>
                {t(`web.withdrawalPanel.status.${h.status}`)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
