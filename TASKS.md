# Land Diverged Local History Into `origin/main` — Implementation Plan

**Goal:** Safely land the desired local NexClaw/OpenClaw changes into `origin/main` on the fork without force-pushing or replaying 4,600+ historical commits through a brittle rebase.
**Architecture:** Build a clean integration lane from the current remote baseline (`origin/main`), then replay only the desired local changes in bounded batches using cherry-picks and targeted conflict resolution. Treat the existing local `main` as a source branch only, not as the branch to rebase directly.
**Files affected:** 10+ files during execution, plus new integration artifacts (`TASKS.md`, `.beads/`, optional merge logs)
**Key decisions:** Do not continue rebasing local `main`; the attempted `git pull --rebase origin main` replayed 4,634 commits and failed on an unrelated historical `pnpm-lock.yaml` conflict. Use a fresh integration branch off `origin/main` instead. Keep Beads setup changes as part of the landing scope because they are now required project workflow.

---

## Context Recovery

> Read this section first if resuming from a compacted or new session.
> It contains the breadcrumbs needed to understand the full task without re-exploring.

- **Branch state:** local `main` is `ahead 4695, behind 72` relative to `origin/main`.
- **Failed strategy:** `git pull --rebase origin main` attempted to replay ~4,634 commits and stopped on `pnpm-lock.yaml` at historical commit `942ed8927` (`deps: update overrides for minimatch and fast-xml-parser (#20832)`).
- **Remote model:** `origin` is the fork (`git@github.com:beetz12/openclaw.git`), `upstream` is the canonical upstream repo (`git@github.com:openclaw/openclaw.git`).
- **Desired recent work:** recent fork-only commits include `cfb042352`, `dfa675d9c`, `454f8936d`, `6ea921723`, `e12cf3bab`; much older local-only history also exists and must be triaged instead of assumed.
- **Submodule decision:** `knowledge-work-plugins` is now configured as a git submodule in `.gitmodules`; execution must preserve that instead of re-adding it as an embedded repo.
- **Beads setup:** `.beads/config.yaml` now exists; `bd doctor` passes with warnings only. `AGENTS.md` and `README.md` have uncommitted Beads integration changes that should be landed deliberately.
- **Commit workflow:** use `scripts/committer "<msg>" <file...>` for scoped commits. Do not use manual `git add` / `git commit`.
- **Merge utility references:** `scripts/rebase-upstream.sh` documents the conflict-prone files when rebasing against upstream. `scripts/pr` rebases PR prep branches on `origin/main`, which is the safe baseline pattern to follow.
- **No existing Beads issues:** `bd search "origin main rebase merge fork push upstream sync" --json` returned `[]` at planning time.

---

## Phase 0: Infrastructure & Configuration

### [ ] Task 0.1: Commit Beads project bootstrap changes
**Files:** `AGENTS.md`, `README.md`, `.beads/config.yaml`, `.beads/hooks/`
**What:** Review and commit the Beads initialization artifacts added by `bd init`, including the injected tracking guidance in `AGENTS.md` and the Beads workflow section in `README.md`.
**Why:** Execution should happen from a clean working tree with the project’s issue-tracking system already committed and available on `origin/main`.
**Verify:** `git status --short` is clean after the scoped Beads setup commit.

> **Notes:** `bd init` already ran and modified `AGENTS.md`; this is real project state, not scratch output. Do not discard it accidentally while preparing the integration branch.

### [ ] Task 0.2: Capture merge tooling metadata and execution logs
**Files:** `TASKS.md`, `.beads/`, `docs/` or `.local/merge-origin-main/` (choose one tracked location for logs), `scripts/rebase-upstream.sh`, `scripts/committer`
**What:** Create a tracked place for merge notes, conflict logs, and commit-batch decisions so the integration work can survive interruptions and agent handoffs.
**Why:** This landing effort is too large to keep only in session context.
**Verify:** A merge log location exists and contains an initial inventory note describing the branch divergence and chosen strategy.

> **Notes:** If a local-only log location is used, mirror the critical summary back into Beads issue comments so the plan is still recoverable.

### [ ] Task 0.3: Define the “desired landing set” before touching history
**Files:** `TASKS.md`, `AGENTS.md`, `README.md`, `.gitmodules`, `package.json`, `pnpm-lock.yaml`, `src/agents/cli-runner.ts`, `src/gateway/server/ws-connection/message-handler.ts`, `src/plugins/loader.ts`, `src/plugins/registry.ts`, `apps/vwp-board/`
**What:** Enumerate which local-only commits and working-tree changes must land on `origin/main` first, and which older local-only commits can wait for a later wave.
**Why:** “All current code” is too broad unless reduced to an explicit landing inventory.
**Verify:** The merge log contains a table of commit SHAs or feature groups labeled `land now`, `defer`, or `drop`.

