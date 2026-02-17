# VWP Production Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the VWP (Virtual Workforce Platform) dispatch system for production use — addressing safety, reliability, observability, UX, and scaling gaps.

**Architecture:** The VWP is an OpenClaw plugin system with three extensions: `vwp-dispatch` (task analysis + team execution via Claude CLI), `vwp-approval` (SSE-based approval queue), and `vwp-dashboard` (Lit web components UI). All state is file-based under `~/.openclaw/vwp/`. Changes are non-breaking incremental hardening of existing code.

**Tech Stack:** TypeScript, Node.js, Lit web components, Vitest, Claude CLI subprocess spawning, NotebookLM MCP for long-term memory.

---

## Phase 1: Safety (Prevent Data Loss & Runaway Costs)

### Task 1: Atomic File Writes Utility

**Files:**

- Create: `extensions/vwp-dispatch/atomic-write.ts`
- Create: `extensions/vwp-dispatch/atomic-write.test.ts`

**Context:** All VWP state (queue, board, checkpoints) uses bare `writeFile()` which can corrupt on crash. We need a write-to-temp-then-rename utility.

**Step 1: Write the failing test**

```typescript
// atomic-write.test.ts
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { atomicWriteFile } from "./atomic-write.js";

describe("atomicWriteFile", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes file atomically via temp + rename", async () => {
    dir = await mkdtemp(join(tmpdir(), "atomic-write-"));
    const target = join(dir, "test.json");
    await atomicWriteFile(target, '{"ok":true}');
    const content = await readFile(target, "utf-8");
    expect(content).toBe('{"ok":true}');
  });

  it("creates parent directories if they do not exist", async () => {
    dir = await mkdtemp(join(tmpdir(), "atomic-write-"));
    const target = join(dir, "nested", "deep", "test.json");
    await atomicWriteFile(target, "hello");
    const content = await readFile(target, "utf-8");
    expect(content).toBe("hello");
  });

  it("overwrites existing file atomically", async () => {
    dir = await mkdtemp(join(tmpdir(), "atomic-write-"));
    const target = join(dir, "test.json");
    await atomicWriteFile(target, "first");
    await atomicWriteFile(target, "second");
    const content = await readFile(target, "utf-8");
    expect(content).toBe("second");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run extensions/vwp-dispatch/atomic-write.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// atomic-write.ts
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Write a file atomically — writes to a temp file in the same directory,
 * then renames. This prevents corruption if the process crashes mid-write.
 */
export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpName = join(dir, `.tmp-${randomBytes(6).toString("hex")}`);
  await writeFile(tmpName, data, "utf-8");
  await rename(tmpName, filePath);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run extensions/vwp-dispatch/atomic-write.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add extensions/vwp-dispatch/atomic-write.ts extensions/vwp-dispatch/atomic-write.test.ts
git commit -m "feat(vwp): add atomic file write utility for crash-safe persistence"
```

---

### Task 2: Wire Atomic Writes into Checkpoint, Board State, and Queue

**Files:**

- Modify: `extensions/vwp-dispatch/checkpoint.ts` (lines 33, 39, 49, 55, 135, 171, 220 — all `writeFile` calls)
- Modify: `extensions/vwp-dispatch/board-state.ts` (line 41 — `writeFile` call)
- Modify: `extensions/vwp-dispatch/task-queue.ts` (line 106 — `writeFile` call)
- Modify: `extensions/vwp-dispatch/memory/memory-sync.ts` (line 32 — `writeFile` call)

**Step 1: Replace all bare `writeFile` calls with `atomicWriteFile`**

In each file:

1. Add import: `import { atomicWriteFile } from "./atomic-write.js";`
2. Replace every `writeFile(path, JSON.stringify(...))` with `atomicWriteFile(path, JSON.stringify(...))`
3. Remove the `mkdir({ recursive: true })` calls that precede atomic writes (atomicWriteFile handles this)

For `memory-sync.ts`, the import path is `"../atomic-write.js"`.

**Step 2: Run existing tests to verify nothing breaks**

Run: `pnpm vitest run extensions/vwp-dispatch/`
Expected: All existing tests PASS

**Step 3: Commit**

