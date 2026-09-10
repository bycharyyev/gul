import { useEffect, useState } from "react";
import type { ManagedSubdomainDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_STYLES: Record<ManagedSubdomainDto["status"], string> = {
  PENDING: "text-amber-600 dark:text-amber-400",
  ACTIVE: "text-emerald-600 dark:text-emerald-400",
  FAILED: "text-rose-600 dark:text-rose-400",
  REMOVED: "text-slate-400",
};

export default function SubdomainsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ManagedSubdomainDto[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [port, setPort] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.listSubdomains().then(setRows).catch(() => {});
  }

  useEffect(load, []);

  // Provisioning takes ~a minute (nginx reload + certbot) -- poll while anything is still
  // PENDING so the status column updates itself instead of needing a manual refresh.
  useEffect(() => {
    if (!rows.some((r) => r.status === "PENDING")) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [rows]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSubdomain({ name, targetPort: Number(port) });
      setRows((prev) => [created, ...prev]);
      setName("");
      setPort("");
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.subdomains.createError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("admin.subdomains.deleteConfirm"))) return;
    await api.deleteSubdomain(id);
    load();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.subdomains.title")}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            {t("admin.subdomains.refresh")}
          </Button>
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? t("common.cancel") : t("admin.subdomains.addSubdomain")}
          </Button>
        </div>
      </div>
      <p className="text-sm text-slate-500">{t("admin.subdomains.hint")}</p>

      {showCreate && (
        <Card className="p-5">
          <form onSubmit={create} className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.subdomains.nameLabel")}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("admin.subdomains.namePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.subdomains.portLabel")}</label>
              <Input
                type="number"
                min={1024}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder={t("admin.subdomains.portPlaceholder")}
                required
              />
            </div>
            {error && <p className="col-span-2 text-sm text-rose-600">{error}</p>}
            <Button className="col-span-2" type="submit" disabled={busy}>
              {busy ? t("admin.subdomains.adding") : t("admin.subdomains.addSubmit")}
            </Button>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3">{t("admin.subdomains.colName")}</th>
              <th className="px-4 py-3">{t("admin.subdomains.colPort")}</th>
              <th className="px-4 py-3">{t("admin.subdomains.colStatus")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-slate-500">{row.targetPort}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${STATUS_STYLES[row.status]}`}>
                    {t(`admin.subdomains.status.${row.status}`)}
                  </span>
                  {row.lastError && (
                    <div className="mt-0.5 max-w-xs truncate text-xs text-rose-500" title={row.lastError}>
                      {row.lastError}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    onClick={() => remove(row.id)}
                  >
                    {t("common.delete")}
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.subdomains.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