> **Notes:** Recent commit SHAs already identified from `git log --left-right --cherry-pick origin/main...HEAD`: `e12cf3bab`, `6ea921723`, `454f8936d`, `dfa675d9c`, `cfb042352`, plus older VWP and fork infrastructure commits.

### [ ] Task 0.4: Dependency and build verification for the current source branch
**Files:** `package.json`, `pnpm-lock.yaml`, `apps/vwp-board/`, `src/`
**What:** Run baseline verification on the source branch so integration work starts from a known-good state and not from a broken local baseline.
**Why:** Cherry-picking from an unverified source wastes time and obscures integration regressions.
**Verify:** At minimum, `pnpm build` passes; record any remaining known failures or intentionally deferred checks in the merge log.

> **Notes:** `pnpm build` already passed during cleanup after the `fix(core): align plugin and gateway integrations after sync` batch.

---

## Phase 1: Integration Lane Setup

### [ ] Task 1.1: Create a clean integration branch from `origin/main`
**Files:** `.git/refs/heads/merge/origin-main-integration` or equivalent branch ref, optional isolated worktree path
**What:** Create a fresh branch rooted at `origin/main` specifically for integration work.
**Why:** This avoids replaying the entire divergent local `main` history.
**Verify:** `git rev-parse --abbrev-ref HEAD` shows the new integration branch, and `git merge-base --is-ancestor origin/main HEAD` succeeds.

> **Notes:** If using a separate worktree for safety, make that an explicit execution choice in the merge log. The current plan only requires a clean branch rooted at `origin/main`.

### [ ] Task 1.2: Snapshot the local source branch and preserve rollback points
**Files:** branch refs for `main`, integration branch refs, merge log
**What:** Record the current source branch tip SHA and create a backup branch/tag for the integration start point before any replay begins.
**Why:** Recovery must be cheap if a cherry-pick wave goes wrong.
**Verify:** The merge log records the source SHA and backup ref, and `git show <backup-ref> --stat` resolves correctly.

> **Notes:** The current `main` tip at planning time includes `e12cf3bab` on top of the cleanup commits.

### [ ] Task 1.3: Verify submodule and remotes on the integration branch
**Files:** `.gitmodules`, `knowledge-work-plugins`, `.git/config`
**What:** Confirm the integration branch sees the `knowledge-work-plugins` submodule correctly and that `origin`/`upstream` remotes are untouched.
**Why:** The earlier embedded-repo warning must not reappear during replay.
**Verify:** `git submodule status` shows `knowledge-work-plugins`, and `git remote -v` still lists the fork as `origin` and upstream as `upstream`.

> **Notes:** `knowledge-work-plugins` already points at `git@github.com:anthropics/knowledge-work-plugins.git`.

---

## Phase 2: Commit Inventory and Replay Waves

### [ ] Task 2.1: Group local-only commits into replay waves
**Files:** merge log, `TASKS.md`
**Depends on:** Task 0.3
**What:** Create bounded replay waves such as `beads/setup`, `fork infrastructure`, `plugin/gateway fixes`, `VWP board/nav fixes`, `VWP product features`, and `docs`.
**Verify:** Each wave has an ordered list of SHAs with a clear rationale and estimated verification scope.

> **Notes:** Do not cherry-pick 100+ commits in one batch. Favor waves that can be verified with one build/test pass.

### [ ] Task 2.2: Replay the Beads/bootstrap wave first
**Files:** `AGENTS.md`, `README.md`, `.beads/config.yaml`, `.beads/hooks/`
**Depends on:** Task 1.1
**What:** Cherry-pick or reproduce the Beads setup commit(s) onto the integration branch.
**Why:** Planning and execution both rely on Beads being available on the branch that will become `origin/main`.
**Verify:** `bd doctor` passes on the integration branch with no errors.

> **Notes:** This wave is intentionally separate from functional product code so the branch’s project-management foundation lands first.

### [ ] Task 2.3: Replay the fork infrastructure wave
**Files:** `.gitmodules`, `package.json`, `pnpm-lock.yaml`, `src/agents/cli-runner.ts`, `src/gateway/server/ws-connection/message-handler.ts`, `src/plugins/loader.ts`, `src/plugins/registry.ts`, `scripts/rebase-upstream.sh`
**Depends on:** Task 2.2
**What:** Land the commits that stabilize plugin loading, gateway auth/device signature handling, submodule setup, and merge tooling.
**Verify:** `pnpm build` passes on the integration branch after this wave.