```bash
git add extensions/vwp-dispatch/checkpoint.ts extensions/vwp-dispatch/board-state.ts extensions/vwp-dispatch/task-queue.ts extensions/vwp-dispatch/memory/memory-sync.ts
git commit -m "refactor(vwp): use atomic writes for all file persistence"
```

---

### Task 3: Budget Caps — Config and Enforcement

**Files:**

- Modify: `extensions/vwp-dispatch/types.ts` — add budget types
- Create: `extensions/vwp-dispatch/budget.ts` — budget enforcement logic
- Create: `extensions/vwp-dispatch/budget.test.ts`
- Modify: `extensions/vwp-dispatch/index.ts` (lines 29-40 — plugin config type, line 143 — before `executeTeam`)

**Context:** Currently `cost-estimator.ts` estimates cost but nothing enforces a limit. Add per-task and per-month budget caps.

**Step 1: Write the failing test**

```typescript
// budget.test.ts
import { describe, expect, it } from "vitest";
import { checkBudget, type BudgetConfig } from "./budget.js";

describe("checkBudget", () => {
  it("allows task under per-task limit", () => {
    const config: BudgetConfig = { perTaskMaxUsd: 5.0, monthlyMaxUsd: 100 };
    const result = checkBudget(2.5, 10.0, config);
    expect(result.allowed).toBe(true);
  });

  it("rejects task over per-task limit", () => {
    const config: BudgetConfig = { perTaskMaxUsd: 1.0, monthlyMaxUsd: 100 };
    const result = checkBudget(2.5, 10.0, config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("per-task");
  });

  it("rejects task that would exceed monthly limit", () => {
    const config: BudgetConfig = { perTaskMaxUsd: 10, monthlyMaxUsd: 50 };
    const result = checkBudget(5.0, 48.0, config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("monthly");
  });

  it("allows when no limits configured", () => {
    const result = checkBudget(100.0, 500.0, {});
    expect(result.allowed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run extensions/vwp-dispatch/budget.test.ts`
Expected: FAIL

**Step 3: Implement budget checker**

```typescript
// budget.ts
export type BudgetConfig = {
  perTaskMaxUsd?: number;
  monthlyMaxUsd?: number;
};

export type BudgetCheckResult = {
  allowed: boolean;
  reason?: string;
};

export function checkBudget(
  estimatedCostUsd: number,
  monthlySpentUsd: number,
  config: BudgetConfig,
): BudgetCheckResult {
  if (config.perTaskMaxUsd !== undefined && estimatedCostUsd > config.perTaskMaxUsd) {
    return {
      allowed: false,
      reason: `Estimated cost $${estimatedCostUsd.toFixed(2)} exceeds per-task limit of $${config.perTaskMaxUsd.toFixed(2)}`,
    };
  }

  if (config.monthlyMaxUsd !== undefined) {
    const projectedTotal = monthlySpentUsd + estimatedCostUsd;
    if (projectedTotal > config.monthlyMaxUsd) {
      return {
        allowed: false,
        reason: `Projected monthly spend $${projectedTotal.toFixed(2)} exceeds monthly limit of $${config.monthlyMaxUsd.toFixed(2)} (already spent $${monthlySpentUsd.toFixed(2)})`,
      };
    }
  }

  return { allowed: true };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run extensions/vwp-dispatch/budget.test.ts`
Expected: PASS

**Step 5: Add cost tracking file**

Create `extensions/vwp-dispatch/cost-tracker.ts` — reads all `final.json` from current month's tasks to compute `monthlySpentUsd`.

```typescript
// cost-tracker.ts
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TASKS_DIR = join(homedir(), ".openclaw", "vwp", "tasks");

/**
 * Sum actual cost from all completed tasks in the current calendar month.
 */
export async function getMonthlySpend(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let total = 0;

  try {
    const taskIds = await readdir(TASKS_DIR);
    for (const id of taskIds) {
      try {
        const raw = await readFile(join(TASKS_DIR, id, "final.json"), "utf-8");
        const final = JSON.parse(raw) as { costUsd?: number; completedAt?: number };
        if (final.costUsd && (final.completedAt ?? 0) >= monthStart) {
          total += final.costUsd;
        }
      } catch {
        // Skip tasks without final.json
      }
    }
  } catch {
    // Tasks dir doesn't exist yet
  }

  return total;
}
```

