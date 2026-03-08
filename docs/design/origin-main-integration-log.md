# Origin Main Integration Log

## Objective

Land the desired local NexClaw/OpenClaw changes onto `origin/main` without rebasing the entire divergent local `main` history.

## Current Baseline

- Date: 2026-03-08
- Source branch: `main`
- Remote baseline: `origin/main`
- Divergence at capture time: local `main` was `ahead 4695, behind 72`
- Source-of-truth execution plan: `TASKS.md`

## Chosen Strategy

1. Treat the current local `main` as a source branch only.
2. Create a clean integration branch from `origin/main`.
3. Replay the selected local work in bounded waves.
4. Verify after each wave.
5. Update `origin/main` from the validated integration branch.

## Known Context

- A direct `git pull --rebase origin main` previously attempted to replay thousands of commits and failed on a historical `pnpm-lock.yaml` conflict.
- The Beads workflow bootstrap was committed first as `46bca5a71` so the integration work is tracked from the start.
- `knowledge-work-plugins` must remain a submodule-backed setup rather than being reintroduced as an embedded repo.

## Wave Log

### Wave 0: Tracking Bootstrap

- Status: completed
- Purpose: commit Beads workflow bootstrap and create tracked integration artifacts
- Commits:
  - `46bca5a71` `docs: add Beads workflow bootstrap`

### Wave A: Bootstrap Replay

- Status: completed
- Purpose: replay Beads bootstrap and planning artifacts onto `origin/main`
- Integration commits:
  - `4361ef703` `docs: add Beads workflow bootstrap`
  - `f9eb7a327` `docs: add origin main integration log`
  - `4bb0409c1` `docs(repo): add recovery and planning notes`

### Wave B: Fork Infrastructure Replay

- Status: completed
- Purpose: replay fork infrastructure commits while preserving the `origin/main` plugin and gateway API surface
- Integration commits:
  - `e63b44382` `chore(repo): track knowledge-work plugins and ignore local artifacts`
  - `9f4ad1dca` `fix(core): align plugin and gateway integrations after sync`

### Next Planned Waves

1. Define landing inventory
2. Verify source branch baseline
3. Create integration branch from `origin/main`
4. Replay bounded waves with verification after each batch

## Conflict Log

Record every manual conflict decision here before continuing a replay:

| Date       | Wave   | File                                                  | Resolution                                      | Notes                                                                                                                                                         |
| ---------- | ------ | ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-08 | Wave B | `pnpm-lock.yaml`                                      | keep `origin/main`                              | The integration branch already had the needed dependency graph; replayed lockfile content was older and would have reintroduced churn.                        |
| 2026-03-08 | Wave B | `src/plugins/registry.ts`                             | manual merge favoring `origin/main` API         | Rejected replayed context-engine and route-auth extensions because `src/plugins/types.ts` on the integration base does not define that newer API surface yet. |
| 2026-03-08 | Wave B | `src/gateway/server/ws-connection/message-handler.ts` | manual merge favoring exported baseline helpers | Replaced replay-only imports with the branch exports: `buildDeviceAuthPayload` and `resolveGatewayClientIp`.                                                  |

## Verification Log

Record every verification step here:

| Date       | Scope           | Command            | Result | Notes                                                                         |
| ---------- | --------------- | ------------------ | ------ | ----------------------------------------------------------------------------- |
| 2026-03-08 | Source baseline | `pnpm build`       | pass   | Verified local `main` before starting the integration branch.                 |
| 2026-03-08 | Wave A          | `bd doctor --json` | pass   | Confirmed the Beads state after bootstrap replay.                             |
| 2026-03-08 | Wave B          | `pnpm install`     | pass   | Installed missing integration-branch dependencies before replay verification. |
| 2026-03-08 | Wave B          | `pnpm build`       | pass   | Build is clean after restoring branch-compatible plugin and gateway code.     |
