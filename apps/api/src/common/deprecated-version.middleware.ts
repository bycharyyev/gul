import type { NextFunction, Request, Response } from "express";

/**
 * Marks the unversioned path as deprecated, on the way in.
 *
 * Middleware rather than an interceptor, and that is the whole point of this file. Nest runs
 * guards *before* interceptors, so the first version of this lived behind `ApiKeyGuard` and never
 * ran for a request the guard rejected — a partner whose key had expired got a bare 401 and no
 * hint that the path they were calling is also going away. Middleware runs before the guard, so
 * the headers are on every response: authorised, rejected, or throttled.
 *
 *   Deprecation: true          -- RFC 9745
 *   Sunset: <http-date>        -- RFC 8594
 *   Link: <successor>; rel="successor-version"
 *
 * The date is a promise, not a threat: it must not pass without either the callers having moved
 * or the date having been pushed out deliberately. A sunset that slips silently teaches
 * integrators that our headers can be ignored, and then no later deprecation works either.
 */
export function deprecatedVersionHeaders(successorPrefix: string, sunset: Date) {
  const sunsetHeader = sunset.toUTCString();
  const linkHeader = `<${successorPrefix}>; rel="successor-version"`;

  return function deprecatedVersion(req: Request, res: Response, next: NextFunction): void {
    // Only the caller who arrived without a version is told to move. The same handler serves
    // both paths, and telling somebody who has already migrated to migrate again is exactly how
    // a header earns the right to be ignored.
    if (!isVersioned(req.originalUrl ?? req.url ?? "")) {
      res.setHeader("Deprecation", "true");
      res.setHeader("Sunset", sunsetHeader);
      res.setHeader("Link", linkHeader);
    }
    next();
  };
}

/** A version segment, not merely the letter v somewhere in a path. `/catalog/v1-services` is not one. */
export function isVersioned(url: string): boolean {
  return /\/v\d+\//.test(url);
}
