/**
 * Where to land after signing in, when something sent the visitor here mid-task.
 *
 * Read off `window.location` at submit time rather than through `useSearchParams`: this is a
 * static route, and that hook opts the whole page out of prerendering unless it is wrapped in a
 * suspense boundary — a lot of machinery for a value only needed once, in the browser, after a
 * click.
 *
 * Only a path on this site: `next` arrives in a URL anybody can write, and following an absolute
 * one would turn our own login form into a redirector to somebody else's. `//evil.example` is a
 * protocol-relative URL, which is why a leading slash alone is not enough of a check.
 */
export function safeNext(): string | null {
  const value = new URLSearchParams(window.location.search).get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
