# @topup-hub/agent-orchestrator

A real, working orchestration core for a 7-agent (Orchestrator, Planner, Designer, Developer, QA, Security, DevOps) software-engineering pipeline over this repository. Architecture and the environment constraints that shaped it are in [`docs/AI_AGENT_ARCHITECTURE.md`](../../docs/AI_AGENT_ARCHITECTURE.md) — read that first.

In short: this package is the deterministic part (task state machine, quality gates, retry/loop protection, persistence, context building) and never calls an LLM itself. It tells you — precisely — which of the 7 role prompts in `prompts/` to run next and with what context. A live Claude Code session (or a human) is the thing that actually invokes agents and feeds results back in, because that's the only real LLM-execution path available in this sandbox (no callable LLM CLI or API key is present in the environment — see the architecture doc §0 for how that was verified, not assumed).

## Usage

```bash
cd packages/agent-orchestrator

# create a task — this runs Planner immediately (BACKLOG -> PLANNING)
pnpm task new --title "Document uploads" --description "Users can upload, view, and delete documents."

# ask what to do next for a task (prints the Directive + the exact context to hand the agent)
pnpm task next --id <id>

# after actually running the named subagent and getting its structured RESULT block back,
# record it — this validates and applies the state transition
pnpm task record --id <id> --agent planner --result COMPLETED --summary "..."

# see where every task stands
pnpm task list
pnpm task status --id <id>

# human-only actions
pnpm task approve --id <id>          # unblocks a HUMAN_APPROVAL gate (production deploy, by default)
pnpm task unblock --id <id>          # after manually resolving a BLOCKED task (resets that gate's retry count)
pnpm task cancel --id <id> --reason "..."
```

State lives in `state/project-state.json` and `state/audit-log.jsonl`, both committed to git — that's what makes "the process was interrupted, what do I do now" a solved problem: just run `task list` in a fresh session.

## Driving a task to completion (the actual orchestration loop)

This is literally: call `task next`, do what it says, call `task record` with the real result, repeat.

```
loop:
  directive = task next --id <id>
  if directive is INVOKE_AGENT:
    read prompts/<agent>.md
    invoke it as a real subagent with that prompt + the printed context
    result = the subagent's structured RESULT block
    task record --id <id> --agent <agent> --result <result> --summary "..."
  else:
    stop — AWAIT_HUMAN_APPROVAL / BLOCKED / DONE / CANCELLED all require a human next
```

## What's proven vs. scaffolded

See §13 of the architecture doc for the honest breakdown. Short version: the state machine, persistence, retry/loop protection, and CLI are implemented and unit-tested (`src/stateMachine.test.ts`). The Planner role has been run live end-to-end as proof the mechanism is real, not mocked. Designer/Developer/QA/Security/DevOps use the identical mechanism but have not each individually been exercised yet — that's the concrete next step, not a gap in the design.
