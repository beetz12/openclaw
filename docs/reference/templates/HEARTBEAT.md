---
title: "HEARTBEAT.md Template"
summary: "Workspace template for HEARTBEAT.md"
read_when:
  - Bootstrapping a workspace manually
---

# HEARTBEAT.md

Use this file to define what your agent should do on each heartbeat.

## Minimal Rules

1. Take at least one concrete action per heartbeat.
2. Prefer approved **To Do** tasks before speculative work.
3. Log what changed + evidence + next step.

## Kanban Policy

- **Backlog:** agent-generated ideas awaiting human approval.
- **To Do:** approved tasks.
- **In Progress:** active execution.
- **Review:** implemented, awaiting validation.
- **Done:** validated/approved.

## Day vs Night Policy (recommended)

- **Day:** prioritize delivery and approved high-impact tasks.
- **Night:** avoid new high-risk direction changes; focus on safe work (tests/docs/CI/cleanup) unless pre-approved.

## Backlog Pressure Rule (recommended)

If Backlog > 20:

- pause adding new backlog items,
- dedupe/merge existing items,
- continue approved To Do execution,
- queue a concise summary for morning review.

## Priority Signaling Format

Use chat instructions like:

- `DAY PRIORITY: ...`
- `NIGHT PRIORITY: ...`
- `ALWAYS ALLOWED: ...`
- `REQUIRES APPROVAL: ...`

## Notification Routing (optional)

If you want per-heartbeat notifications, define destination/channel here explicitly.
