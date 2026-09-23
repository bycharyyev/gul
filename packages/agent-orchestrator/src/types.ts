export const TASK_STATES = [
  "BACKLOG",
  "PLANNING",
  "DESIGN",
  "READY_FOR_DEVELOPMENT",
  "DEVELOPMENT",
  "QA",
  "QA_FAILED",
  "SECURITY_REVIEW",
  "SECURITY_FAILED",
  "DEVOPS",
  "STAGING",
  "PRODUCTION",
  "COMPLETED",
  "BLOCKED",
  "CANCELLED",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const AGENT_ROLES = [
  "orchestrator",
  "planner",
  "designer",
  "developer",
  "qa",
  "security",
  "devops",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Gates whose failures loop back to Development and count against MAX_RETRIES. */
export const RETRY_GATES = ["qa", "security", "devops"] as const;
export type RetryGate = (typeof RETRY_GATES)[number];

/** All human-approval checkpoints, including ones that never fail-and-retry (staging/production). */
export const APPROVAL_GATES = ["qa", "security", "devops", "staging", "production_deployment"] as const;
export type Gate = (typeof APPROVAL_GATES)[number];

export type ApprovalMode = "AUTO" | "HUMAN_APPROVAL";
export type ApprovalPolicy = Record<Gate, ApprovalMode>;

export const MAX_RETRIES = 3;

export type ArtifactResult =
  | "PASSED"
  | "FAILED"
  | "COMPLETED"
  | "BLOCKED_ON_HUMAN"
  | "APPROVED";

export interface TaskArtifact {
  agent: AgentRole;
  state: TaskState;
  timestamp: string;
  result: ArtifactResult;
  summary: string;
  /** Full structured payload — test results, security findings, deployment output, etc. */
  details?: unknown;
}

export interface Task {
  id: string;
  title: string;
  /** The original, unmodified user request that spawned this task. */
  description: string;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
  dependencies: string[];
  approvalPolicy: ApprovalPolicy;
  attempts: Record<RetryGate, number>;
  artifacts: TaskArtifact[];
  blockedReason?: string;
  /** The state to resume in once a human unblocks the task. */
  blockedFromState?: TaskState;
  cancelledReason?: string;
}

export interface AuditLogEntry {
  timestamp: string;
  taskId: string;
  event:
    | "TASK_CREATED"
    | "STATE_TRANSITION"
    | "AGENT_INVOKED"
    | "GATE_PASSED"
    | "GATE_FAILED"
    | "BLOCKED"
    | "AWAIT_APPROVAL"
    | "APPROVED"
    | "CANCELLED"
    | "UNBLOCKED";
  from?: TaskState;
  to?: TaskState;
  agent?: AgentRole;
  detail?: string;
}

export interface ProjectState {
  project: string;
  schemaVersion: number;
  tasks: Record<string, Task>;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  qa: "AUTO",
  security: "AUTO",
  devops: "AUTO",
  staging: "AUTO",
  production_deployment: "HUMAN_APPROVAL",
};

/** What the Orchestrator's core computed as the next real-world step. */
export type Directive =
  | { kind: "INVOKE_AGENT"; taskId: string; agent: AgentRole; promptFile: string; reason: string }
  | { kind: "AWAIT_HUMAN_APPROVAL"; taskId: string; gate: Gate; reason: string }
  | { kind: "BLOCKED"; taskId: string; gate: Gate; reason: string; attempts: number }
  | { kind: "DONE"; taskId: string }
  | { kind: "CANCELLED"; taskId: string };
