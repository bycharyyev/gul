import { getOpenApiDocument, isPublicApiDocsEnabled, setOpenApiDocument } from "./openapi-document";

describe("isPublicApiDocsEnabled", () => {
  it("keeps the docs public outside production", () => {
    expect(isPublicApiDocsEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isPublicApiDocsEnabled({})).toBe(true);
  });

  it("hides them in production unless explicitly enabled", () => {
    expect(isPublicApiDocsEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isPublicApiDocsEnabled({ NODE_ENV: "production", API_DOCS_PUBLIC: "true" })).toBe(true);
  });

  it("can be switched off anywhere", () => {
    expect(isPublicApiDocsEnabled({ NODE_ENV: "development", API_DOCS_PUBLIC: "false" })).toBe(false);
  });
});

describe("openapi document holder", () => {
  it("returns what main.ts stored", () => {
    const doc = { openapi: "3.0.0", info: { title: "t", version: "1" }, paths: { "/api/x": {} } };
    setOpenApiDocument(doc);
    expect(getOpenApiDocument()).toBe(doc);
  });
});
