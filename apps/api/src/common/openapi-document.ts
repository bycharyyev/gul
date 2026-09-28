import type { OpenAPIObject } from "@nestjs/swagger";

// The OpenAPI document is built once in main.ts, after every module is registered, which is later
// than any controller can be given it through dependency injection. It is parked here so the
// staff-only route in admin-stats can serve it without the document being public.
let document: OpenAPIObject | null = null;

export function setOpenApiDocument(doc: OpenAPIObject): void {
  document = doc;
}

export function getOpenApiDocument(): OpenAPIObject | null {
  return document;
}

// Swagger UI and /docs-json hand anyone a map of every route, admin ones included (S-04 in
// docs/analysis/SECURITY.md). Public outside production; in production only when explicitly
// asked for, and staff read the same document through GET /api/admin/stats/openapi.
export function isPublicApiDocsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.API_DOCS_PUBLIC === "true") return true;
  if (env.API_DOCS_PUBLIC === "false") return false;
  return env.NODE_ENV !== "production";
}
