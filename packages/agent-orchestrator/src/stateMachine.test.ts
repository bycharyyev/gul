import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  gateForState,
  IllegalTransitionError,
  recordGateFailure,
  transition,
  unblock,
} from "./stateMachine.js";
import { MAX_RETRIES, type Task } from "./types.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: "TEST-1",
    title: "test task",
    description: "test",
    state: "DEVELOPMENT",
    createdAt: now,
    updatedAt: now,
    dependencies: [],
    approvalPolicy: {
      qa: "AUTO",
      security: "AUTO",
      devops: "AUTO",
      staging: "AUTO",
      production_deployment: "HUMAN_APPROVAL",
    },
    attempts: { qa: 0, security: 0, devops: 0 },
    artifacts: [],
    ...overrides,
  };
}

test("legal transitions are permitted", () => {
  assert.equal(canTransition("DEVELOPMENT", "QA"), true);
  assert.equal(canTransition("QA", "SECURITY_REVIEW"), true);
  assert.equal(canTransition("STAGING", "PRODUCTION"), true);
});

test("gates cannot be skipped — illegal transitions are rejected", () => {
  // Development straight to Production, or Backlog straight to Completed: neither is in the table.
  assert.equal(canTransition("DEVELOPMENT", "PRODUCTION"), false);
  assert.equal(canTransition("BACKLOG", "COMPLETED"), false);
  assert.equal(canTransition("QA", "DEVOPS"), false); // must pass through SECURITY_REVIEW first

  const task = makeTask({ state: "DEVELOPMENT" });
  assert.throws(() => transition(task, "PRODUCTION"), IllegalTransitionError);
  assert.equal(task.state, "DEVELOPMENT", "state must be unchanged after a rejected transition");
});

test("terminal states have no outgoing transitions", () => {
  assert.deepEqual(canTransition("COMPLETED", "DEVELOPMENT"), false);
  assert.deepEqual(canTransition("CANCELLED", "PLANNING"), false);
});

test("a gate failure below MAX_RETRIES loops back for another attempt", () => {
  const task = makeTask({ state: "QA" });
  const result = recordGateFailure(task, "qa", "QA_FAILED");
  // QA_FAILED -> DEVELOPMENT is the only sanctioned next step from a failed QA gate.
  assert.equal(task.attempts.qa, 1);
  assert.notEqual(result, "BLOCKED");
});

test("MAX_RETRIES failures of the same gate blocks the task instead of looping forever", () => {
  const task = makeTask({ state: "QA" });
  for (let i = 0; i < MAX_RETRIES; i++) {
    task.state = "QA"; // simulate QA being re-invoked after each retry
    recordGateFailure(task, "qa", "QA_FAILED");
  }
  assert.equal(task.state, "BLOCKED", "the Nth failure (N=MAX_RETRIES) must trip BLOCKED, not loop again");
  assert.equal(task.attempts.qa, MAX_RETRIES);
  assert.ok(task.blockedReason?.includes("qa"));
  assert.equal(task.blockedFromState, "QA_FAILED");
});

test("unblock() resumes at the recorded state and resets that gate's counter", () => {
  const task = makeTask({ state: "QA" });
  for (let i = 0; i < MAX_RETRIES; i++) {
    task.state = "QA";
    recordGateFailure(task, "qa", "QA_FAILED");
  }
  assert.equal(task.state, "BLOCKED");

  const resumed = unblock(task);
  assert.equal(resumed, "QA_FAILED");
  assert.equal(task.attempts.qa, 0, "retry counter must reset on human-approved unblock");
  assert.equal(task.blockedReason, undefined);
});

test("gateForState maps every failure-bearing state to its owning gate", () => {
  assert.equal(gateForState("QA_FAILED"), "qa");
  assert.equal(gateForState("SECURITY_FAILED"), "security");
  assert.equal(gateForState("DEVOPS"), "devops");
  assert.equal(gateForState("STAGING"), "devops");
  assert.equal(gateForState("PRODUCTION"), "devops");
  assert.equal(gateForState("PLANNING"), null);
});
