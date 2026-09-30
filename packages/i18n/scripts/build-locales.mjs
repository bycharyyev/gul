// Writes one dictionary module per locale for the storefront: dist/locales/web/{ru,en,tkm}.js.
//
// dist/dictionaries.js holds every key of every app in all three locales as one object (~270 KB
// of source), and a bundler cannot drop properties from an object -- so any page that imported it
// shipped the admin console's strings and two languages the visitor wasn't reading. One module
// per locale lets the web app bundle Russian and load en/tkm only when someone switches.
//
// Derived from the merged `dictionaries` rather than from the source shards so the shard merge
// order (adminBatchA is spread last and wins shared keys like orderStatus.*) is preserved exactly:
// the web copy is the merged dictionary minus `admin.*`, i.e. the same strings the site showed
// before. Runs after `tsc` in this package's build; `dev` runs it once at startup, so an edit to a
// dictionary during `pnpm dev` needs a restart to reach the web app.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { dictionaries } = await import(new URL("../dist/dictionaries.js", import.meta.url).href);

const outDir = join(root, "dist", "locales", "web");
mkdirSync(outDir, { recursive: true });

for (const [locale, dict] of Object.entries(dictionaries)) {
  const web = Object.fromEntries(Object.entries(dict).filter(([key]) => !key.startsWith("admin.")));
  // JSON.parse of a string literal: V8 parses JSON markedly faster than an equivalent object
  // literal, which matters for a large object evaluated on a phone's main thread at startup.
  const body = JSON.stringify(JSON.stringify(web));
  writeFileSync(join(outDir, `${locale}.js`), `const dictionary = JSON.parse(${body});\nexport default dictionary;\n`);
  writeFileSync(
    join(outDir, `${locale}.d.ts`),
    "declare const dictionary: Record<string, string>;\nexport default dictionary;\n",
  );
  console.log(`locales/web/${locale}: ${Object.keys(web).length} keys`);
}
