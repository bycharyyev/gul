import { API_ORIGIN } from "@/lib/api";

/**
 * The API already resolves `avatarUrl` (see `auth.service.ts`'s `toAvatarUrl`) into either a
 * relative API-proxy path (`/api/avatar/<name>`) or, when storage is S3, a full absolute URL.
 * Prefixing `API_ORIGIN` onto an already-absolute URL produced a garbage unparseable src (e.g.
 * `${API_ORIGIN}https://open.s3.regru.cloud/...`) -- every avatar under S3 storage rendered
 * broken. Pass an absolute URL through as-is; only a relative path needs the origin prefixed.
 */
export function resolveAvatarSrc(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  return avatarUrl.startsWith("http") ? avatarUrl : `${API_ORIGIN}${avatarUrl}`;
}
