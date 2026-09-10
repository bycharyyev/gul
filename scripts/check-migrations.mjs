import { readFileSync } from "node:fs";

const files = process.argv.slice(2).filter((file) => file.endsWith("migration.sql"));
const destructive = [
  /\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|DATABASE)\b/i,
  /\bALTER\s+TABLE\b[\s\S]*?\bALTER\s+COLUMN\b[\s\S]*?\bTYPE\b/i,
  /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\b/i,
  /\bTRUNCATE\b/i,
];

let failed = false;
for (const file of files) {
  const sql = readFileSync(file, "utf8");
  if (/migration-policy:\s*allow-destructive\s+\S+/i.test(sql)) continue;
  const rule = destructive.find((pattern) => pattern.test(sql));
  if (rule) {
    console.error(`${file}: destructive migration rejected (${rule}). Use expand/contract; an explicit ticketed override must be reviewed separately.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`Migration policy passed for ${files.length} changed migration(s).`);