**Step 6: Wire budget check into `index.ts`**

In `extensions/vwp-dispatch/index.ts`:

- Add to `VwpDispatchPluginConfig`: `perTaskMaxUsd?: number;` and `monthlyMaxUsd?: number;`
- In `executeTeam()`, before launching the team (around line 170), add:

```typescript
import { checkBudget } from "./budget.js";
import { getMonthlySpend } from "./cost-tracker.js";

// Inside executeTeam(), after cost estimation:
const monthlySpend = await getMonthlySpend();
const budgetCheck = checkBudget(spec.estimatedCost.estimatedCostUsd, monthlySpend, {
  perTaskMaxUsd: pluginCfg.perTaskMaxUsd,
  monthlyMaxUsd: pluginCfg.monthlyMaxUsd,
});
if (!budgetCheck.allowed) {
  throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
}
```

- Update `openclaw.plugin.json` config schema to include `perTaskMaxUsd` and `monthlyMaxUsd` as `number` properties.

**Step 7: Run all dispatch tests**

Run: `pnpm vitest run extensions/vwp-dispatch/`
Expected: All PASS

**Step 8: Commit**

```bash
git add extensions/vwp-dispatch/budget.ts extensions/vwp-dispatch/budget.test.ts extensions/vwp-dispatch/cost-tracker.ts extensions/vwp-dispatch/index.ts extensions/vwp-dispatch/openclaw.plugin.json
git commit -m "feat(vwp): add budget caps with per-task and monthly limits"
```

---

### Task 4: Input Sanitization for Claude CLI

**Files:**

- Create: `extensions/vwp-dispatch/sanitize.ts`
- Create: `extensions/vwp-dispatch/sanitize.test.ts`
- Modify: `extensions/vwp-dispatch/analyzer.ts` (line 89 — where user text is passed to CLI args)

**Context:** User task text is passed directly as `-p <text>` argument to Claude CLI. This could contain shell metacharacters or prompt injection attempts.

**Step 1: Write the failing test**

```typescript
// sanitize.test.ts
import { describe, expect, it } from "vitest";
import { sanitizeTaskText } from "./sanitize.js";

describe("sanitizeTaskText", () => {
  it("passes through normal text unchanged", () => {
    expect(sanitizeTaskText("Write a marketing email")).toBe("Write a marketing email");
  });

  it("strips null bytes", () => {
    expect(sanitizeTaskText("hello\x00world")).toBe("helloworld");
  });

  it("enforces max length", () => {
    const long = "a".repeat(20_000);
    const result = sanitizeTaskText(long);
    expect(result.length).toBeLessThanOrEqual(10_000);
  });

  it("rejects empty input", () => {
    expect(() => sanitizeTaskText("")).toThrow(/empty/i);
    expect(() => sanitizeTaskText("   ")).toThrow(/empty/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run extensions/vwp-dispatch/sanitize.test.ts`
Expected: FAIL

**Step 3: Implement sanitizer**

```typescript
// sanitize.ts
const MAX_TASK_TEXT_LENGTH = 10_000;

/**
 * Sanitize user-provided task text before passing to CLI.
 * Strips null bytes, enforces length limits, and rejects empty input.
 */
export function sanitizeTaskText(text: string): string {
  // Strip null bytes
  let cleaned = text.replace(/\0/g, "");

  // Trim whitespace
  cleaned = cleaned.trim();

  if (cleaned.length === 0) {
    throw new Error("Task text is empty after sanitization");
  }

  // Enforce length limit
  if (cleaned.length > MAX_TASK_TEXT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_TASK_TEXT_LENGTH);
  }

  return cleaned;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run extensions/vwp-dispatch/sanitize.test.ts`
Expected: PASS

**Step 5: Wire into analyzer.ts**

In `extensions/vwp-dispatch/analyzer.ts`, at the start of the `analyzeTask()` function:

```typescript
import { sanitizeTaskText } from "./sanitize.js";
// ... at top of analyzeTask():
const cleanText = sanitizeTaskText(text);
// Use cleanText instead of text in the CLI args
```

**Step 6: Wire into routes.ts**

In `extensions/vwp-dispatch/routes.ts`, in the submit handler, validate the task text before enqueuing:

