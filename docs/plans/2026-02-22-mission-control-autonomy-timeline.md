# Mission Control Autonomy Timeline — Implementation Plan

## Problem

Autonomous heartbeat work is happening, but visibility is fragmented across chat, memory logs, and repo artifacts.

## Goal

Make heartbeat/autonomous progress visible inside Mission Control with auditability and clear evidence links.

## Phase 1 (immediate)

- Add heartbeat run summaries to a single timeline feed.
- Include: project, action, result, blocker, next step, timestamp.
- Surface in Mission Control as “Autonomy Timeline” panel.

## Phase 2

- Add filters: project, status, urgency, source (heartbeat/manual/subagent).
- Add “last successful heartbeat” status indicator.

## Phase 3

- Add digest generation:
  - Morning plan
  - Midday delta
  - Evening recap
- Add optional Telegram mirror for high-impact events.

## Data Model (proposed)

```ts
{
  id: string,
  timestamp: number,
  source: 'heartbeat'|'manual'|'subagent',
  project: string,
  action: string,
  result: 'success'|'blocked'|'partial'|'failed',
  evidence: Array<{type:'file'|'test'|'log'|'url', value:string}>,
  nextStep?: string,
  urgency: 'low'|'normal'|'high'
}
```

## Acceptance Criteria

- User can open Mission Control and see last 24h autonomous actions without checking chat.
- Each timeline card has at least one evidence link.
- Blocked items are visually distinct and grouped.
- Daily digest can be generated from timeline data.
