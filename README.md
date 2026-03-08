# OpenClaw Ralph Loop

Tiny background supervisor pattern for OpenClaw.

This is intentionally **not** a built-in product feature. It is a simple pattern you can adapt:
- one tiny JS file
- one log file
- keep N workers alive
- kill stale workers
- log completions

## Files

- `ralph-loop.js` — the tiny supervisor
- `SKILL.md` — reusable instructions / playbook
- `.env.example` — environment-based config template

## Why

Prompt-driven cron orchestration is often overkill for tight worker loops.
A small deterministic process is usually cleaner.

## Requirements

- Node 18+
- OpenClaw Gateway reachable on loopback or your configured URL
- Gateway token available in `.env`
- Gateway policy must allow the tools you use (`subagents`, `sessions_spawn`, `sessions_history`)

## Setup

Copy `.env.example` to `.env` and edit the values.

Example:

```bash
cp .env.example .env
node ralph-loop.js
```

## Status

Tail the log:

```bash
tail -f ralph-loop.log
```

## Notes

- keep it simple
- active != healthy
- verify with trivial workers before real jobs
- log short result snippets only