```typescript
import { sanitizeTaskText } from "./sanitize.js";
// Before enqueue:
try {
  body.text = sanitizeTaskText(body.text);
} catch {
  jsonResponse(res, 400, { error: "Task text is empty" });
  return true;
}
```

**Step 7: Run all dispatch tests**

Run: `pnpm vitest run extensions/vwp-dispatch/`
Expected: All PASS

**Step 8: Commit**

```bash
git add extensions/vwp-dispatch/sanitize.ts extensions/vwp-dispatch/sanitize.test.ts extensions/vwp-dispatch/analyzer.ts extensions/vwp-dispatch/routes.ts
git commit -m "feat(vwp): add input sanitization for task text before CLI handoff"
```

---

### Task 5: Graceful Shutdown Handler

**Files:**

- Create: `extensions/vwp-dispatch/shutdown.ts`
- Create: `extensions/vwp-dispatch/shutdown.test.ts`
- Modify: `extensions/vwp-dispatch/index.ts` — register shutdown handler at end of `register()`

**Context:** Currently when the gateway stops, running Claude CLI subprocesses are orphaned. No signal handler saves state.

**Step 1: Write the failing test**

```typescript
// shutdown.test.ts
import { describe, expect, it, vi } from "vitest";
import { ShutdownManager } from "./shutdown.js";

describe("ShutdownManager", () => {
  it("runs all registered cleanup handlers", async () => {
    const manager = new ShutdownManager();
    const order: number[] = [];
    manager.onShutdown(async () => {
      order.push(1);
    });
    manager.onShutdown(async () => {
      order.push(2);
    });

    await manager.shutdown();
    expect(order).toEqual([1, 2]);
  });

  it("only runs shutdown once even if called multiple times", async () => {
    const manager = new ShutdownManager();
    let count = 0;
    manager.onShutdown(async () => {
      count++;
    });

    await manager.shutdown();
    await manager.shutdown();
    expect(count).toBe(1);
  });

  it("continues cleanup even if one handler throws", async () => {
    const manager = new ShutdownManager();
    const cleanedUp: string[] = [];
    manager.onShutdown(async () => {
      cleanedUp.push("a");
    });
    manager.onShutdown(async () => {
      throw new Error("boom");
    });
    manager.onShutdown(async () => {
      cleanedUp.push("c");
    });

    await manager.shutdown();
    expect(cleanedUp).toEqual(["a", "c"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run extensions/vwp-dispatch/shutdown.test.ts`
Expected: FAIL

**Step 3: Implement shutdown manager**

```typescript
// shutdown.ts
type CleanupFn = () => Promise<void>;

export class ShutdownManager {
  private handlers: CleanupFn[] = [];
  private shutdownCalled = false;

  onShutdown(fn: CleanupFn): void {
    this.handlers.push(fn);
  }

  async shutdown(): Promise<void> {
    if (this.shutdownCalled) return;
    this.shutdownCalled = true;

    for (const handler of this.handlers) {
      try {
        await handler();
      } catch (err) {
        console.error("[vwp-shutdown] Cleanup handler failed:", err);
      }
    }
  }

  /**
   * Register process signal handlers. Call once during plugin init.
   */
  registerSignals(): void {
    const onSignal = () => {
      void this.shutdown();
    };
    process.once("SIGTERM", onSignal);
    process.once("SIGINT", onSignal);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run extensions/vwp-dispatch/shutdown.test.ts`
Expected: PASS

**Step 5: Wire into index.ts**

In `extensions/vwp-dispatch/index.ts`, at the end of `register()`:

```typescript
import { ShutdownManager } from "./shutdown.js";

// Inside register():
const shutdown = new ShutdownManager();
shutdown.onShutdown(async () => {
  api.logger.info("vwp-dispatch: shutting down...");
  health.dispose();
  await queue.persist();
  registry.stopWatching();
});
shutdown.registerSignals();
```

**Step 6: Run all dispatch tests**

Run: `pnpm vitest run extensions/vwp-dispatch/`
Expected: All PASS

**Step 7: Commit**

```bash
git add extensions/vwp-dispatch/shutdown.ts extensions/vwp-dispatch/shutdown.test.ts extensions/vwp-dispatch/index.ts
git commit -m "feat(vwp): add graceful shutdown with signal handlers"
```

---

