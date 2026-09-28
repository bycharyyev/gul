export type SortDirection = "asc" | "desc";
export type SortValue = string | number | Date | boolean | null | undefined;

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

function compareValues(a: SortValue, b: SortValue): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

/** Stable sort; empty values always last, whichever the direction. */
export function sortRows<T>(rows: T[], value: (row: T) => SortValue, direction: SortDirection): T[] {
  return rows
    .map((row, index) => ({ row, index, key: value(row) }))
    .sort((x, y) => {
      const xEmpty = x.key === null || x.key === undefined || x.key === "";
      const yEmpty = y.key === null || y.key === undefined || y.key === "";
      if (xEmpty !== yEmpty) return xEmpty ? 1 : -1;
      const c = compareValues(x.key, y.key);
      return (direction === "asc" ? c : -c) || x.index - y.index;
    })
    .map((x) => x.row);
}

// A cell starting with = or @, or with + / - followed by anything but a number, is executed as a
// formula by Excel and LibreOffice (CSV injection). A phone number like +99365123456 is left alone.
function neutralizeFormula(text: string): string {
  if (/^[=@\t\r]/.test(text)) return `'${text}`;
  if (/^[+-]/.test(text) && !/^[+-][\d\s().-]*$/.test(text)) return `'${text}`;
  return text;
}

function csvCell(value: SortValue): string {
  if (value === null || value === undefined) return "";
  const text = neutralizeFormula(value instanceof Date ? value.toISOString() : String(value));
  return /[";\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV that Excel opens correctly in a Russian locale: semicolon-separated (the list separator
 * there), CRLF line ends, and a byte-order mark so Cyrillic is read as UTF-8 instead of cp1251.
 */
export function toCsv(headers: string[], rows: SortValue[][]): string {
  const lines = [headers, ...rows].map((cells) => cells.map(csvCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function downloadText(fileName: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: some browsers start the download only after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Percentage change, or null when there is no previous value to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