> **Notes:** `scripts/rebase-upstream.sh` already names conflict-prone files for upstream rebases; use that as a checklist when replaying overlapping fork infrastructure work.

### [ ] Task 2.4: Replay the VWP board/dashboard fixes wave
**Files:** `apps/vwp-board/src/app/layout.tsx`, `apps/vwp-board/src/components/layout/MobileAgentTab.tsx`, `apps/vwp-board/src/components/agents/AgentCard.tsx`, `apps/vwp-board/src/store/board-store.ts`
**Depends on:** Task 2.3
**What:** Land the mobile nav overflow fix and the related board type/build fixes that were already verified locally.
**Verify:** `pnpm build` passes and the VWP board dev server routes render without the previous blank-page failures.

> **Notes:** These changes were previously committed as `dfa675d9c` plus supporting board type fixes folded into `6ea921723`.

### [ ] Task 2.5: Replay older VWP feature waves only after baseline stabilization
**Files:** `extensions/vwp-dispatch/`, `apps/vwp-board/`, `apps/vwp-desktop/`, relevant docs and tests
**Depends on:** Task 2.4
**What:** Cherry-pick larger feature sets such as Mission Control, CoWork, desktop wrapper, onboarding, and dispatch features in one bounded vertical slice at a time.
**Verify:** Each slice has targeted verification recorded before the next slice starts.

> **Notes:** Do not assume every one of the 4,695 ahead commits should land in the first branch. This is where “land now” vs “defer” decisions matter most.

---

## Phase 3: Conflict Resolution and Verification

### [ ] Task 3.1: Resolve cherry-pick conflicts with a standing file-by-file policy
**Files:** whichever files conflict during replay, merge log
**Depends on:** Task 2.2
**What:** For every conflict, record whether the winning side should be `origin/main`, the local source, or a manual merge.
**Verify:** No cherry-pick is continued without a one-line recorded resolution note.

> **Notes:** The prior failed rebase showed `pnpm-lock.yaml` can conflict for reasons unrelated to current work. Lockfile conflicts should be resolved from the actual resulting dependency graph, then verified with install/build.

### [ ] Task 3.2: Run baseline verification after every replay wave
**Files:** `package.json`, `pnpm-lock.yaml`, `apps/vwp-board/`, `src/`, relevant tests
**Depends on:** Task 2.2
**What:** After each wave, run the minimum necessary verification and stop if the branch is broken.
**Verify:** Verification commands and outcomes are logged for each wave.

> **Notes:** Baseline is `pnpm build`; add targeted app/test commands when replaying VWP features.

### [ ] Task 3.3: Normalize the integration branch into reviewable commits
**Files:** branch history only, merge log
**Depends on:** Task 3.2
**What:** If replay produced noisy or fixup commits, consolidate them into logical batches before landing into `origin/main`.
**Verify:** `git log --oneline origin/main..HEAD` is understandable and grouped by real concern, not conflict noise.

> **Notes:** Use `scripts/committer` for any new manual resolution commits. Avoid amending older source-branch history.

---

## Phase 4: Landing and Adoption

### [ ] Task 4.1: Fast-forward or merge the validated integration branch into `origin/main`
**Files:** `origin/main` branch ref, integration branch ref
**Depends on:** Task 3.3
**What:** Once the integration branch is validated, update `origin/main` from that branch without rewriting the old divergent local `main`.
**Verify:** `git push origin <integration-branch>:main` succeeds.

> **Notes:** This is the moment the fork’s `origin/main` becomes clean and current. It should happen from the integration branch, not from the old divergent `main`.

### [ ] Task 4.2: Rebase or reset local `main` onto the new remote baseline
**Files:** local `main` branch ref
**Depends on:** Task 4.1
**What:** After `origin/main` is updated, realign local `main` to the new remote baseline and preserve the old divergent history under a backup branch if needed.
**Verify:** `git status --short --branch` on local `main` shows it is up to date with `origin/main`.

> **Notes:** This is the first safe time to clean up the historical divergence. Do not do it earlier.

### [ ] Task 4.3: Close the Beads epic with final adoption notes
**Files:** `.beads/`, merge log
**Depends on:** Task 4.2
**What:** Record what landed, what was deferred, and how the new clean baseline should be used going forward.
**Verify:** The epic is closed and any deferred waves are captured as follow-up Beads tasks.

> **Notes:** If some older local-only feature waves were intentionally excluded from the first landing branch, they must become their own explicit follow-up issues instead of hidden branch drift.
