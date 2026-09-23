import { useEffect, useState } from "react";
import type { AdminStatsDto } from "@topup-hub/types";
import { useTranslation } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/api$/, "");

interface OpenApiPath {
  method: string;
  path: string;
  summary: string;
  tag: string;
}

export default function ApiManagementPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminStatsDto | null>(null);
  const [endpoints, setEndpoints] = useState<OpenApiPath[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([
      api.getAdminStats(),
      fetch(`${API_BASE}/docs-json`)
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([statsRes, openapi]) => {
        setStats(statsRes);
        if (openapi?.paths) {
          const rows: OpenApiPath[] = [];
          for (const [path, methods] of Object.entries<Record<string, { summary?: string; tags?: string[] }>>(
            openapi.paths,
          )) {
            for (const [method, def] of Object.entries(methods)) {
              rows.push({
                method: method.toUpperCase(),
                path,
                summary: def.summary ?? "",
                tag: def.tags?.[0] ?? "other",
              });
            }
          }
          setEndpoints(rows);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const grouped = endpoints.reduce<Record<string, OpenApiPath[]>>((acc, ep) => {
    (acc[ep.tag] ??= []).push(ep);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.apiManagement.title")}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            {t("admin.apiManagement.refresh")}
          </Button>
          <a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">
            <Button size="sm">{t("admin.apiManagement.openSwagger")}</Button>
          </a>
        </div>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label={t("admin.apiManagement.statOrders")} value={stats.totals.orders} />
            <StatCard label={t("admin.apiManagement.statServices")} value={stats.totals.services} />
            <StatCard label={t("admin.apiManagement.statStaff")} value={stats.totals.staff} />
            <StatCard label={t("admin.apiManagement.statCustomers")} value={stats.totals.customers} />
            <StatCard label={t("admin.apiManagement.statApiKeys")} value={stats.totals.apiKeys} />
          </div>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.apiManagement.ordersByStatusTitle")}</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.ordersByStatus).map(([status, count]) => (
                <div key={status} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-500">{status}:</span> <span className="font-semibold">{count}</span>
                </div>
              ))}
              {Object.keys(stats.ordersByStatus).length === 0 && (
                <p className="text-sm text-slate-400">{t("admin.apiManagement.noOrders")}</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.apiManagement.queueTitle")}</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.queue).map(([key, count]) => (
                <div key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-500">{key}:</span> <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-500">{t("admin.apiManagement.processStateTitle")}</h2>
            <p className="text-sm text-slate-600">
              {t("admin.apiManagement.processState", {
                version: stats.nodeVersion,
                minutes: Math.floor(stats.uptimeSeconds / 60),
              })}
            </p>
          </Card>
        </>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.apiManagement.endpointsTitle")}</h2>
        {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
        <div className="space-y-4">
          {Object.entries(grouped).map(([tag, rows]) => (
            <div key={tag}>
              <p className="mb-1 text-xs font-semibold uppercase text-brand-600">{tag}</p>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {rows.map((ep) => (
                  <div key={`${ep.method}-${ep.path}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-16 shrink-0 rounded bg-slate-100 px-2 py-0.5 text-center text-xs font-mono font-semibold">
                      {ep.method}
                    </span>
                    <span className="font-mono text-xs text-slate-600">{ep.path}</span>
                    <span className="text-slate-400">{ep.summary}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
