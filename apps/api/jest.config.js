/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  // The workspace packages ship as ESM (module: NodeNext, explicit .js extensions) -- see
  // CLAUDE.md's build-order note. Unit tests never noticed, because they import narrow modules;
  // app.boot.spec.ts pulls in the whole AppModule, which reaches them through the DTOs and then
  // chokes on `export * from "./enums.js"`. Point jest at the TypeScript sources instead, which
  // ts-jest already transpiles.
  moduleNameMapper: {
    // Those sources also carry explicit .js extensions on relative imports, which is correct for
    // NodeNext and unresolvable for jest's CJS resolver. apps/api's own imports never use them,
    // so stripping the extension is safe here.
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@topup-hub/types$": "<rootDir>/../../../packages/types/src/index.ts",
    "^@topup-hub/api-client$": "<rootDir>/../../../packages/api-client/src/index.ts",
  },
  // Jest's 5s default is too tight for the specs that boot a real Nest application and issue HTTP
  // round-trips through supertest (trust-proxy.spec.ts boots three and makes five). In isolation
  // that suite runs in ~2s, but `pnpm test` has turbo running five packages' suites at once, and
  // under that load the same suite has been measured at 18s and 32s -- a 9-15x slowdown that puts
  // individual tests over 5000ms. The failure then reads as a bare `thrown: "Exceeded timeout"`
  // with no assertion diff, which looks like a mystery flake rather than a saturated machine.
  //
  // 20s is generous for anything here while still failing a genuinely hung test in reasonable
  // time. Raise the specific test's own timeout instead if one legitimately needs longer.
  testTimeout: 20_000,
};
