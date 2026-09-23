const STORAGE_KEY = "topup-hub:referral-code";

export interface StoredReferral {
  code: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerUrl?: string;
}

/** Captured when a visitor opens /r/[code]; consumed (and cleared) on successful registration.
 *  Deliberately unvalidated here -- the backend's recordReferral silently ignores a bad/garbage
 *  code rather than blocking signup, so there's nothing to check client-side. */
export function setStoredReferral(referral: StoredReferral) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...referral, code: referral.code.trim().toLowerCase() }),
    );
  } catch {
    // private browsing / storage disabled -- attribution just won't persist, non-fatal
  }
}

export function getStoredReferral(): StoredReferral | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // Older sessions may still hold the plain-string format this replaced.
    if (!raw.startsWith("{")) return { code: raw };
    const parsed = JSON.parse(raw) as StoredReferral;
    return parsed.code ? parsed : null;
  } catch {
    return null;
  }
}

export function clearStoredReferral() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
