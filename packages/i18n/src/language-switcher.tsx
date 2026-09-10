"use client";

import type { ChangeEvent } from "react";
import { useI18n } from "./context.js";
import { LOCALES, LOCALE_LABELS, isLocale } from "./locale.js";

export interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (isLocale(next)) setLocale(next);
  };

  return (
    <select
      value={locale}
      onChange={handleChange}
      aria-label="Language"
      className={className}
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  );
}
