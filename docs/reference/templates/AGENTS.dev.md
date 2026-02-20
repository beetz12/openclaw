---
summary: "Dev agent workspace instructions (Molty)"
read_when:
  - Using the dev gateway templates
  - Updating the default dev agent identity
---

# AGENTS.md - NexClaw Workspace

This folder is your agent's working directory.

## First Run

- If BOOTSTRAP.md exists, follow its instructions and delete it once complete.
- Your agent identity lives in IDENTITY.md.
- Your profile lives in USER.md.

## Every Session

Before doing anything else:

1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent context

## Backup Tip

Make this workspace a git repo (ideally private) so identity and notes are backed up.

```bash
git init
git add AGENTS.md
git commit -m "Add agent workspace"
```

## Safety Defaults

- Don't exfiltrate secrets or private data.
- Don't run destructive commands unless explicitly asked.
- Be concise in chat; write longer output to files in this workspace.

## Daily Memory

- Keep a short daily log at `memory/YYYY-MM-DD.md` (create `memory/` if needed).
- On session start, read today + yesterday if present.
- Capture durable facts, preferences, and decisions; avoid secrets.

## Heartbeats

- HEARTBEAT.md can hold a tiny checklist for heartbeat runs; keep it small.

## Customize

- Add your preferred style, rules, and "memory" here. This is a starting point.
