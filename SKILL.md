# SKILL.md — Ralph Loop

## What This Is

A **Ralph Loop** is a tiny background supervisor that keeps some target number of agents/jobs alive.

Default shape:
- one tiny JS file
- one single log file
- one loop (`while true` + sleep)
- check active workers
- kill stale workers
- spawn missing workers
- append one log line

That’s it.

## When to Use This Skill

Use this when you need:
- a simple watchdog loop
- "keep 2 or 3 agents running"
- background worker orchestration
- log-tail-based status instead of chat spam

## Rules

1. **KISS + YAGNI hard**
   - no extra JSON state unless explicitly requested
   - no dashboard
   - no event bus
   - no queue unless truly needed

2. **One log file only**
   - one line per tick
   - one line per worker completion snippet
   - status = tail the log file

3. **Use a real process by default**
   - prefer a tiny JS supervisor over prompt-based cron orchestration

4. **Active is not the same as healthy**
   - a worker that runs forever and finishes nothing is not healthy capacity
   - always define a stale timeout

5. **Verify with trivial workers first**
   - poem / tiny summary / tiny chain
   - prove spawn works, completion works, logging works

## Good Pattern

- one JS loop process
- dedicated supervisor session key
- dedicated worker label prefix
- append-only log file
- tail log for status

## Bad Pattern

- cron job whose LLM run is itself the orchestrator
- waiting for workers inside the control loop
- counting stuck workers as healthy
- adding architecture "for later"

## Model / Agent Routing

### Default split

- **Research / first pass / cheap gathering**
  - prefer `model: gemini-flash`

- **Second pass / formatting / final wording**
  - prefer `agentId: codex-reasoning`
  - prefer `model: codex`

### Tiny-job rule

For trivial summarizing or formatting work, start with the smaller/cheaper worker first.

### Common chain pattern

1. researcher worker gathers or drafts quickly
2. writer worker rewrites into final form
3. supervisor logs both outcomes

Example:
- Worker A: `gemini-flash` → 2 short fact/image lines
- Worker B: `codex` on `codex-reasoning` → final short poem or summary

## Spawn Examples

### Fast researcher
```json
{
  "runtime": "subagent",
  "agentId": "main",
  "model": "gemini-flash",
  "thinking": "low",
  "mode": "run"
}
```

### Second-pass writer / formatter
```json
{
  "runtime": "subagent",
  "agentId": "codex-reasoning",
  "model": "codex",
  "thinking": "low",
  "mode": "run"
}
```

## Ralph Loop Checklist

Each tick should do only this:
1. list workers
2. identify stale workers
3. kill stale workers
4. count healthy workers
5. spawn missing workers up to target
6. append one log line
7. sleep

## Log Format

Example:

```text
2026-03-08T10:11:13.896Z tick pid=1234 target=2 healthy=0 staleKilled=0 spawned=2 labels=ralph-worker-a1b2c3,ralph-worker-d4e5f6
2026-03-08T10:16:41.000Z result runId=... label=ralph-worker-d4e5f6 status=done snippet=Short final answer here...
2026-03-08T10:17:01.000Z error sessions_spawn failed: Tool not available
```

## Verification Flow

Before claiming a Ralph Loop works:
1. start the supervisor process
2. confirm the process is alive
3. confirm a tick is written to the log
4. run a trivial spawned worker
5. confirm completion appears in the log
6. only then switch to real workers

## Status Reporting

When asked "is it working?", answer with facts only:
- is the supervisor process alive?
- what is the latest log line?
- how many healthy workers are active?
- what was the last successful completion?
- any current blocker?

No guessing.
