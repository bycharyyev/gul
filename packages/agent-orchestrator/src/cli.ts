#!/usr/bin/env node
import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadState, saveState } from "./stateStore.js";
import { approve, cancel, createTask, nextAction, newTaskId, recordResult, unblockTask } from "./orchestrator.js";
import { buildContext, renderContext } from "./contextBuilder.js";
import { MAX_RETRIES, RETRY_GATES, type ArtifactResult, type Task } from "./types.js";
import { gateForState } from "./stateMachine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "prompts");

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function statusLine(task: Task): string {
  const gate = gateForState(task.state) ?? gateForState(task.blockedFromState ?? task.state);
  const attempts = gate ? `${task.attempts[gate]}/${MAX_RETRIES}` : "-";
  const last = task.artifacts[task.artifacts.length - 1];
  return [
    `PROJECT: topup-hub`,
    `TASK: ${task.id}`,
    `TITLE: ${task.title}`,
    `STATE: ${task.state}`,
    `ATTEMPT: ${attempts}`,
    `LAST RESULT: ${last ? `${last.result} (${last.agent} @ ${last.state})` : "-"}`,
    last ? `REASON: ${last.summary}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function printDirective(task: Task) {
  const directive = nextAction(task);
  console.log("");
  console.log(statusLine(task));
  console.log("");
  switch (directive.kind) {
    case "INVOKE_AGENT": {
      const promptPath = join(PROMPTS_DIR, directive.promptFile);
      console.log(`NEXT: invoke agent "${directive.agent}"`);
      console.log(`PROMPT FILE: ${promptPath}`);
      if (!existsSync(promptPath)) console.log(`  (warning: prompt file does not exist yet)`);
      console.log("");
      console.log("--- context to pass to the subagent, after the prompt contract ---");
      const project = loadState();
      console.log(renderContext(buildContext(task, project)));
      console.log("--- end context ---");
      break;
    }
    case "AWAIT_HUMAN_APPROVAL":
      console.log(`NEXT: awaiting human approval for gate "${directive.gate}"`);
      console.log(`REASON: ${directive.reason}`);
      console.log(`Run: task approve --id ${task.id}`);
      break;
    case "BLOCKED":
      console.log(`NEXT: nothing — task is BLOCKED`);
      console.log(`GATE: ${directive.gate}  ATTEMPTS: ${directive.attempts}/${MAX_RETRIES}`);
      console.log(`REASON: ${directive.reason}`);
      console.log(`Human decision required. After a manual fix: task unblock --id ${task.id}`);
      break;
    case "DONE":
      console.log(`NEXT: nothing — task is COMPLETED`);
      break;
    case "CANCELLED":
      console.log(`NEXT: nothing — task is CANCELLED`);
      break;
  }
}

function cmdNew(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      id: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      depends: { type: "string" },
    },
  });
  const id = values.id ?? newTaskId();
  if (!values.title || !values.description) fail("--title and --description are required");

  const project = loadState();
  const dependencies = values.depends ? values.depends.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const task = createTask(project, { id, title: values.title, description: values.description, dependencies });
  saveState(project);
  console.log(`Created task ${task.id}, state=${task.state}`);
  printDirective(task);
}

function cmdNext(args: string[]) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } } });
  if (!values.id) fail("--id is required");
  const project = loadState();
  const task = project.tasks[values.id];
  if (!task) fail(`Unknown task ${values.id}`);
  printDirective(task);
}

const VALID_RESULTS: ArtifactResult[] = ["PASSED", "FAILED", "COMPLETED", "BLOCKED_ON_HUMAN", "APPROVED"];

function cmdRecord(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      id: { type: "string" },
      agent: { type: "string" },
      result: { type: "string" },
      summary: { type: "string" },
      "details-file": { type: "string" },
    },
  });
  if (!values.id || !values.agent || !values.result || !values.summary) {
    fail("--id, --agent, --result, --summary are required");
  }
  if (!VALID_RESULTS.includes(values.result as ArtifactResult)) {
    fail(`--result must be one of ${VALID_RESULTS.join(", ")}`);
  }
  let details: unknown;
  if (values["details-file"]) {
    if (!existsSync(values["details-file"])) fail(`details file not found: ${values["details-file"]}`);
    details = JSON.parse(readFileSync(values["details-file"], "utf-8"));
  }

  const project = loadState();
  const task = recordResult(project, {
    taskId: values.id,
    agent: values.agent as Task["artifacts"][number]["agent"],
    result: values.result as ArtifactResult,
    summary: values.summary,
    details,
  });
  saveState(project);
  printDirective(task);
}

function cmdApprove(args: string[]) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } } });
  if (!values.id) fail("--id is required");
  const project = loadState();
  const task = approve(project, values.id);
  saveState(project);
  console.log(`Approved. Task ${task.id} -> ${task.state}`);
  printDirective(task);
}

function cmdUnblock(args: string[]) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } } });
  if (!values.id) fail("--id is required");
  const project = loadState();
  const task = unblockTask(project, values.id);
  saveState(project);
  console.log(`Unblocked. Task ${task.id} -> ${task.state}`);
  printDirective(task);
}

function cmdCancel(args: string[]) {
  const { values } = parseArgs({ args, options: { id: { type: "string" }, reason: { type: "string" } } });
  if (!values.id || !values.reason) fail("--id and --reason are required");
  const project = loadState();
  const task = cancel(project, values.id, values.reason);
  saveState(project);
  console.log(`Cancelled task ${task.id}: ${values.reason}`);
}

function cmdStatus(args: string[]) {
  const { values } = parseArgs({ args, options: { id: { type: "string" } } });
  if (!values.id) fail("--id is required");
  const project = loadState();
  const task = project.tasks[values.id];
  if (!task) fail(`Unknown task ${values.id}`);
  const directive = nextAction(task);
  console.log(statusLine(task));
  console.log(`NEXT: ${directive.kind === "INVOKE_AGENT" ? directive.agent : directive.kind}`);
}

function cmdList() {
  const project = loadState();
  const tasks = Object.values(project.tasks);
  if (!tasks.length) {
    console.log("No tasks yet. Create one with: task new --title ... --description ...");
    return;
  }
  for (const task of tasks) {
    const gate = gateForState(task.state) ?? gateForState(task.blockedFromState ?? task.state);
    const attempts = gate ? `${task.attempts[gate]}/${MAX_RETRIES}` : "-";
    console.log(`${task.id}  [${task.state}]  attempts=${attempts}  ${task.title}`);
  }
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "new":
    cmdNew(rest);
    break;
  case "next":
    cmdNext(rest);
    break;
  case "record":
    cmdRecord(rest);
    break;
  case "approve":
    cmdApprove(rest);
    break;
  case "unblock":
    cmdUnblock(rest);
    break;
  case "cancel":
    cmdCancel(rest);
    break;
  case "status":
    cmdStatus(rest);
    break;
  case "list":
    cmdList();
    break;
  default:
    console.log(`Usage: task <new|next|record|approve|unblock|cancel|status|list> [options]

  task new     --title T --description D [--id ID] [--depends A,B]
  task next    --id ID
  task record  --id ID --agent <planner|designer|developer|qa|security|devops> \\
               --result <PASSED|FAILED|COMPLETED|BLOCKED_ON_HUMAN> --summary "..." [--details-file f.json]
  task approve --id ID
  task unblock --id ID
  task cancel  --id ID --reason "..."
  task status  --id ID
  task list

RETRY_GATES: ${RETRY_GATES.join(", ")}   MAX_RETRIES: ${MAX_RETRIES}`);
    process.exit(command ? 1 : 0);
}
