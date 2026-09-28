import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { useTranslation } from "@topup-hub/i18n";
import type { NavGroup } from "./nav-config";

// Jump to any section by typing part of its name (Ctrl+K / Cmd+K, or the search button in the
// top bar). With 33 sections, typing "выв" is faster than finding Withdrawals in the sidebar.
export function CommandPalette({
  groups,
  open,
  onClose,
}: {
  groups: NavGroup[];
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = groups.flatMap((g) => g.items.map((item) => ({ ...item, group: g.label })));
    if (!q) return all;
    return all.filter(
      (item) => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q) || item.to.includes(q),
    );
  }, [groups, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    // After the dialog has rendered, or the ref is still null.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function go(to: string) {
    onClose();
    navigate(to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active].to);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("admin.shell.searchTitle")}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.shell.searchPlaceholder")}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[active] ? `cmd-${active}` : undefined}
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">Esc</kbd>
        </div>
        <ul ref={listRef} id="command-palette-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-400">{t("admin.shell.searchEmpty")}</li>
          )}
          {results.map((item, i) => (
            <li
              key={item.to}
              id={`cmd-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(item.to)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                i === active ? "bg-gradient-brand-soft text-brand-700" : "text-slate-600"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate">{item.label}</span>
              <span className="text-xs text-slate-400">{item.group}</span>
              {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
