import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DEFAULT_APPROVAL_POLICY,
  MAX_RETRIES,
  type AgentRole,
  type ApprovalPolicy,
  type ArtifactResult,
  type Directive,
  type ProjectState,
  type Task,
  type TaskState,
} from "./types.js";
import { canTransition, gateForState, isTerminal, recordGateFailure, transition, unblock } from "./stateMachine.js";
import { appendAudit } from "./stateStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPROVAL_POLICY_FILE = join(__dirname, "..", "config", "approval-policy.json");

/** The repo-default policy, loaded from config/approval-policy.json so it's a real config file,
 * not a decorative one — editing it changes behavior without touching code. */
function loadDefaultApprovalPolicy(): ApprovalPolicy {
  if (!existsSync(APPROVAL_POLICY_FILE)) return DEFAULT_APPROVAL_POLICY;
  return JSON.parse(readFileSync(APPROVAL_POLICY_FILE, "utf-8")) as ApprovalPolicy;
}

const PROMPT_FILE: Record<AgentRole, string> = {
  orchestrator: "orchestrator.md",
  planner: "planner.md",
  designer: "designer.md",
  developer: "developer.md",
  qa: "qa.md",
  security: "security.md",
  devops: "devops.md",
};

export function createTask(
  project: ProjectState,
  input: { id: string; title: string; description: string; dependencies?: string[]; approvalPolicy?: Partial<ApprovalPolicy> },
): Task {
  if (project.tasks[input.id]) {
    throw new Error(`Task ${input.id} already exists`);
  }
  const now = new Date().toISOString();
  const task: Task = {
    id: input.id,
    title: input.title,
    description: input.description,
    state: "BACKLOG",
    createdAt: now,
    updatedAt: now,
    dependencies: input.dependencies ?? [],
    approvalPolicy: { ...loadDefaultApprovalPolicy(), ...(input.approvalPolicy ?? {}) },
    attempts: { qa: 0, security: 0, devops: 0 },
    artifacts: [],
  };
  project.tasks[task.id] = task;
  appendAudit({ timestamp: now, taskId: task.id, event: "TASK_CREATED", to: "BACKLOG" });
  transition(task, "PLANNING");
  appendAudit({ timestamp: task.updatedAt, taskId: task.id, event: "STATE_TRANSITION", from: "BACKLOG", to: "PLANNING" });
  return task;
}

/** Pure decision function: given the task's current state, what must happen next? */
export function nextAction(task: Task): Directive {
  if (task.state === "CANCELLED") return { kind: "CANCELLED", taskId: task.id };
  if (task.state === "COMPLETED") return { kind: "DONE", taskId: task.id };

  if (task.state === "BLOCKED") {
    const gate = task.blockedFromState ? gateForState(task.blockedFromState) : null;
    return {
      kind: "BLOCKED",
      taskId: task.id,
      gate: gate ?? "devops",
      reason: task.blockedReason ?? "Blocked for an unspecified reason",
      attempts: gate ? task.attempts[gate] : MAX_RETRIES,
    };
  }

  const agentFor: Partial<Record<TaskState, AgentRole>> = {
    PLANNING: "planner",
    DESIGN: "designer",
    READY_FOR_DEVELOPMENT: "developer",
    DEVELOPMENT: "developer",
    QA_FAILED: "developer",
    SECURITY_FAILED: "developer",
    QA: "qa",
    SECURITY_REVIEW: "security",
    DEVOPS: "devops",
    STAGING: "devops",
    PRODUCTION: "devops",
  };

  // Staging → production is the one place a human-approval gate can hold the pipeline even
  // though the state machine itself would otherwise be ready to proceed.
  if (task.state === "STAGING") {
    const lastAtStaging = [...task.artifacts].reverse().find((a) => a.state === "STAGING");
    if (lastAtStaging?.result === "PASSED" && task.approvalPolicy.production_deployment === "HUMAN_APPROVAL") {
      return {
        kind: "AWAIT_HUMAN_APPROVAL",
        taskId: task.id,
        gate: "production_deployment",
        reason: "Staging validated. Production deployment requires human approval before proceeding.",
      };
    }
  }

  const agent = agentFor[task.state];
  if (!agent) {
    throw new Error(`No agent mapped for state ${task.state} (task ${task.id})`);
  }

  return {
    kind: "INVOKE_AGENT",
    taskId: task.id,
    agent,
    promptFile: PROMPT_FILE[agent],
    reason: `Task is in state ${task.state}`,
  };
}

export interface RecordResultInput {
  taskId: string;
  agent: AgentRole;
  result: ArtifactResult;
  summary: string;
  details?: unknown;
}

