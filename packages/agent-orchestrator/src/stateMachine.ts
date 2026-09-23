import { MAX_RETRIES, type RetryGate, type Task, type TaskState } from "./types.js";

/**
 * The single source of truth for legal transitions. A transition not listed here is
 * impossible by construction — gates cannot be skipped by an agent's optimism, only
 * by this table allowing it.
 */
const TRANSITIONS: Record<TaskState, TaskState[]> = {
  BACKLOG: ["PLANNING", "CANCELLED"],
  PLANNING: ["DESIGN", "BLOCKED", "CANCELLED"],
  DESIGN: ["READY_FOR_DEVELOPMENT", "BLOCKED", "CANCELLED"],
  READY_FOR_DEVELOPMENT: ["DEVELOPMENT", "CANCELLED"],
  DEVELOPMENT: ["QA", "CANCELLED"],
  QA: ["SECURITY_REVIEW", "QA_FAILED", "CANCELLED"],
  QA_FAILED: ["DEVELOPMENT", "BLOCKED", "CANCELLED"],
  SECURITY_REVIEW: ["DEVOPS", "SECURITY_FAILED", "CANCELLED"],
  SECURITY_FAILED: ["DEVELOPMENT", "BLOCKED", "CANCELLED"],
  DEVOPS: ["STAGING", "DEVOPS", "BLOCKED", "CANCELLED"],
  STAGING: ["PRODUCTION", "DEVOPS", "BLOCKED", "CANCELLED"],
  PRODUCTION: ["COMPLETED", "DEVOPS", "BLOCKED", "CANCELLED"],
  COMPLETED: [],
  BLOCKED: [], // only leaves via the dedicated unblock() path below, never a plain transition
  CANCELLED: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class IllegalTransitionError extends Error {
  constructor(taskId: string, from: TaskState, to: TaskState) {
    super(`Illegal transition for task ${taskId}: ${from} -> ${to} is not permitted by the state machine`);
    this.name = "IllegalTransitionError";
  }
}

/** Mutates task.state in place after validating the transition. Throws on an illegal jump. */
export function transition(task: Task, to: TaskState): void {
  if (!canTransition(task.state, to)) {
    throw new IllegalTransitionError(task.id, task.state, to);
  }
  task.state = to;
  task.updatedAt = new Date().toISOString();
}

/** Which retry-counted gate owns a given *_FAILED / retry-eligible state, if any. */
export function gateForState(state: TaskState): RetryGate | null {
  switch (state) {
    case "QA_FAILED":
      return "qa";
    case "SECURITY_FAILED":
      return "security";
    case "DEVOPS":
    case "STAGING":
    case "PRODUCTION":
      return "devops";
    default:
      return null;
  }
}

/**
 * Records a gate failure: increments its retry counter and decides whether the task
 * should loop back for another attempt or be BLOCKED for human intervention.
 * Returns the resulting state.
 */
export function recordGateFailure(task: Task, gate: RetryGate, failedIntoState: TaskState): TaskState {
  task.attempts[gate] += 1;
  // Always land in the gate's own failure-marker state first (e.g. QA -> QA_FAILED) — that's
  // the only state in the table that's legally allowed to go on to BLOCKED.
  transition(task, failedIntoState);
  if (task.attempts[gate] >= MAX_RETRIES) {
    task.blockedReason = `Gate "${gate}" failed ${task.attempts[gate]} times (MAX_RETRIES=${MAX_RETRIES})`;
    task.blockedFromState = failedIntoState;
    transition(task, "BLOCKED");
  }
  return task.state;
}

/** Human-triggered recovery from BLOCKED: resets the gate's counter and resumes. */
export function unblock(task: Task): TaskState {
  if (task.state !== "BLOCKED" || !task.blockedFromState) {
    throw new Error(`Task ${task.id} is not BLOCKED or has no recorded resume state`);
  }
  const resumeState = task.blockedFromState;
  const gate = gateForState(resumeState);
  if (gate) task.attempts[gate] = 0;
  task.state = resumeState; // direct assignment: BLOCKED has no listed transitions, this is the sanctioned escape hatch
  task.blockedReason = undefined;
  task.blockedFromState = undefined;
  task.updatedAt = new Date().toISOString();
  return task.state;
}

export function isTerminal(state: TaskState): boolean {
  return state === "COMPLETED" || state === "BLOCKED" || state === "CANCELLED";
}
