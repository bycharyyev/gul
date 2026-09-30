"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Dictionary } from "./dictionaries.js";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locale.js";

const STORAGE_KEY = "topup-hub:locale";

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export interface I18nContextValue {
  locale: Locale;
  /** Switches the active locale. Persists to localStorage and, by default, calls onLocaleChange. */
  setLocale: (locale: Locale, options?: { persist?: boolean }) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  /** Called when the user actively switches locale (not on initial sync from a profile fetch). */
  onLocaleChange?: (locale: Locale) => void;
  /**
   * Dictionaries available immediately. Must include DEFAULT_LOCALE -- that is what the server
   * renders and what any missing key falls back to.
   */
  dictionaries: Partial<Record<Locale, Dictionary>>;
  /** Fetches a locale not in `dictionaries` (e.g. a lazily loaded chunk) the first time it is used. */
  loadDictionary?: (locale: Locale) => Promise<Dictionary>;
}

export function I18nProvider({ children, onLocaleChange, dictionaries, loadDictionary }: I18nProviderProps) {
  const [loaded, setLoaded] = useState<Partial<Record<Locale, Dictionary>>>(dictionaries);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  // Resolves once `next` can be rendered. A locale that fails to load still resolves: the switch
  // goes ahead and t() falls back to DEFAULT_LOCALE, rather than the choice silently not applying.
  const ensureLoaded = useCallback(
    async (next: Locale) => {
      if (loadedRef.current[next] || !loadDictionary) return;
      try {
        const dict = await loadDictionary(next);
        setLoaded((prev) => ({ ...prev, [next]: dict }));
      } catch {
        // offline, or the chunk is gone after a deploy -- fall back as above
      }
    },
    [loadDictionary],
  );

  // Always start at DEFAULT_LOCALE so the client's first render matches the server-rendered
  // HTML exactly (SSR has no access to localStorage) -- reading the stored locale eagerly here
  // caused a React hydration mismatch for any returning visitor whose saved locale wasn't the
  // default. The real value is applied a tick later, once mounted (see below).
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Switch only once the dictionary is here, so the page goes straight from one language to the
  // next instead of through a half-translated state. Only the most recent request is applied: two
  // quick switches whose loads finish out of order must not land on the first one.
  const requestedRef = useRef<Locale | null>(null);
  const switchTo = useCallback(
    (next: Locale) => {
      requestedRef.current = next;
      void ensureLoaded(next).then(() => {
        if (requestedRef.current === next) setLocaleState(next);
      });
    },
    [ensureLoaded],
  );

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) switchTo(stored);
    // Only meant to run once, right after the client mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale, options?: { persist?: boolean }) => {
      switchTo(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // private browsing / storage disabled -- non-fatal
      }
      if (options?.persist !== false) {
        onLocaleChange?.(next);
      }
    },
    [onLocaleChange, switchTo],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = loaded[locale]?.[key] ?? loaded[DEFAULT_LOCALE]?.[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replace(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [locale, loaded],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}

export function useTranslation() {
  const { t, locale } = useI18n();
  return { t, locale };
}

/** Translates a raw API error message by exact text; falls back to the original message untranslated. */
export function translateError(t: I18nContextValue["t"], message: string): string {
  const key = `error.${message}`;
  const translated = t(key);
  // t() returns the key itself when no dictionary has it.
  return translated === key ? message : translated;
}