/** Applies a real agent's structured output to the task and advances the state machine. */
export function recordResult(project: ProjectState, input: RecordResultInput): Task {
  const task = project.tasks[input.taskId];
  if (!task) throw new Error(`Unknown task ${input.taskId}`);
  if (isTerminal(task.state)) throw new Error(`Task ${task.id} is already terminal (${task.state})`);

  const fromState = task.state;
  task.artifacts.push({
    agent: input.agent,
    state: fromState,
    timestamp: new Date().toISOString(),
    result: input.result,
    summary: input.summary,
    details: input.details,
  });
  appendAudit({
    timestamp: new Date().toISOString(),
    taskId: task.id,
    event: "AGENT_INVOKED",
    agent: input.agent,
    from: fromState,
    detail: `${input.result}: ${input.summary}`,
  });

  if (input.result === "BLOCKED_ON_HUMAN") {
    task.blockedReason = input.summary;
    task.blockedFromState = fromState;
    transition(task, "BLOCKED");
    appendAudit({ timestamp: task.updatedAt, taskId: task.id, event: "BLOCKED", from: fromState, agent: input.agent, detail: input.summary });
    return task;
  }

  switch (input.agent) {
    case "planner":
      applyLinearAdvance(task, fromState, "DESIGN", input.result);
      break;
    case "designer":
      applyLinearAdvance(task, fromState, "READY_FOR_DEVELOPMENT", input.result);
      break;
    case "developer":
      if (input.result === "COMPLETED") {
        if (fromState === "READY_FOR_DEVELOPMENT") transition(task, "DEVELOPMENT");
        transition(task, "QA");
      }
      // A plain FAILED from Developer (not BLOCKED_ON_HUMAN) means "still working" — no
      // transition, the same INVOKE_AGENT(developer) directive is emitted again next tick.
      // Developer's contract (prompts/developer.md) requires escalating to BLOCKED_ON_HUMAN
      // rather than looping silently once it cannot make forward progress alone.
      break;
    case "qa":
      if (input.result === "PASSED") {
        transition(task, "SECURITY_REVIEW");
      } else if (input.result === "FAILED") {
        recordGateFailure(task, "qa", "QA_FAILED");
        if (task.state === "QA_FAILED") transition(task, "DEVELOPMENT");
      }
      break;
    case "security":
      if (input.result === "PASSED") {
        transition(task, "DEVOPS");
      } else if (input.result === "FAILED") {
        recordGateFailure(task, "security", "SECURITY_FAILED");
        if (task.state === "SECURITY_FAILED") transition(task, "DEVELOPMENT");
      }
      break;
    case "devops":
      applyDevOpsResult(task, fromState, input.result);
      break;
    case "orchestrator":
      // The Orchestrator role does not itself produce gate-advancing artifacts.
      break;
  }

  appendAudit({ timestamp: task.updatedAt, taskId: task.id, event: "STATE_TRANSITION", from: fromState, to: task.state, agent: input.agent });
  return task;
}

function applyLinearAdvance(task: Task, from: TaskState, to: TaskState, result: ArtifactResult) {
  if (result === "COMPLETED" && canTransition(from, to)) {
    transition(task, to);
  }
  // FAILED here (Planner/Designer couldn't produce output) is treated as needing human input —
  // agents are contractually required to emit BLOCKED_ON_HUMAN instead of a bare FAILED for
  // this case (see prompts/planner.md, prompts/designer.md), so this branch is intentionally inert.
}

function applyDevOpsResult(task: Task, from: TaskState, result: ArtifactResult) {
  if (from === "DEVOPS") {
    if (result === "PASSED") transition(task, "STAGING");
    else if (result === "FAILED") recordGateFailure(task, "devops", "DEVOPS");
  } else if (from === "STAGING") {
    if (result === "PASSED") {
      if (task.approvalPolicy.production_deployment === "AUTO") transition(task, "PRODUCTION");
      // else: stays at STAGING; nextAction() will emit AWAIT_HUMAN_APPROVAL until `task approve`.
    } else if (result === "FAILED") {
      recordGateFailure(task, "devops", "DEVOPS");
    }
  } else if (from === "PRODUCTION") {
    if (result === "PASSED") transition(task, "COMPLETED");
    else if (result === "FAILED") recordGateFailure(task, "devops", "DEVOPS");
  }
}

/** Human approval for a HUMAN_APPROVAL-gated step (currently only production_deployment). */
export function approve(project: ProjectState, taskId: string): Task {
  const task = project.tasks[taskId];
  if (!task) throw new Error(`Unknown task ${taskId}`);
  if (task.state !== "STAGING") throw new Error(`Task ${taskId} is not awaiting approval (state=${task.state})`);
  if (task.approvalPolicy.production_deployment !== "HUMAN_APPROVAL") {
    throw new Error(
      `Task ${taskId} has production_deployment policy "${task.approvalPolicy.production_deployment}", not HUMAN_APPROVAL -- it should already have auto-transitioned, not be waiting on \`task approve\`.`,
    );
  }
  transition(task, "PRODUCTION");
  appendAudit({ timestamp: task.updatedAt, taskId: task.id, event: "APPROVED", from: "STAGING", to: "PRODUCTION" });
  return task;
}

export function cancel(project: ProjectState, taskId: string, reason: string): Task {
  const task = project.tasks[taskId];
  if (!task) throw new Error(`Unknown task ${taskId}`);
  const from = task.state;
  task.cancelledReason = reason;
  transition(task, "CANCELLED");
  appendAudit({ timestamp: task.updatedAt, taskId: task.id, event: "CANCELLED", from, to: "CANCELLED", detail: reason });
  return task;
}

export function unblockTask(project: ProjectState, taskId: string): Task {
  const task = project.tasks[taskId];
  if (!task) throw new Error(`Unknown task ${taskId}`);
  const from = task.state;
  unblock(task);
  appendAudit({ timestamp: task.updatedAt, taskId: task.id, event: "UNBLOCKED", from, to: task.state });
  return task;
}

export function newTaskId(prefix = "TASK"): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
