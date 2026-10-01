import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, translateError, useI18n } from "./context.js";
import type { Dictionary } from "./dictionaries.js";
import type { Locale } from "./locale.js";

const ru: Dictionary = { greeting: "Привет", "error.INVALID": "Неверно", named: "Привет, {name}", onlyRu: "Только RU" };
const en: Dictionary = { greeting: "Hello", "error.INVALID": "Invalid", named: "Hello, {name}" };
const tkm: Dictionary = { greeting: "Salam", "error.INVALID": "Nädogry", named: "Salam, {name}" };

let api: ReturnType<typeof useI18n>;
function Probe({ k = "greeting", vars }: { k?: string; vars?: Record<string, string> }) {
  api = useI18n();
  return (
    <p data-testid="out">
      {api.locale}:{api.t(k, vars)}
    </p>
  );
}

const out = () => screen.getByTestId("out").textContent;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("I18nProvider", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("renders the default locale first, as the server does", () => {
    localStorage.setItem("topup-hub:locale", "en");
    const load = vi.fn(() => new Promise<Dictionary>(() => {}));
    render(
      <I18nProvider dictionaries={{ ru }} loadDictionary={load}>
        <Probe />
      </I18nProvider>,
    );
    // First paint must match server HTML (ru); the stored locale is applied after mount.
    expect(out()).toBe("ru:Привет");
  });

  it("loads a stored locale lazily and switches only once its dictionary is there", async () => {
    localStorage.setItem("topup-hub:locale", "tkm");
    const pending = deferred<Dictionary>();
    const load = vi.fn((locale: Locale) => (locale === "tkm" ? pending.promise : Promise.reject()));
    render(
      <I18nProvider dictionaries={{ ru }} loadDictionary={load}>
        <Probe />
      </I18nProvider>,
    );

    expect(load).toHaveBeenCalledWith("tkm");
    expect(out()).toBe("ru:Привет"); // no half-switched state while loading
    await act(async () => pending.resolve(tkm));
    expect(out()).toBe("tkm:Salam");
  });

  it("falls back to the default dictionary for keys a locale lacks", async () => {
    render(
      <I18nProvider dictionaries={{ ru, en }}>
        <Probe k="onlyRu" />
      </I18nProvider>,
    );
    act(() => api.setLocale("en"));
    await waitFor(() => expect(out()).toBe("en:Только RU"));
  });

  it("returns the key itself when no dictionary has it, and interpolates variables", async () => {
    render(
      <I18nProvider dictionaries={{ ru }}>
        <Probe k="named" vars={{ name: "Altyn" }} />
      </I18nProvider>,
    );
    expect(out()).toBe("ru:Привет, Altyn");
    expect(api.t("missing.key")).toBe("missing.key");
  });

  it("applies only the latest switch when two loads finish out of order", async () => {
    const enLoad = deferred<Dictionary>();
    const tkmLoad = deferred<Dictionary>();
    const load = vi.fn((locale: Locale) => (locale === "en" ? enLoad.promise : tkmLoad.promise));
    render(
      <I18nProvider dictionaries={{ ru }} loadDictionary={load}>
        <Probe />
      </I18nProvider>,
    );

    act(() => api.setLocale("en"));
    act(() => api.setLocale("tkm"));
    await act(async () => tkmLoad.resolve(tkm));
    await act(async () => enLoad.resolve(en)); // the earlier request finishes last
    expect(out()).toBe("tkm:Salam");
  });

  it("still switches when a locale fails to load, falling back to the default text", async () => {
    const load = vi.fn(() => Promise.reject(new Error("chunk gone after deploy")));
    render(
      <I18nProvider dictionaries={{ ru }} loadDictionary={load}>
        <Probe />
      </I18nProvider>,
    );
    act(() => api.setLocale("en"));
    await waitFor(() => expect(out()).toBe("en:Привет"));
  });

  it("persists the choice and reports it, unless told not to", async () => {
    const onLocaleChange = vi.fn();
    render(
      <I18nProvider dictionaries={{ ru, en }} onLocaleChange={onLocaleChange}>
        <Probe />
      </I18nProvider>,
    );
    act(() => api.setLocale("en"));
    expect(localStorage.getItem("topup-hub:locale")).toBe("en");
    expect(onLocaleChange).toHaveBeenCalledWith("en");

    act(() => api.setLocale("ru", { persist: false })); // e.g. synced from the profile
    expect(onLocaleChange).toHaveBeenCalledTimes(1);
  });
});

describe("translateError", () => {
  afterEach(cleanup);

  it("translates a known API error code and passes unknown messages through", () => {
    render(
      <I18nProvider dictionaries={{ ru }}>
        <Probe />
      </I18nProvider>,
    );
    expect(translateError(api.t, "INVALID")).toBe("Неверно");
    expect(translateError(api.t, "Something the server said")).toBe("Something the server said");
  });
});
