import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const apiSource = join(root, "apps", "api", "src");
const violations = [];
// These are platform probes/read models rather than business commands. Keep the exception small
// and explicit so adding another direct persistence dependency is a reviewed architecture change.
const platformControllerExceptions = new Set([
  join(apiSource, "health", "health.controller.ts"),
  join(apiSource, "metrics", "api-metrics.controller.ts"),
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith(".controller.ts")) await checkController(path);
    else if (entry.name.endsWith(".service.ts")) await checkFinancialMutation(path);
  }
}

// A stored balance is a cache of an append-only history, never the record itself. Any file that
// moves one must also write to that vertical's ledger, so a wrong balance can be recomputed from
// evidence instead of argued about. Two ledgers exist (sellers and marketplace purchases); this
// accepts either, because the rule is "write to A ledger", not "call one specific helper".
const LEDGER_WRITES = ["ledger.record", "sellerLedgerEntry.create", "marketplacePurchaseLedger.create"];

async function checkFinancialMutation(path) {
  const source = await readFile(path, "utf8");
  if (!/balanceTmt:\s*\{\s*(increment|decrement):/.test(source)) return;
  if (LEDGER_WRITES.some((call) => source.includes(call))) return;
  violations.push(
    `${relative(root, path)}: balance mutation must write an append-only ledger entry in the same transaction (one of: ${LEDGER_WRITES.join(", ")})`,
  );
}


async function checkController(path) {
  if (platformControllerExceptions.has(path)) return;
  const source = await readFile(path, "utf8");
  if (/PrismaService|from ["'][^"']*\/prisma\//.test(source)) {
    violations.push(`${relative(root, path)}: controllers must call application services, not Prisma`);
  }
}

await walk(apiSource);

// Every bare import in the API must be a dependency the API itself declares. pnpm's virtual store
// happens to expose some transitive packages during local development, and TypeScript is satisfied
// by an @types/* package alone -- so an import of a package nobody declared typechecks, tests
// green (unit tests never load main.ts) and then dies at runtime the moment the production image
// starts. That is exactly how `import express from "express"` in common/body-parsing.ts reached
// production on 2026-09-07: the deploy migrated the database, the new api could not boot, and the
// pipeline rolled the image back onto an already-migrated schema.
async function checkDeclaredDependencies() {
  const manifest = JSON.parse(await readFile(join(root, "apps", "api", "package.json"), "utf8"));
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);

  const files = [];
  const collect = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.name.endsWith(".ts")) files.push(path);
    }
  };
  await collect(apiSource);

  // Anchored to the start of a line on purpose: a loose /from ["']x["']/ also matches prose in a
  // doc comment (`separated from "invalid" on purpose`) and reports it as a missing package.
  const patterns = [
    /^\s*(?:import|export)[^"'\n]*?from\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const undeclared = new Map();

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const specifiers = patterns.flatMap((pattern) => [...source.matchAll(pattern)]);
    for (const [, raw] of specifiers) {
      if (raw.startsWith(".") || raw.startsWith("/")) continue;
      if (raw.startsWith("node:")) continue;
      const parts = raw.split("/");
      const name = raw.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
      if (declared.has(name) || builtinModules.includes(name)) continue;
      if (!undeclared.has(name)) undeclared.set(name, relative(root, file));
    }
  }

  for (const [name, file] of undeclared) {
    violations.push(`${file}: imports "${name}", which apps/api/package.json does not declare`);
  }
}

await checkDeclaredDependencies();

if (violations.length) {
  console.error("Architecture boundary violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries OK");
}
