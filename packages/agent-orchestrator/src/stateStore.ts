import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AuditLogEntry, ProjectState } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, "..", "state");
const STATE_FILE = join(STATE_DIR, "project-state.json");
const AUDIT_FILE = join(STATE_DIR, "audit-log.jsonl");

const SCHEMA_VERSION = 1;

function emptyState(): ProjectState {
  return { project: "topup-hub", schemaVersion: SCHEMA_VERSION, tasks: {} };
}

export function loadState(): ProjectState {
  if (!existsSync(STATE_FILE)) return emptyState();
  const raw = readFileSync(STATE_FILE, "utf-8").trim();
  if (!raw) return emptyState();
  return JSON.parse(raw) as ProjectState;
}

/** Atomic write: write to a temp file then rename, so a crash mid-write can never corrupt state.json. */
export function saveState(state: ProjectState): void {
  const tmpFile = `${STATE_FILE}.tmp`;
  writeFileSync(tmpFile, JSON.stringify(state, null, 2) + "\n", "utf-8");
  renameSync(tmpFile, STATE_FILE);
}

export function appendAudit(entry: AuditLogEntry): void {
  appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n", "utf-8");
}

export function readAudit(taskId?: string): AuditLogEntry[] {
  if (!existsSync(AUDIT_FILE)) return [];
  const lines = readFileSync(AUDIT_FILE, "utf-8").trim().split("\n").filter(Boolean);
  const entries = lines.map((l) => JSON.parse(l) as AuditLogEntry);
  return taskId ? entries.filter((e) => e.taskId === taskId) : entries;
}