### Task 6: Environment Variable Filtering for Subprocesses

**Files:**

- Create: `extensions/vwp-dispatch/safe-env.ts`
- Create: `extensions/vwp-dispatch/safe-env.test.ts`
- Modify: `extensions/vwp-dispatch/team-launcher.ts` (lines 128-131, 157-160 — env for subprocess)

**Context:** Claude CLI subprocesses inherit `process.env` which may contain API keys, tokens, or secrets that agents shouldn't access.

**Step 1: Write the failing test**

```typescript
// safe-env.test.ts
import { describe, expect, it } from "vitest";
import { buildSafeEnv } from "./safe-env.js";

describe("buildSafeEnv", () => {
  it("preserves PATH and HOME", () => {
    const env = buildSafeEnv({ PATH: "/usr/bin", HOME: "/home/user", SECRET_KEY: "abc" });
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/user");
  });

  it("strips known secret env vars", () => {
    const env = buildSafeEnv({
      PATH: "/usr/bin",
      OPENCLAW_GATEWAY_TOKEN: "secret",
      AWS_SECRET_ACCESS_KEY: "secret",
      OPENAI_API_KEY: "secret",
      ANTHROPIC_API_KEY: "secret",
    });
    expect(env.OPENCLAW_GATEWAY_TOKEN).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("preserves CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", () => {
    const env = buildSafeEnv({ PATH: "/usr/bin", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" });
    expect(env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run extensions/vwp-dispatch/safe-env.test.ts`
Expected: FAIL

**Step 3: Implement safe env builder**

```typescript
// safe-env.ts
/**
 * Env var prefixes/names to strip from subprocess environments.
 * These are secrets that agent subprocesses should not inherit.
 */
const BLOCKED_PATTERNS = [
  /^OPENCLAW_GATEWAY_TOKEN$/,
  /^AWS_SECRET/,
  /^AWS_SESSION/,
  /^OPENAI_API_KEY$/,
  /^ANTHROPIC_API_KEY$/,
  /^GOOGLE_APPLICATION_CREDENTIALS$/,
  /^DATABASE_URL$/,
  /^REDIS_URL$/,
  /SECRET/i,
  /PASSWORD/i,
  /CREDENTIAL/i,
  /PRIVATE_KEY/i,
];

/** Keys to always preserve even if they match a blocked pattern. */
const ALWAYS_ALLOW = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "TERM",
  "NODE_ENV",
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
  "CLAUDECODE",
]);

export function buildSafeEnv(env: Record<string, string | undefined>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (ALWAYS_ALLOW.has(key)) {
      safe[key] = value;
      continue;
    }
    if (BLOCKED_PATTERNS.some((p) => p.test(key))) continue;
    safe[key] = value;
  }
  return safe;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run extensions/vwp-dispatch/safe-env.test.ts`
Expected: PASS

**Step 5: Wire into team-launcher.ts**

In `extensions/vwp-dispatch/team-launcher.ts`, replace `...process.env` with `buildSafeEnv(process.env)` in both subprocess spawn calls:

```typescript
import { buildSafeEnv } from "./safe-env.js";

// Line ~128-131: lead subprocess
env: {
  ...buildSafeEnv(process.env as Record<string, string>),
  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
  CLAUDECODE: "",
},

// Line ~157-160: specialist subprocess (same pattern)
```

**Step 6: Run all dispatch tests**

Run: `pnpm vitest run extensions/vwp-dispatch/`
Expected: All PASS

**Step 7: Commit**

```bash
git add extensions/vwp-dispatch/safe-env.ts extensions/vwp-dispatch/safe-env.test.ts extensions/vwp-dispatch/team-launcher.ts
git commit -m "feat(vwp): filter secrets from subprocess environment variables"
```

---

## Phase 2: Reliability (Survive Failures)

### Task 7: SSE Reconnect with Event Replay

**Files:**

- Modify: `extensions/vwp-approval/sse.ts` (lines 15-72 — connection handling)
- Create: `extensions/vwp-approval/sse-replay.test.ts`

**Context:** SSE has no event IDs or replay buffer. If a client disconnects and reconnects, it misses all events. Add `Last-Event-ID` support.

**Step 1: Write the failing test**

