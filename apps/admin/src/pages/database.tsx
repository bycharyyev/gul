import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DatabaseTableStatDto } from "@topup-hub/types";
import { useTranslation, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";

export default function DatabasePage() {
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState<DatabaseTableStatDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDatabaseOverview()
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalRows = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.database.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.database.description")}</p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.database.colTable")}</th>
              <th className="px-4 py-3">{t("admin.database.colCount")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.table}>
                <td className="px-4 py-3 font-medium">{row.table}</td>
                <td className="px-4 py-3">{row.count.toLocaleString(LOCALE_BCP47[locale])}</td>
                <td className="px-4 py-3 text-right">
                  {row.managePath && (
                    <Link to={row.managePath} className="text-xs font-medium text-brand-600 hover:underline">
                      {t("admin.database.manageLink")}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.database.empty")}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <td className="px-4 py-3">{t("admin.database.totalLabel")}</td>
                <td className="px-4 py-3">{totalRows.toLocaleString(LOCALE_BCP47[locale])}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}
