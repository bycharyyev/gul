"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dictionaries } from "./dictionaries.js";
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
}

export function I18nProvider({ children, onLocaleChange }: I18nProviderProps) {
  // Always start at DEFAULT_LOCALE so the client's first render matches the server-rendered
  // HTML exactly (SSR has no access to localStorage) -- reading the stored locale eagerly here
  // caused a React hydration mismatch for any returning visitor whose saved locale wasn't the
  // default. The real value is applied a tick later, once mounted (see below).
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) setLocaleState(stored);
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
      setLocaleState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // private browsing / storage disabled -- non-fatal
      }
      if (options?.persist !== false) {
        onLocaleChange?.(next);
      }
    },
    [onLocaleChange],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
      let text = dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replace(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [locale],
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
  const dict = dictionaries[DEFAULT_LOCALE];
  if (!(key in dict)) return message;
  return t(key);
}
