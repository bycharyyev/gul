import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, ChevronsUpDown, Download } from "lucide-react";
import { useTranslation } from "@topup-hub/i18n";
import { downloadText, sortRows, toCsv, type SortDirection, type SortValue } from "@/lib/table";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => SortValue;
  /** Value written to the CSV export; columns without it (actions) are left out. */
  csv?: (row: T) => SortValue;
  className?: string;
  headerClassName?: string;
  /** Not shown in the table; written to the CSV only. */
  exportOnly?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  loading?: boolean;
  emptyText: string;
  /** Enables the export button; the date is appended to the name. */
  exportName?: string;
  initialSort?: { id: string; direction: SortDirection };
  pageSizes?: number[];
  minWidth?: string;
  /** Rendered left of the export button: a title, counters, extra filters. */
  toolbar?: ReactNode;
}

// One table for every list in the console: sort by clicking a header, pages, CSV of everything
// that is currently filtered and sorted (not just the visible page).
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowClassName,
  loading = false,
  emptyText,
  exportName,
  initialSort,
  pageSizes = [10, 25, 50, 100],
  minWidth = "720px",
  toolbar,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<{ id: string; direction: SortDirection } | null>(initialSort ?? null);
  const [pageSize, setPageSize] = useState<number>(pageSizes[1] ?? pageSizes[0] ?? 25);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.id === sort.id);
    return column?.sortValue ? sortRows(rows, column.sortValue, sort.direction) : rows;
  }, [rows, columns, sort]);

  const shown = columns.filter((c) => !c.exportOnly);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // A filter that shrinks the list must not leave the view stranded on an empty page.
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);

  const from = sorted.length === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(sorted.length, (page + 1) * pageSize);
  const visible = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(id: string) {
    setSort((current) => {
      if (!current || current.id !== id) return { id, direction: "asc" };
      if (current.direction === "asc") return { id, direction: "desc" };
      return null;
    });
    setPage(0);
  }

  function exportCsv() {
    const exportable = columns.filter((c) => c.csv);
    const csv = toCsv(
      exportable.map((c) => c.header),
      sorted.map((row) => exportable.map((c) => c.csv!(row))),
    );
    downloadText(`${exportName}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const pagerButton = "rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div>
      {(toolbar || exportName) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {exportName && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={sorted.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-brand-300 disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("admin.table.export")}
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {shown.map((column) => {
                const active = sort?.id === column.id;
                const ariaSort = active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined;
                return (
                  <th key={column.id} aria-sort={ariaSort} className={`px-4 py-3 ${column.headerClassName ?? ""}`}>
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800 ${active ? "text-slate-800" : ""}`}
                      >
                        {column.header}
                        {active ? (
                          sort!.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${onRowClick ? "cursor-pointer" : ""} ${rowClassName?.(row) ?? "hover:bg-slate-50"}`}
              >
                {shown.map((column) => (
                  <td key={column.id} className={`px-4 py-3 ${column.className ?? ""}`}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={shown.length} className="px-4 py-10 text-center text-slate-400">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span className="tabular-nums">{t("admin.table.range", { from, to, total: sorted.length })}</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              {t("admin.table.rowsPerPage")}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                {pageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span className="tabular-nums">{t("admin.table.page", { page: page + 1, pages })}</span>
            <div className="flex items-center gap-0.5">
              <button type="button" className={pagerButton} onClick={() => setPage(0)} disabled={page === 0} aria-label={t("admin.table.firstPage")}>
                <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={pagerButton} onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label={t("admin.table.prevPage")}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={pagerButton} onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1} aria-label={t("admin.table.nextPage")}>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={pagerButton} onClick={() => setPage(pages - 1)} disabled={page >= pages - 1} aria-label={t("admin.table.lastPage")}>
                <ChevronsRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
