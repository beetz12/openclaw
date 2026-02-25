# Mission Control Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add North Star + real-time status, upgraded Kanban controls, second-brain docs, approvals terminal, telemetry, and calendar automation views to Mission Control.

**Architecture:** Extend the existing `apps/vwp-board` Next.js app with modular feature slices (status, board, docs, approvals, telemetry, calendar) backed by existing OpenClaw gateway/VWP APIs and a few targeted new endpoints in `extensions/vwp-dispatch`. Build incrementally with strict TDD and guarded feature flags per module.

**Tech Stack:** Next.js 15 app router, React + TypeScript, existing VWP API client/SSE, Vitest, Playwright, OpenClaw gateway plugins.

---

## Scope Summary (what’s new vs existing)

- Keep existing board/activity foundation.
- Add new top modules:
  1. North Star banner + real-time status panel
  2. Kanban v2 (priority quick add + provenance + stronger lifecycle guardrails)
  3. Second Brain docs viewer/editor + Cmd+K global search
  4. Approvals Terminal + Scratchpad input
  5. Token/Cost telemetry widgets
  6. Calendar overlay (meetings + cron automations)

---

### Task 1: Phase scaffold + feature flags

**Files:**

- Modify: `apps/vwp-board/src/app/layout.tsx`
- Modify: `apps/vwp-board/src/app/page.tsx`
- Create: `apps/vwp-board/src/lib/features.ts`
- Test: `test/vwp-board/api-client.test.ts`

**Step 1: Write failing test for feature flag loader defaults**

- Add test for `features.ts` default values (all new modules off except status/kanban-v2).

**Step 2: Run test to verify it fails**

- Run: `pnpm vitest run test/vwp-board/api-client.test.ts`
- Expected: fail for missing feature helper.

**Step 3: Implement minimal feature-flag module + layout hook-up**

- Add `features.ts` and use it in homepage/layout.

**Step 4: Run tests/build**

- `pnpm --filter vwp-board build`
- Expected: pass.

**Step 5: Commit**

- `git commit -m "feat(vwp-board): scaffold feature flags for mission control modules"`

---

### Task 2: North Star mission banner

**Files:**

- Create: `apps/vwp-board/src/components/dashboard/NorthStarBanner.tsx`
- Modify: `apps/vwp-board/src/app/page.tsx`
- Create: `apps/vwp-board/src/lib/north-star.ts`
- Test: `apps/vwp-board/src/components/dashboard/NorthStarBanner.test.tsx`

**Step 1: Write failing component test**

- Assert mission statement renders and updates from persisted source.

**Step 2: Run failing test**

- `pnpm vitest run apps/vwp-board/src/components/dashboard/NorthStarBanner.test.tsx`

**Step 3: Implement banner + persistence adapter**

- Read from simple JSON doc (workspace-backed), fallback text if missing.

**Step 4: Re-run test + build**

- `pnpm vitest run ...`
- `pnpm --filter vwp-board build`

**Step 5: Commit**

- `git commit -m "feat(vwp-board): add north star mission banner"`

---

### Task 3: Real-time Agent Status panel

**Files:**

- Create: `apps/vwp-board/src/components/dashboard/AgentStatusPanel.tsx`
- Create: `apps/vwp-board/src/hooks/useAgentStatus.ts`
- Modify: `apps/vwp-board/src/lib/api-client.ts`
- Test: `test/vwp-board/api-client.test.ts`

**Step 1: Write failing API/client test**

- Assert status endpoint mapping supports `idle|thinking|working`, active task, subagent count.

**Step 2: Run failing tests**

- `pnpm vitest run test/vwp-board/api-client.test.ts`

**Step 3: Implement client + hook + panel**

- Poll every 10-15s, render state badges + current task.

**Step 4: Verify**

- `pnpm vitest run ...`
- `pnpm --filter vwp-board build`

**Step 5: Commit**

- `git commit -m "feat(vwp-board): add real-time agent status panel"`

---

### Task 4: Kanban v2 quick-add + priority tags

**Files:**