```typescript
// sse-replay.test.ts
import { describe, expect, it } from "vitest";
import { EventBuffer } from "../vwp-approval/sse.js";

describe("EventBuffer", () => {
  it("stores events with incrementing IDs", () => {
    const buf = new EventBuffer(10);
    const id1 = buf.add({ type: "test", data: "first" });
    const id2 = buf.add({ type: "test", data: "second" });
    expect(id2).toBeGreaterThan(id1);
  });

  it("replays events after a given ID", () => {
    const buf = new EventBuffer(10);
    const id1 = buf.add({ type: "test", data: "first" });
    buf.add({ type: "test", data: "second" });
    buf.add({ type: "test", data: "third" });

    const replayed = buf.replaySince(id1);
    expect(replayed).toHaveLength(2);
    expect(replayed[0].event.data).toBe("second");
    expect(replayed[1].event.data).toBe("third");
  });

  it("evicts oldest events when capacity exceeded", () => {
    const buf = new EventBuffer(3);
    buf.add({ type: "a", data: "1" });
    const id2 = buf.add({ type: "b", data: "2" });
    buf.add({ type: "c", data: "3" });
    buf.add({ type: "d", data: "4" });

    // Event "1" should be evicted
    const all = buf.replaySince(0);
    expect(all).toHaveLength(3);
    expect(all[0].event.data).toBe("2");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run extensions/vwp-approval/sse-replay.test.ts`
Expected: FAIL

**Step 3: Add EventBuffer class to `sse.ts`**

Add to `extensions/vwp-approval/sse.ts`:

```typescript
export class EventBuffer {
  private events: Array<{ id: number; event: { type: string; data: string } }> = [];
  private nextId = 1;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  add(event: { type: string; data: string }): number {
    const id = this.nextId++;
    this.events.push({ id, event });
    if (this.events.length > this.capacity) {
      this.events.shift();
    }
    return id;
  }

  replaySince(lastId: number): Array<{ id: number; event: { type: string; data: string } }> {
    return this.events.filter((e) => e.id > lastId);
  }
}
```

Then integrate into `ApprovalSSE.emit()` to buffer events, and in `addConnection()` check for `Last-Event-ID` header to replay missed events.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run extensions/vwp-approval/sse-replay.test.ts`
Expected: PASS

**Step 5: Run all approval tests**

Run: `pnpm vitest run extensions/vwp-approval/`
Expected: All PASS

**Step 6: Commit**

```bash
git add extensions/vwp-approval/sse.ts extensions/vwp-approval/sse-replay.test.ts
git commit -m "feat(vwp): add SSE event replay buffer with Last-Event-ID support"
```

---

### Task 8: Confirm-Before-Analyzed Race Fix

**Files:**

- Modify: `extensions/vwp-dispatch/routes.ts` — confirm endpoint
- Modify: `extensions/vwp-dispatch/checkpoint.ts` — add `hasDecomposition()` helper
- Create: `extensions/vwp-dispatch/confirm-race.test.ts`

**Context:** If the user calls confirm before analysis completes, `executeTeam()` throws "No decomposition found". The confirm endpoint should return 409 if not yet analyzed.

**Step 1: Write the failing test**

```typescript
// confirm-race.test.ts
import { describe, expect, it } from "vitest";
import { hasDecomposition } from "./checkpoint.js";
// Test that hasDecomposition returns false before analysis
// and the confirm route returns 409
```

**Step 2: Add `hasDecomposition()` to checkpoint.ts**

```typescript
export async function hasDecomposition(taskId: string): Promise<boolean> {
  const dir = join(TASKS_DIR, taskId);
  try {
    await access(join(dir, "decomposition.json"));
    return true;
  } catch {
    return false;
  }
}
```

**Step 3: Guard the confirm endpoint in routes.ts**

In the confirm handler, before calling `onConfirm`:

```typescript
import { hasDecomposition } from "./checkpoint.js";

