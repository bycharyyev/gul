// avatarPath is either a bare local-disk filename or a full S3 public URL (see
// avatar.service.ts) -- pass the URL through as-is, only build the API-proxy path for the
// legacy/local-disk case.
export function toAvatarUrl(avatarPath: string | null): string | null {
  if (!avatarPath) return null;
  return avatarPath.startsWith("http") ? avatarPath : `/api/avatar/${avatarPath}`;
}
