const DEFAULT_ORIGIN = "https://api.gulyaly.com";

function apiOrigin(): string {
  const configured = process.env.API_PUBLIC_URL || DEFAULT_ORIGIN;
  // API_PUBLIC_URL is sometimes set with the /api prefix (the web build uses that form).
  return configured.replace(/\/+$/, "").replace(/\/api$/, "");
}

/**
 * Turns the different ways this codebase stores a picture into one absolute https URL a phone can
 * fetch: a full URL (S3 public bucket, external CDN), an `/api/...` path, or the bare filename an
 * avatar keeps when it lives on the API's own disk. Returns undefined for anything that is not
 * safe to hand to a device (empty, plain http, a data: URI), so a notification simply falls back
 * to the app icon instead of trying to load it.
 */
export function absoluteImageUrl(value: string | null | undefined, origin: string = apiOrigin()): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return undefined;
  if (trimmed.startsWith("//")) return undefined;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/api/avatar/${trimmed}`;
}
