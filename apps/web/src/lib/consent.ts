"use client";

import { useEffect, useState } from "react";

// The one place the visitor's analytics choice lives. Kept under the key the old inform-only
// banner used: whoever clicked its "Хорошо" ("accepted") is treated as having accepted.
const STORAGE_KEY = "gulyaly_cookie_consent";
const CHANGE_EVENT = "gulyaly:consent-change";

export type Consent = "accepted" | "declined";

export function readConsent(): Consent | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(consent: Consent) {
  try {
    window.localStorage.setItem(STORAGE_KEY, consent);
  } catch {
    // storage disabled -- the choice still applies for this page view
  }
  window.dispatchEvent(new CustomEvent<Consent>(CHANGE_EVENT, { detail: consent }));
}

/** null until mounted (the server cannot know), then the stored choice; follows later changes. */
export function useConsent(): { consent: Consent | null; ready: boolean } {
  const [state, setState] = useState<{ consent: Consent | null; ready: boolean }>({ consent: null, ready: false });

  useEffect(() => {
    setState({ consent: readConsent(), ready: true });
    const onChange = (event: Event) => setState({ consent: (event as CustomEvent<Consent>).detail, ready: true });
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return state;
}