// In confirm handler:
const analyzed = await hasDecomposition(taskId);
if (!analyzed) {
  jsonResponse(res, 409, { error: "Task not yet analyzed — please wait" });
  return true;
}
```

**Step 4: Run tests**

Run: `pnpm vitest run extensions/vwp-dispatch/`
Expected: All PASS

**Step 5: Commit**

```bash
git add extensions/vwp-dispatch/checkpoint.ts extensions/vwp-dispatch/routes.ts extensions/vwp-dispatch/confirm-race.test.ts
git commit -m "fix(vwp): return 409 on confirm before analysis completes"
```

---

### Task 9: Stuck Task Auto-Recovery

**Files:**

- Modify: `extensions/vwp-dispatch/health-monitor.ts` — add callback for stuck detection
- Modify: `extensions/vwp-dispatch/index.ts` — wire stuck task handling

**Context:** `HealthMonitor` flags stuck tasks but only sets a boolean. It should emit an event or call a callback so the pipeline can auto-fail them.

**Step 1: Add onStuck callback to HealthMonitor**

```typescript
// In health-monitor.ts, add:
private onStuck?: (taskId: string) => void;

constructor(onStuck?: (taskId: string) => void) {
  this.onStuck = onStuck;
}

// In the interval callback, after setting entry.stuck = true:
if (this.onStuck) this.onStuck(entry.taskId);
```

**Step 2: Wire in index.ts**

```typescript
const health = new HealthMonitor((taskId) => {
  api.logger.warn(`vwp-dispatch: task ${taskId} is stuck, auto-failing`);
  void (async () => {
    await checkpoint.saveFinal(taskId, {
      taskId,
      status: "failed",
      subtasks: [],
      synthesizedResult: "Task timed out (stuck detection)",
    });
    await moveTask(taskId, "done");
    sse.emit({ type: "task_column_changed", taskId, from: "in_progress", to: "done" });
    await queue.completeActive();
  })();
});
```

**Step 3: Run tests**

Run: `pnpm vitest run extensions/vwp-dispatch/`
Expected: All PASS

**Step 4: Commit**

```bash
git add extensions/vwp-dispatch/health-monitor.ts extensions/vwp-dispatch/index.ts
git commit -m "feat(vwp): auto-fail stuck tasks via health monitor callback"
```

---

## Phase 3: Observability & Operations

### Task 10: Task Cleanup on Startup

**Files:**

- Create: `extensions/vwp-dispatch/task-cleanup.ts`
- Create: `extensions/vwp-dispatch/task-cleanup.test.ts`
- Modify: `extensions/vwp-dispatch/index.ts` — run cleanup on startup

**Context:** Task directories in `~/.openclaw/vwp/tasks/` accumulate forever. Add cleanup that archives old tasks.

**Step 1: Write test, then implement**

The cleanup function should:

- Read all task directories
- Delete tasks older than `maxAgeDays` (default 90)
- Log a summary of deleted tasks

**Step 2: Wire into startup in index.ts**

Add to the background async block (lines 61-75):

```typescript
import { cleanupOldTasks } from "./task-cleanup.js";
// In the startup async block:
const cleaned = await cleanupOldTasks({ maxAgeDays: 90 });
if (cleaned > 0) api.logger.info(`vwp-dispatch: cleaned up ${cleaned} old tasks`);
```

**Step 3: Run tests, commit**

---

### Task 11: Wire Memory System into Pipeline

**Files:**

- Modify: `extensions/vwp-dispatch/index.ts` — import and wire memory sync

**Context:** The memory module (`notebooklm-client.ts`, `memory-sync.ts`, `memory-enrichment.ts`) is fully implemented but not connected to the pipeline.

**Step 1: Wire memory sync after task completion**

In `extensions/vwp-dispatch/index.ts`:

```typescript
import { createMemoryClient, MemorySync } from "./memory/index.js";
import { enrichDecomposition, formatEnrichmentPrompt } from "./memory/index.js";

