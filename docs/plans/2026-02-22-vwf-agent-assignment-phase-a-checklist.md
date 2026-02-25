# VWF Agent Assignment — Phase A Execution Checklist

## Objective

Implement backend foundation for workforce-owned task assignment before UI rollout.

## Phase A Tasks (Backend + Tests)

1. **Schema extension (task + agent assignment fields)**
   - Add `assignedAgentId`, `assignmentMode`, `requiredSkills`, `assignmentReason`, `executorAgentId`, `executionProfile`.
   - Ensure backward compatibility for existing task payloads.

2. **Assignment engine (deterministic scorer)**
   - Role/skill/load-based scoring.
   - Deterministic tie-breaks.
   - Explainability payload (`reason`, `scoreBreakdown`).

3. **Assignment APIs**
   - `POST /tasks/:id/assign`
   - `POST /tasks/:id/auto-assign`
   - `POST /tasks/:id/unlock-assignment`
   - `GET /tasks/:id/assignment-explain`

4. **Execution router integration**
   - Respect `manual-lock` assignment.
   - Auto-assign only when assignment missing/unlocked.
   - Persist `executorAgentId` + execution profile snapshot.

5. **Unit + integration tests**
   - Scoring correctness + deterministic behavior.
   - Manual lock behavior.
   - API contract tests + error paths.
   - Execution routing tests with fallback behavior.

## Acceptance Criteria

- New tasks can be assigned and locked/unlocked via API.
- Execution path uses assigned agent profile reliably.
- Assignment decisions produce explainable reasons.
- Tests pass for assignment and routing core logic.

## Notes

- UI changes (`/workforce` + task panel controls) begin in Phase B after Phase A validation.
