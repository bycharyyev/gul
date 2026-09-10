# AI Agent Software Engineering System — Architecture

## 0. Repository analysis (Phase 1 findings)

Before designing anything, the repo and environment were inspected directly. This is what's actually true, not assumed:

- **Stack**: pnpm + Turborepo monorepo. `apps/api` (NestJS + Prisma/Postgres), `apps/web` (Next.js), `apps/admin` + `apps/seller` (Vite SPAs), `packages/types` (Zod schemas, compiled), `packages/api-client` (typed fetch client, compiled), `packages/config` (shared `tsconfig.base.json`). New tooling packages live under `packages/*` and are picked up automatically by the `packages/*` glob in `pnpm-workspace.yaml` — no registration needed.
- **No `docs/` folder existed** before this document.
- **Git**: real repository, clean history, feature-branch workflow already in active use (`feature/*` branches, no direct pushes to `main` for in-progress work). `.github/workflows/deploy.yml` deploys `api`/`web`/`admin` on push to `main` only — feature branches are safe to push without triggering production deploys.
- **CI/CD already exists**: Docker builds per app, `docker compose` on a single VPS, `prisma migrate deploy` on release. A DevOps agent should drive *this* pipeline, not invent a parallel one.
- **Critical environment constraint** (checked directly, not assumed):
  - No `claude` (or any LLM) CLI binary is on `PATH` in the sandboxed shell this system's tooling runs in.
  - No `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or similar is set in the shell environment or in any `.env*` file in the repo.
  - Conclusion: **a standalone script cannot independently call an LLM from this environment.** The only real, working LLM execution path available is Claude Code's own subagent mechanism (the `Agent`/Task tool), which can only be invoked from *inside* an active Claude Code session — i.e., by whoever is acting as Orchestrator in a live conversation.

This last point drives the whole design. Rather than pretend to build a fully unattended daemon that doesn't exist in this environment (which section 18 of the brief explicitly forbids — no mock multi-agent system), the architecture below is the closest **real, working** system given that constraint, stated honestly.

## 1. Architectural decision

**Two layers, cleanly separated:**

1. **Deterministic orchestration core** (`packages/agent-orchestrator`, plain TypeScript, no LLM calls): the task state machine, transition rules, quality-gate enforcement, retry/loop protection, project state persistence, audit log, and context building. This layer is 100% reliable, free to run, unit-testable, and restart-safe because it is nothing but code + JSON files on disk.
2. **Agent execution** (real LLM reasoning): each of the 7 roles is a strict prompt contract (`packages/agent-orchestrator/prompts/*.md`). The orchestration core never calls an LLM itself — it computes *"the next thing that must happen is: invoke agent X, with this context, using this prompt"* and emits that as a `Directive`. Whoever is driving the system (in practice: a Claude Code session, acting as **Orchestrator**) reads the directive, invokes a real Claude Code subagent via the `Agent` tool with the specified role prompt and context, gets back a structured result, and feeds it back into the core via `task record`, which advances the state machine.

This is not a simulation: subagents spawned via the `Agent` tool are independent LLM reasoning processes with their own context window and real tool access (file read/write, bash, git). What's honestly *not* true is 24/7 unattended background execution outside of a Claude Code session — that capability does not exist in this sandbox, and claiming otherwise would violate the brief's own rule against faking autonomy.

**Practical effect**: the system is autonomous *within a driven session* — given a task, the Orchestrator loop advances it through Planner → Designer → Developer → QA → Security → DevOps → done without the human writing any code or prompts by hand, retrying failed gates automatically up to `MAX_RETRIES`, and pausing only at genuine human-approval gates (production deploy, by default) or when a gate fails three times (`BLOCKED`, escalated to the human).

## 2. High-level architecture

```
USER
  │  task description
  ▼
ORCHESTRATOR (deterministic core + a live Claude Code session acting as its runtime)
  │
  ├─► PLANNER    (subagent)  — requirements → structured technical task
  ├─► DESIGNER   (subagent)  — UX/UI/component spec, no business logic
  ├─► DEVELOPER  (subagent)  — implementation + tests
  ├─► QA         (subagent)  — independent verification, tries to break it
  ├─► SECURITY   (subagent)  — security + code review
  └─► DEVOPS     (subagent)  — build, staging, (human gate), production
  │
  ▼
ORCHESTRATOR → COMPLETED | BLOCKED
```

All communication is **Orchestrator ↔ Agent**. No agent calls another agent directly (no mesh). Every agent receives only the context the orchestration core decides is relevant for its step — never the full project history.

## 3. The 7 agents

Each agent is defined by a strict contract file at `packages/agent-orchestrator/prompts/<role>.md`, structured as `INPUT / PROCESS / OUTPUT / ALLOWED_ACTIONS / FORBIDDEN_ACTIONS / SUCCESS_CRITERIA / FAILURE_CRITERIA`, per the brief. Summary:

| Agent | Owns | Cannot do |
|---|---|---|
| **Orchestrator** | task breakdown routing, state transitions, retries, escalation, audit log | main implementation work |
| **Planner** | requirements analysis, acceptance criteria, edge cases, dependencies, technical task spec | approve QA/security, write implementation code |
| **Designer** | user flows, component spec, states (loading/empty/error), accessibility, responsive behavior | change business logic |
| **Developer** | frontend/backend/DB/API implementation, tests, lint, typecheck | change requirements, self-approve QA or security |
| **QA** | independent test verification, edge cases, regressions, breaking the implementation | change requirements, approve security, deploy |
| **Security** | authn/authz, injection, secrets, CSRF/SSRF/XSS, race conditions, code review | approve QA, auto-fix Developer's code |
| **DevOps** | Docker/CI/migrations/deploy/rollback/health checks, using the *existing* pipeline | change business requirements |

Every agent's structured output must end with a machine-parseable result block the Orchestrator's CLI can parse, e.g.:

```
RESULT: PASSED
SUMMARY: <one paragraph>
DETAILS: <path to a JSON/markdown artifact file the agent wrote, if any>
```

or for QA/Security specifically on failure:

```
RESULT: FAILED
SEVERITY: HIGH
FAILURE: <exact failure>
REPRODUCTION: <steps>
EXPECTED: <...>
ACTUAL: <...>
RECOMMENDED_FIX: <...>
```

## 4. Task state machine

States (exactly as specified in the brief):

```
BACKLOG → PLANNING → DESIGN → READY_FOR_DEVELOPMENT → DEVELOPMENT → QA
QA →(pass)→ SECURITY_REVIEW      QA →(fail)→ QA_FAILED → DEVELOPMENT
SECURITY_REVIEW →(pass)→ DEVOPS   SECURITY_REVIEW →(fail)→ SECURITY_FAILED → DEVELOPMENT
DEVOPS → STAGING → PRODUCTION → COMPLETED
any state → BLOCKED   (after MAX_RETRIES=3 failures of the same gate)
any state → CANCELLED (human-initiated only)
```

Implemented as an explicit transition table in `src/stateMachine.ts` — **no transition not in the table is permitted**, so gates cannot be skipped by construction, not just by convention.

Per-gate retry counters live on the task (`attempts: { qa: 0, security: 0, devops: 0 }`). Every failure increments the relevant counter; on the 3rd failure of the *same* gate the task moves to `BLOCKED` instead of looping back, and the Orchestrator emits a human-readable escalation (task, failure reason, attempt count, latest error, required decision) instead of retrying a 4th time.

## 5. Shared project state (persistence & restart recovery)

State lives as plain JSON on disk under `packages/agent-orchestrator/state/`, **committed to git**:

- `project-state.json` — all tasks, their current state, retry counters, approval policy, and a list of artifacts (structured per-agent results — summaries, not full transcripts).
- `audit-log.jsonl` — append-only, one JSON object per line, every state transition and agent invocation. This is the full audit trail required by the brief, independent of conversation history.

Because this is committed to git, **restart recovery is trivial and real**: a fresh Claude Code session (or a human) just runs `task status --id <id>` (or `task list`) to see exactly which task is at which state, how many attempts each gate has used, and what the last artifact/result was — the same guarantee `git log` gives for code, applied to task state. No in-memory state is ever load-bearing.

Agents never receive this whole file. The **context builder** (`src/contextBuilder.ts`) extracts, per invocation: the task's own description/acceptance criteria, summaries (not full text) of prior artifacts, dependency tasks reduced to `{id, title, state}`, and — on a retry — the *full* detail of the specific failure that caused the retry (so the Developer sees the exact QA/Security report, not a vague "it failed").

## 6. Orchestration loop

`src/orchestrator.ts` exposes one pure function:

```ts
nextAction(task: Task): Directive
```

returning one of:

- `INVOKE_AGENT` — `{ agent, promptFile, context }`: the CLI prints this; the live Orchestrator (a Claude Code session) invokes the `Agent` tool with that role's prompt + context, and the model genuinely reasons, reads/edits files, and runs commands.
- `AWAIT_HUMAN_APPROVAL` — the task is at a gate whose policy is `HUMAN_APPROVAL` (production deploy, by default); nothing proceeds until `task approve` is run by a human.
- `BLOCKED` — a gate failed 3 times; nothing proceeds until a human intervenes (`task unblock` after manual fix, or `task cancel`).
- `DONE` — task reached `COMPLETED`.

The CLI command `task record --id <id> --agent <role> --result <...>` is how an agent's real output is fed back: it validates the transition against the state machine, updates retry counters, appends the artifact and audit-log entry, and returns the *next* directive — so driving a task to completion is a simple loop of `next directive → run it → record result → repeat`, which a Claude Code session (or a human) executes directly.

## 7. Quality gates & pipeline

```
Developer → Tests → QA → Security → Build → Staging → E2E → (approval) → Production
```

No state can be marked `COMPLETED` without having passed `QA`, `SECURITY_REVIEW`, and `DEVOPS`/`STAGING` in order — enforced by the transition table, not by agent promises. QA is explicitly told never to trust a Developer's "done" claim; it re-derives pass/fail from actually running things.

## 8. Human approval

Per-task, per-gate policy, defaulting to:

```json
{ "development": "AUTO", "qa": "AUTO", "security": "AUTO", "staging": "AUTO", "production_deployment": "HUMAN_APPROVAL" }
```

Configurable via `config/approval-policy.json` (repo default) and overridable per task at creation time. `AWAIT_HUMAN_APPROVAL` is a first-class Directive, not a side effect — the loop simply stops and reports, exactly like `BLOCKED`, until `task approve` is called.

## 9. Cost control

- The deterministic core never invokes an LLM — state transitions, retry logic, and gate checks are free.
- The context builder sends **summaries** of prior artifacts, not full agent transcripts, and dependency tasks are reduced to id/title/state.
- An agent is only invoked when the state machine says its step is next — there is no "just in case" fan-out.
- On retry, only the specific failure detail is expanded to full size; everything else stays summarized.

## 10. Observability

`task status --id <id>` prints exactly the format requested in the brief:

```
PROJECT: topup-hub
TASK: AUTH-021
CURRENT AGENT: QA
STATE: QA
ATTEMPT: 2/3
LAST RESULT: FAILED
REASON: Webhook signature validation missing
NEXT: Developer
```

`task list` gives the same, one line per task, for a project-wide view.

## 11. Filesystem layout (as implemented)

```
topup-hub/
  docs/
    AI_AGENT_ARCHITECTURE.md      (this file)
  packages/
    agent-orchestrator/
      package.json
      tsconfig.json
      README.md
      config/
        approval-policy.json      default gate policy
      prompts/
        orchestrator.md
        planner.md
        designer.md
        developer.md
        qa.md
        security.md
        devops.md
      src/
        types.ts                  Task, TaskState, AgentRole, ProjectState, AuditLogEntry
        stateMachine.ts           transition table + validate()
        stateStore.ts             load/save project-state.json (atomic writes)
        contextBuilder.ts         per-agent minimal context
        orchestrator.ts           nextAction(task) → Directive
        cli.ts                   `task new|next|record|approve|unblock|status|list|cancel`
      state/
        project-state.json        committed — survives restarts
        audit-log.jsonl           committed — full audit trail
```

Nothing outside `docs/` and `packages/agent-orchestrator/` is touched by this system. It does not alter `apps/*` or any product code.

## 12. Git safety

The Developer and DevOps prompt contracts both hard-code the same rules already governing this repo this session: inspect `git status`/branch before acting, never force-push or rewrite history, never work on `main` directly for in-progress features, one logical change per commit with a `type(scope): summary` message, and — critically — never treat "code compiles" as "task done".

## 13. Implementation status

| Phase | Status |
|---|---|
| 1. Repository analysis | **Done** (this document) |
| 2. Architecture design | **Done** (this document) |
| 3. Agent contracts | **Done** — `prompts/*.md`, all 7 roles |
| 4. Task/state model | **Done** — `types.ts`, `stateMachine.ts` |
| 5. Orchestrator | **Done** — `orchestrator.ts`, `cli.ts`, verified with a real end-to-end task run |
| 6–11. Planner/Designer/Developer/QA/Security/DevOps | Contracts written; **Planner verified live** via a real subagent run (see README "Proof of execution"). Designer/Developer/QA/Security/DevOps are wired identically but not yet each individually exercised — same mechanism, not yet demonstrated one-by-one. |
| 12. Integration | Core loop integration done; full 7-stage run on a real feature task is the next concrete milestone, not yet performed |
| 13. End-to-end autonomous test | Not yet run — see README "Next steps" |

This status is kept accurate rather than optimistic: sections 6–13 above are the honest boundary between "built and proven" and "scaffolded, same mechanism, not yet exercised."