// In register(), after creating queue:
let memorySync: MemorySync | undefined;
void (async () => {
  try {
    const client = await createMemoryClient(await loadProfile());
    memorySync = new MemorySync(client);
    api.logger.info("vwp-dispatch: memory system initialized");
  } catch {
    api.logger.warn("vwp-dispatch: memory system unavailable");
  }
})();
```

**Step 2: Sync after task completion**

In the `task_completed` event handler:

```typescript
queue.on("task_completed", () => {
  // Sync to memory in background
  if (memorySync && queue.lastCompletedId) {
    void memorySync.syncTaskCompletion(queue.lastCompletedId);
  }
  // ... existing dequeue logic
});
```

**Step 3: Enrich analysis with memory**

In `analyzeNewTask()`, before calling `analyzeTask()`:

```typescript
// Optionally enrich with memory context
let enrichmentPrompt = "";
if (memorySync) {
  const client = await createMemoryClient(await loadProfile());
  const context = await loadBusinessContext("lead");
  const enrichment = await enrichDecomposition(task.text, context, client);
  enrichmentPrompt = formatEnrichmentPrompt(enrichment);
}
```

Pass `enrichmentPrompt` to `analyzeTask()` as additional context.

**Step 4: Run tests, commit**

---

## Phase 4: Dashboard UX

### Task 12: Disable Confirm Button During Analysis

**Files:**

- Modify: `extensions/vwp-dashboard/src/views/queue-view.ts` — disable confirm until analyzed

**Context:** The queue view shows a confirm button immediately. It should be disabled until the task has a decomposition (analysis complete).

**Step 1: Add `analyzed` state tracking**

Listen for SSE events that indicate analysis is complete. Or poll the task status endpoint.

**Step 2: Disable the confirm button**

Add `disabled` attribute to the confirm button when `!task.analyzed`.

**Step 3: Run dashboard tests, commit**

---

### Task 13: Add Task History View

**Files:**

- Create: `extensions/vwp-dashboard/src/views/history-view.ts`
- Create: `extensions/vwp-dashboard/src/views/history-view.test.ts`
- Modify: `extensions/vwp-dashboard/src/app.ts` — add route
- Modify: `extensions/vwp-dashboard/src/components/tab-bar.ts` — add tab

**Context:** Completed/failed tasks are only visible in the kanban "done" column. Add a dedicated history view with filtering.

---

### Task 14: Per-Task Cost Display

**Files:**

- Modify: `extensions/vwp-dashboard/src/views/tasks-view.ts` — show cost in task cards
- Modify: `extensions/vwp-dashboard/src/api/types.ts` — add cost fields

**Context:** Tasks in the kanban board don't show their estimated or actual cost. Add cost badges.

---

## Phase 5: Scale

### Task 15: File Locking for Concurrent Safety

**Files:**

- Create: `extensions/vwp-dispatch/file-lock.ts`
- Create: `extensions/vwp-dispatch/file-lock.test.ts`
- Modify: `extensions/vwp-dispatch/task-queue.ts` — wrap persist/load with lock

**Context:** If two gateway processes start, they can corrupt shared queue state. Add a PID-based lockfile.

---

### Task 16: Increase SSE Connection Limit

**Files:**

- Modify: `extensions/vwp-approval/sse.ts` (line 15 — `MAX_SSE_CONNECTIONS = 5`)
- Modify: `extensions/vwp-dispatch/openclaw.plugin.json` — add `maxSseConnections` config

**Context:** Hardcoded 5-connection limit is too low for multi-user. Make configurable with a higher default (25).

---

### Task 17: Multi-User Task Scoping (Future)

**Files:** Multiple — requires scoping all state directories by user ID.

**Context:** This is a larger architectural change. All file paths under `~/.openclaw/vwp/` need to include a user/workspace scope. Defer to a dedicated planning session.

---

## Execution Order and Dependencies

```
Task 1 (atomic writes) ──> Task 2 (wire atomic writes)
Task 3 (budget caps) ──────────────────────────────────> Task 11 (wire memory)
Task 4 (input sanitization) ───────────────────────────>
Task 5 (graceful shutdown) ────────────────────────────>
Task 6 (env filtering) ───────────────────────────────>
Task 7 (SSE replay) ──────> Task 12 (disable confirm UI)
Task 8 (confirm race fix) ─> Task 12 (disable confirm UI)
Task 9 (stuck recovery) ──>
Task 10 (task cleanup) ───>
Task 13 (history view) ────> Task 14 (cost display)
Task 15 (file locking) ───>
Task 16 (SSE limit) ──────>
```

**Parallelizable groups:**

- Group A: Tasks 1+2 (atomic writes)
- Group B: Tasks 3, 4, 5, 6 (all independent safety tasks)
- Group C: Tasks 7, 8, 9, 10 (reliability, can run in parallel)
- Group D: Tasks 11, 12, 13, 14 (UX, sequential after Phase 1-2)
- Group E: Tasks 15, 16 (scale, independent)