- Modify: `apps/vwp-board/src/components/kanban/KanbanBoard.tsx`
- Modify: `apps/vwp-board/src/lib/api-client.ts`
- Modify: `extensions/vwp-dispatch/routes.ts`
- Test: `extensions/vwp-dispatch/kanban-routes.test.ts`

**Step 1: Write failing test for priority passthrough**

- API accepts and stores `priority` (`low|med|high|urgent`).

**Step 2: Run failing backend test**

- `pnpm vitest run extensions/vwp-dispatch/kanban-routes.test.ts`

**Step 3: Implement minimal backend + UI quick add**

- Add quick input in To Do lane; include priority selector.

**Step 4: Verify tests/build**

- `pnpm vitest run ...`
- `pnpm --filter vwp-board build`

**Step 5: Commit**

- `git commit -m "feat(vwf): add kanban quick-add with priority tags"`

---

### Task 5: Kanban provenance + lifecycle policy enforcement

**Files:**

- Modify: `extensions/vwp-dispatch/kanban-routes.ts`
- Modify: `apps/vwp-board/src/components/kanban/TaskCard.tsx`
- Modify: `apps/vwp-board/src/store/board-store.ts`
- Test: `extensions/vwp-dispatch/kanban-routes.test.ts`

**Step 1: Write failing tests**

- Ensure task metadata includes provenance (`user_requested|heartbeat_proactive`) and lifecycle guardrails.

**Step 2: Run tests (fail expected)**

**Step 3: Implement policy**

- Restrict invalid jumps by default; allow explicit override for admins.

**Step 4: Verify + build**

**Step 5: Commit**

- `git commit -m "feat(vwf): add task provenance and lifecycle policy guards"`

---

### Task 6: Second Brain doc index + markdown viewer

**Files:**

- Create: `apps/vwp-board/src/app/docs/page.tsx`
- Create: `apps/vwp-board/src/components/docs/DocViewer.tsx`
- Create: `apps/vwp-board/src/lib/docs-api.ts`
- Test: `apps/vwp-board/src/components/docs/DocViewer.test.tsx`

**Step 1: Write failing viewer test**

- Markdown render with headings/list/code support.

**Step 2: Run failing test**

**Step 3: Implement list + viewer**

- Read from workspace docs/memory directories.

**Step 4: Verify**

- tests + build.

**Step 5: Commit**

- `git commit -m "feat(vwp-board): add second-brain document viewer"`

---

### Task 7: In-line popup editor + save-back

**Files:**

- Create: `apps/vwp-board/src/components/docs/DocEditorModal.tsx`
- Modify: `apps/vwp-board/src/lib/docs-api.ts`
- Modify: `extensions/vwp-dispatch/routes.ts` (or dedicated plugin route)
- Test: `extensions/vwp-dispatch/routes.test.ts`

**Step 1: Write failing save endpoint test**

- Save markdown updates to allowed workspace doc paths.

**Step 2: Run failing test**

**Step 3: Implement minimal editor flow**

- Open modal → edit → save → optimistic refresh.

**Step 4: Verify**

- tests + build.

**Step 5: Commit**

- `git commit -m "feat(vwp-board): add inline markdown edit/save workflow"`

---

### Task 8: Cmd+K global search

**Files:**

- Create: `apps/vwp-board/src/components/search/CommandPalette.tsx`
- Create: `apps/vwp-board/src/hooks/useGlobalSearch.ts`
- Modify: `apps/vwp-board/src/app/layout.tsx`
- Test: `apps/vwp-board/src/components/search/CommandPalette.test.tsx`

**Step 1: Write failing tests for keyboard open/filter/select**
**Step 2: Run tests**
**Step 3: Implement command palette + search provider**
**Step 4: Verify**
**Step 5: Commit**

- `git commit -m "feat(vwp-board): add global command palette search"`

---

### Task 9: Approvals Terminal

**Files:**

- Create: `apps/vwp-board/src/app/approvals/page.tsx`
- Modify: `apps/vwp-board/src/lib/api-client.ts`
- Modify: `extensions/vwp-dispatch/routes.ts`
- Test: `extensions/vwp-dispatch/routes.test.ts`

**Step 1: Write failing tests for queue + approve/reject actions**
**Step 2: Run tests**
**Step 3: Implement approvals terminal UI + API mapping**
**Step 4: Verify**
**Step 5: Commit**

- `git commit -m "feat(vwp-board): add approvals terminal module"`

---

### Task 10: Scratchpad input + action routing

**Files:**

- Create: `apps/vwp-board/src/components/dashboard/ScratchpadBox.tsx`
- Modify: `extensions/vwp-dispatch/routes.ts`
- Modify: `apps/vwp-board/src/lib/api-client.ts`
- Test: `extensions/vwp-dispatch/routes.test.ts`

**Step 1: Write failing tests for scratchpad submit categories**
**Step 2: Run tests**
**Step 3: Implement quick-capture route + UI**
**Step 4: Verify**
**Step 5: Commit**

- `git commit -m "feat(vwp-board): add scratchpad capture and routing"`

---

### Task 11: Token & cost dashboard widget

**Files:**

- Create: `apps/vwp-board/src/components/telemetry/CostUsageWidget.tsx`
- Modify: `apps/vwp-board/src/lib/api-client.ts`
- Modify: `apps/vwp-board/src/app/page.tsx`
- Test: `test/vwp-board/api-client.test.ts`

**Step 1: Write failing client test for cost payload mapping**
**Step 2: Run tests**
**Step 3: Implement widget**
**Step 4: Verify**
**Step 5: Commit**

- `git commit -m "feat(vwp-board): add token and cost monitor widget"`

---

### Task 12: Calendar hybrid (events + cron)

**Files:**

- Create: `apps/vwp-board/src/app/calendar/page.tsx`
- Create: `apps/vwp-board/src/components/calendar/AutomationCalendar.tsx`
- Modify: `apps/vwp-board/src/lib/api-client.ts`
- Test: `apps/vwp-board/src/components/calendar/AutomationCalendar.test.tsx`

**Step 1: Write failing test for merged timeline rendering**
**Step 2: Run test**
**Step 3: Implement calendar merge UI**
**Step 4: Verify build/test**
**Step 5: Commit**

- `git commit -m "feat(vwp-board): add automated calendar with cron overlays"`

---

### Task 13: End-to-end sanity + rollout docs

**Files:**

- Create: `apps/vwp-board/e2e/mission-control-smoke.spec.ts`
- Create: `docs/plans/2026-02-23-mission-control-rollout-checklist.md`
- Modify: `docs/vwp-assignment-endpoints.md` (cross-links)

**Step 1: Write failing e2e smoke**

- open dashboard, verify status panel, board quick-add, approvals page, docs page loads.

**Step 2: Run to fail**

**Step 3: Implement minimal fixes for pass**

**Step 4: Run e2e and build**

- `pnpm --filter vwp-board build`
- `npx playwright test apps/vwp-board/e2e/mission-control-smoke.spec.ts --workers=1`

**Step 5: Commit**

- `git commit -m "test(vwp-board): add mission control smoke + rollout checklist"`

---

## Delivery Order Recommendation

1. Tasks 1–5 (status + kanban v2)
2. Tasks 6–8 (second brain)
3. Tasks 9–10 (approvals + scratchpad)
4. Tasks 11–12 (telemetry + calendar)
5. Task 13 (e2e + rollout)

## Risk Notes

- Avoid large API contract breaks; add additive fields first.
- Keep per-module feature flags until each module is validated.
- Preserve existing VWF behavior while layering new dashboard modules.

## Definition of Done (overall)

- North Star + Agent Status visible and live.
- Kanban supports quick add + priority + reliable lifecycle transitions.
- Docs module supports read + inline edit + save.
- Approvals terminal blocks outbound until explicit action.
- Scratchpad captures notes to actionable routing.
- Token/cost + calendar overlays available on dashboard.
- Mission control e2e smoke passes.
