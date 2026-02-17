# Workspace Tools Integration — Mission Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate external Python workspace tools (content-suite: reddit_scout, x_scout, trend_scout, social_alchemist, content_drafter) into the VWP Board Mission Control dashboard so users can launch, monitor, cancel, and view outputs of tools directly from the UI.

**Architecture:** Tools are Python CLI scripts copied into `tools/` at the repo root. Each tool has a `tool.json` manifest declaring its entrypoint, arguments schema, required env vars, timeout, and output paths. A new `ToolRunner` in `extensions/vwp-dispatch/` manages subprocess lifecycle (spawn, buffer, timeout, cancel). New SSE event types (`tool_run_*`) flow through the existing `ApprovalSSE` pipeline to the frontend. A new `/tools` page in `apps/vwp-board/` (Next.js 15 / React 19 / Zustand) provides the UI: tool grid, run dialog, live output viewer, and run history.

**Tech Stack:** TypeScript (Node.js subprocess management), Python 3 (workspace tools), Next.js 15 App Router, React 19, Zustand, Tailwind CSS 4, Vitest, SSE (Server-Sent Events)

**Key files to reference:**

- Backend plugin entry: `extensions/vwp-dispatch/index.ts`
- Route pattern: `extensions/vwp-dispatch/kanban-routes.ts`
- SSE infrastructure: `extensions/vwp-approval/sse.ts`
- Event types: `extensions/vwp-dispatch/kanban-types.ts`
- Env filtering: `extensions/vwp-dispatch/safe-env.ts`
- Frontend store: `apps/vwp-board/src/store/board-store.ts`
- API client: `apps/vwp-board/src/lib/api-client.ts`
- Frontend types: `apps/vwp-board/src/types/kanban.ts`
- Layout/nav: `apps/vwp-board/src/app/layout.tsx`

---

## Task 1: Copy Workspace Tools & Create Tool Manifests

**Files:**

- Create: `tools/content-suite/tool-reddit-scout.json`
- Create: `tools/content-suite/tool-x-scout.json`
- Create: `tools/content-suite/tool-trend-scout.json`
- Create: `tools/content-suite/tool-social-alchemist.json`
- Create: `tools/content-suite/tool-content-drafter.json`
- Create: `tools/content-suite/requirements.txt`
- Copy: All `.py` files from `/Users/dave/Work/openclaw-workspace/tools/content-suite/` → `tools/content-suite/`
- Copy: `playbook.json` from `/Users/dave/Work/openclaw-workspace/tools/content-suite/` → `tools/content-suite/`

**Step 1: Copy the Python tool files**

```bash
mkdir -p tools/content-suite
cp /Users/dave/Work/openclaw-workspace/tools/content-suite/*.py tools/content-suite/
cp /Users/dave/Work/openclaw-workspace/tools/content-suite/playbook.json tools/content-suite/
```

**Step 2: Create `tools/content-suite/requirements.txt`**

```txt
praw>=7.0
requests>=2.31
python-dotenv>=1.0
```

Note: `claude_agent_sdk` is installed separately via `npm install -g @anthropic-ai/claude-code`. The Python tools import it but it's provided by the Claude Code CLI.

**Step 3: Create tool manifest `tools/content-suite/tool-reddit-scout.json`**

```json
{
  "name": "reddit_scout",
  "label": "Reddit Intelligence",
  "description": "Research Reddit for pain points, market signals, or general trends on any topic",
  "category": "research",
  "entrypoint": "reddit_scout.py",
  "runtime": "python3",
  "args_schema": {
    "topic": { "type": "string", "required": true, "label": "Topic" },
    "mode": {
      "type": "enum",
      "values": ["pain", "market", "general"],
      "required": true,
      "label": "Research Mode"
    },
    "subreddit": { "type": "string", "required": false, "label": "Subreddit (optional)" }
  },
  "env_allowlist": [
    "REDDIT_CLIENT_ID",
    "REDDIT_SECRET",
    "REDDIT_USER_AGENT",
    "REDDIT_SCRAPER_MODE",
    "BRAVE_API_KEY",
    "ANTHROPIC_API_KEY"
  ],
  "outputs": ["reports/", "logs/"],
  "timeout_seconds": 300,
  "max_output_bytes": 10485760
}
```

**Step 4: Create tool manifest `tools/content-suite/tool-x-scout.json`**

```json
{
  "name": "x_scout",
  "label": "X/Twitter Intelligence",
  "description": "Research X/Twitter for leads, trends, or competitor analysis",
  "category": "research",
  "entrypoint": "x_scout.py",
  "runtime": "python3",
  "args_schema": {
    "query": { "type": "string", "required": true, "label": "Search Query" },
    "mode": {
      "type": "enum",
      "values": ["leads", "trends", "competitor"],
      "required": true,
      "label": "Research Mode"
    }
  },
  "env_allowlist": [
    "RAPIDAPI_KEY",
    "RAPIDAPI_HOST",
    "RAPIDAPI_SEARCH_URL",
    "BRAVE_SEARCH_API_KEY",
    "ANTHROPIC_API_KEY"
  ],
  "outputs": ["reports/", "logs/"],
  "timeout_seconds": 300,
  "max_output_bytes": 10485760
}
```

**Step 5: Create tool manifest `tools/content-suite/tool-trend-scout.json`**

```json
{
  "name": "trend_scout",
  "label": "Trend Scout",
  "description": "Discover trending AI/tech topics using Brave Search and Grok analysis",
  "category": "research",
  "entrypoint": "trend_scout.py",
  "runtime": "python3",
  "args_schema": {
    "topic": { "type": "string", "required": false, "label": "Topic (optional, defaults to AI)" }
  },
  "env_allowlist": ["BRAVE_API_KEY", "XAI_API_KEY", "ANTHROPIC_API_KEY"],
  "outputs": ["trends.json"],
  "timeout_seconds": 180,
  "max_output_bytes": 5242880
}
```

**Step 6: Create tool manifest `tools/content-suite/tool-social-alchemist.json`**

```json
{
  "name": "social_alchemist",
  "label": "Social Alchemist",
  "description": "Generate omni-channel social media content from a core idea or URL",
  "category": "content",
  "entrypoint": "social_alchemist.py",
  "runtime": "python3",
  "args_schema": {
    "input": { "type": "string", "required": true, "label": "Core idea, file path, or URL" },
    "update_meta": {
      "type": "string",
      "required": false,
      "label": "Platform trend update (optional)"
    }
  },
  "env_allowlist": ["ANTHROPIC_API_KEY"],
  "outputs": ["campaigns/"],
  "timeout_seconds": 300,
  "max_output_bytes": 10485760
}
```

**Step 7: Create tool manifest `tools/content-suite/tool-content-drafter.json`**

```json
{
  "name": "content_drafter",
  "label": "Content Drafter",
  "description": "Generate platform-specific content drafts from trending topics",
  "category": "content",
  "entrypoint": "content_drafter.py",
  "runtime": "python3",
  "args_schema": {
    "type": {
      "type": "enum",
      "values": [
        "linkedin",
        "youtube",
        "youtube_shorts",
        "x",
        "threads",
        "instagram",
        "tiktok",
        "facebook",
        "reddit",
        "pinterest"
      ],
      "required": false,
      "label": "Platform (default: linkedin)"
    },
    "topic": { "type": "string", "required": false, "label": "Topic index (default: auto-pick)" },
    "all": { "type": "boolean", "required": false, "label": "Generate for all platforms" }
  },
  "env_allowlist": ["ANTHROPIC_API_KEY"],
  "outputs": ["drafts/"],
  "timeout_seconds": 600,
  "max_output_bytes": 20971520
}
```

**Step 8: Commit**

```bash
git add tools/content-suite/
git commit -m "feat(tools): copy content-suite workspace tools with manifests"
```

---

## Task 2: Tool Manifest Types & Validation

**Files:**

- Create: `extensions/vwp-dispatch/tool-manifest.ts`
- Test: `extensions/vwp-dispatch/tool-manifest.test.ts`

**Step 1: Write the failing tests**

Create `extensions/vwp-dispatch/tool-manifest.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

const { loadToolManifest, validateManifest, discoverTools } = await import("./tool-manifest.ts");

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    const manifest = {
      name: "reddit_scout",
      label: "Reddit Intelligence",
      description: "Research Reddit",
      category: "research",
      entrypoint: "reddit_scout.py",
      runtime: "python3",
      args_schema: {
        topic: { type: "string", required: true, label: "Topic" },
      },
      env_allowlist: ["BRAVE_API_KEY"],
      outputs: ["reports/"],
      timeout_seconds: 300,
      max_output_bytes: 10485760,
    };
    const result = validateManifest(manifest, "/fake/tools/content-suite");
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects manifest with missing required fields", () => {
    const result = validateManifest({ name: "test" }, "/fake/path");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects manifest with path traversal in entrypoint", () => {
    const manifest = {
      name: "evil",
      label: "Evil",
      description: "Bad",
      category: "research",
      entrypoint: "../../../etc/passwd",
      runtime: "python3",
      args_schema: {},
      env_allowlist: [],
      outputs: [],
      timeout_seconds: 60,
      max_output_bytes: 1048576,
    };
    const result = validateManifest(manifest, "/fake/tools/evil");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("entrypoint must not contain path traversal");
  });

  it("rejects manifest with path traversal in outputs", () => {
    const manifest = {
      name: "evil",
      label: "Evil",
      description: "Bad",
      category: "research",
      entrypoint: "main.py",
      runtime: "python3",
      args_schema: {},
      env_allowlist: [],
      outputs: ["../../etc/"],
      timeout_seconds: 60,
      max_output_bytes: 1048576,
    };
    const result = validateManifest(manifest, "/fake/tools/evil");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("path traversal"))).toBe(true);
  });

  it("rejects unsupported runtime", () => {
    const manifest = {
      name: "test",
      label: "Test",
      description: "Test",
      category: "research",
      entrypoint: "main.sh",
      runtime: "bash",
      args_schema: {},
      env_allowlist: [],
      outputs: [],
      timeout_seconds: 60,
      max_output_bytes: 1048576,
    };
    const result = validateManifest(manifest, "/fake/path");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("runtime"))).toBe(true);
  });
});

describe("loadToolManifest", () => {
  it("returns null for non-existent path", async () => {
    const result = await loadToolManifest("/nonexistent/tool.json");
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/tool-manifest.test.ts
```

Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `extensions/vwp-dispatch/tool-manifest.ts`:

```typescript
/**
 * Tool manifest loading, validation, and discovery.
 *
 * Each workspace tool lives in tools/<suite>/ and has one or more
 * tool-<name>.json manifest files describing how to run it.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, relative, normalize } from "node:path";

// ---------- Types ----------

export interface ArgSchema {
  type: "string" | "enum" | "boolean";
  values?: string[];
  required?: boolean;
  label: string;
}

export interface ToolManifest {
  name: string;
  label: string;
  description: string;
  category: string;
  entrypoint: string;
  runtime: "python3" | "node";
  args_schema: Record<string, ArgSchema>;
  env_allowlist: string[];
  outputs: string[];
  timeout_seconds: number;
  max_output_bytes: number;
}

export interface LoadedTool {
  manifest: ToolManifest;
  /** Absolute path to the tool directory. */
  toolDir: string;
  /** Absolute path to the manifest file. */
  manifestPath: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------- Validation ----------

const SUPPORTED_RUNTIMES = new Set(["python3", "node"]);

const REQUIRED_FIELDS: Array<keyof ToolManifest> = [
  "name",
  "label",
  "description",
  "category",
  "entrypoint",
  "runtime",
  "args_schema",
  "env_allowlist",
  "outputs",
  "timeout_seconds",
  "max_output_bytes",
];

function containsTraversal(p: string): boolean {
  const normalized = normalize(p);
  return normalized.startsWith("..") || normalized.includes("/..");
}

export function validateManifest(raw: Record<string, unknown>, toolDir: string): ValidationResult {
  const errors: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (typeof raw.runtime === "string" && !SUPPORTED_RUNTIMES.has(raw.runtime)) {
    errors.push(
      `unsupported runtime "${raw.runtime}" — must be one of: ${[...SUPPORTED_RUNTIMES].join(", ")}`,
    );
  }

  if (typeof raw.entrypoint === "string" && containsTraversal(raw.entrypoint)) {
    errors.push("entrypoint must not contain path traversal");
  }

  if (Array.isArray(raw.outputs)) {
    for (const output of raw.outputs) {
      if (typeof output === "string" && containsTraversal(output)) {
        errors.push(`output path "${output}" must not contain path traversal`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------- Loading ----------

export async function loadToolManifest(manifestPath: string): Promise<LoadedTool | null> {
  try {
    const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
    const toolDir = join(manifestPath, "..");
    const result = validateManifest(raw, toolDir);
    if (!result.valid) {
      return null;
    }
    return {
      manifest: raw as ToolManifest,
      toolDir: resolve(toolDir),
      manifestPath: resolve(manifestPath),
    };
  } catch {
    return null;
  }
}

// ---------- Discovery ----------

/**
 * Scan a tools root directory for tool manifests.
 * Expects structure: toolsRoot/<suite>/tool-<name>.json
 */
export async function discoverTools(toolsRoot: string): Promise<LoadedTool[]> {
  const tools: LoadedTool[] = [];

  let suites: string[];
  try {
    suites = await readdir(toolsRoot);
  } catch {
    return tools;
  }

  for (const suite of suites) {
    const suiteDir = join(toolsRoot, suite);
    try {
      const s = await stat(suiteDir);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    let files: string[];
    try {
      files = await readdir(suiteDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.startsWith("tool-") || !file.endsWith(".json")) continue;
      const loaded = await loadToolManifest(join(suiteDir, file));
      if (loaded) {
        tools.push(loaded);
      }
    }
  }

  return tools;
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/tool-manifest.test.ts
```

Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add extensions/vwp-dispatch/tool-manifest.ts extensions/vwp-dispatch/tool-manifest.test.ts
git commit -m "feat(dispatch): add tool manifest types, validation, and discovery"
```

---

## Task 3: Update safe-env.ts with Per-Tool Allowlist

**Files:**

- Modify: `extensions/vwp-dispatch/safe-env.ts`
- Test: `extensions/vwp-dispatch/safe-env.test.ts` (create if doesn't exist, or modify)

**Step 1: Write the failing test**

Create `extensions/vwp-dispatch/safe-env.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

const { buildSafeEnv } = await import("./safe-env.ts");

describe("buildSafeEnv", () => {
  const env = {
    PATH: "/usr/bin",
    HOME: "/home/user",
    ANTHROPIC_API_KEY: "sk-ant-123",
    BRAVE_API_KEY: "BSA-abc",
    REDDIT_SECRET: "secret123",
    NORMAL_VAR: "hello",
    DATABASE_URL: "postgres://x",
    AWS_SECRET_ACCESS_KEY: "aws-secret",
  };

  it("blocks ANTHROPIC_API_KEY by default", () => {
    const safe = buildSafeEnv(env);
    expect(safe.ANTHROPIC_API_KEY).toBeUndefined();
    expect(safe.PATH).toBe("/usr/bin");
    expect(safe.NORMAL_VAR).toBe("hello");
  });

  it("allows ANTHROPIC_API_KEY when in toolAllowlist", () => {
    const safe = buildSafeEnv(env, ["ANTHROPIC_API_KEY"]);
    expect(safe.ANTHROPIC_API_KEY).toBe("sk-ant-123");
  });

  it("allows BRAVE_API_KEY when in toolAllowlist", () => {
    const safe = buildSafeEnv(env, ["BRAVE_API_KEY"]);
    expect(safe.BRAVE_API_KEY).toBe("BSA-abc");
  });

  it("allows multiple keys from toolAllowlist", () => {
    const safe = buildSafeEnv(env, ["ANTHROPIC_API_KEY", "REDDIT_SECRET"]);
    expect(safe.ANTHROPIC_API_KEY).toBe("sk-ant-123");
    expect(safe.REDDIT_SECRET).toBe("secret123");
  });

  it("still blocks non-allowlisted secrets", () => {
    const safe = buildSafeEnv(env, ["ANTHROPIC_API_KEY"]);
    expect(safe.DATABASE_URL).toBeUndefined();
    expect(safe.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("works with empty allowlist (same as no allowlist)", () => {
    const safe = buildSafeEnv(env, []);
    expect(safe.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/safe-env.test.ts
```

Expected: FAIL — `buildSafeEnv` does not accept second argument, `ANTHROPIC_API_KEY` is always blocked

**Step 3: Update the implementation**

Replace the entire contents of `extensions/vwp-dispatch/safe-env.ts` with:

```typescript
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

/**
 * Build a filtered environment for subprocess execution.
 *
 * @param env - Full process.env
 * @param toolAllowlist - Optional list of env var names that should be passed
 *   through even if they match a BLOCKED_PATTERN. Used by ToolRunner to give
 *   each tool exactly the secrets it declares in its manifest.
 */
export function buildSafeEnv(
  env: Record<string, string | undefined>,
  toolAllowlist?: string[],
): Record<string, string> {
  const safe: Record<string, string> = {};
  const extraAllow = new Set(toolAllowlist ?? []);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (ALWAYS_ALLOW.has(key) || extraAllow.has(key)) {
      safe[key] = value;
      continue;
    }
    if (BLOCKED_PATTERNS.some((p) => p.test(key))) continue;
    safe[key] = value;
  }
  return safe;
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/safe-env.test.ts
```

Expected: All 6 tests PASS

**Step 5: Verify existing callers still compile**

The existing callers in `extensions/vwp-dispatch/` pass `buildSafeEnv(process.env)` without a second arg — this still works because `toolAllowlist` is optional and defaults to `undefined`.

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/
```

Expected: All existing tests still pass

**Step 6: Commit**

```bash
git add extensions/vwp-dispatch/safe-env.ts extensions/vwp-dispatch/safe-env.test.ts
git commit -m "feat(dispatch): add per-tool env allowlist to buildSafeEnv"
```

---

## Task 4: Add Tool SSE Event Types

**Files:**

- Modify: `extensions/vwp-dispatch/kanban-types.ts:29-59`
- Modify: `apps/vwp-board/src/types/kanban.ts:95-108`
- Modify: `apps/vwp-board/src/store/board-store.ts:13-41`

**Step 1: Add ToolSSEEvent to backend types**

In `extensions/vwp-dispatch/kanban-types.ts`, add before the closing of the file (after line 59):

```typescript
// --- Tool run types (Workspace Tools Integration) ---

export type ToolRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ToolRunInfo {
  runId: string;
  toolName: string;
  toolLabel: string;
  args: Record<string, string>;
  status: ToolRunStatus;
  startedAt: number;
  completedAt: number | null;
  exitCode: number | null;
  error: string | null;
}

export type ToolSSEEvent =
  | { type: "tool_run_started"; run: ToolRunInfo }
  | { type: "tool_run_output"; runId: string; stream: "stdout" | "stderr"; chunk: string }
  | {
      type: "tool_run_completed";
      runId: string;
      toolName: string;
      exitCode: number;
      durationMs: number;
    }
  | { type: "tool_run_failed"; runId: string; toolName: string; error: string }
  | { type: "tool_run_cancelled"; runId: string; toolName: string };
```

And update the `KanbanSSEEvent` union (line 29-37) to add `| ToolSSEEvent`:

```typescript
export type KanbanSSEEvent =
  | { type: "task_column_changed"; taskId: string; from: KanbanColumnId; to: KanbanColumnId }
  | { type: "subtask_started"; taskId: string; subtaskId: string; agentName: string }
  | { type: "subtask_completed"; taskId: string; subtaskId: string; result: string }
  | { type: "subtask_failed"; taskId: string; subtaskId: string; error: string }
  | { type: "agent_action"; taskId: string; agentName: string; action: string; detail: string }
  | { type: "cost_update"; taskId: string; currentTokens: number; currentUsd: number }
  | { type: "approval_required"; taskId: string; subtaskId: string; actionType: string }
  | AgentSSEEvent
  | ToolSSEEvent;
```

**Step 2: Mirror types in frontend**

Add to `apps/vwp-board/src/types/kanban.ts` (after the AgentInfo interface):

```typescript
// --- Tool run types (Workspace Tools Integration) ---

export type ToolRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ToolRunInfo {
  runId: string;
  toolName: string;
  toolLabel: string;
  args: Record<string, string>;
  status: ToolRunStatus;
  startedAt: number;
  completedAt: number | null;
  exitCode: number | null;
  error: string | null;
}
```

**Step 3: Add tool SSE events to the board store's event union**

In `apps/vwp-board/src/store/board-store.ts`, add to the `KanbanSSEEvent` type (after the `gateway_status` line):

```typescript
  | { type: "tool_run_started"; run: { runId: string; toolName: string; toolLabel: string; status: string; startedAt: number } }
  | { type: "tool_run_output"; runId: string; stream: "stdout" | "stderr"; chunk: string }
  | { type: "tool_run_completed"; runId: string; toolName: string; exitCode: number; durationMs: number }
  | { type: "tool_run_failed"; runId: string; toolName: string; error: string }
  | { type: "tool_run_cancelled"; runId: string; toolName: string };
```

These events will be handled in the store in Task 8 (tool store slice).

**Step 4: Verify types compile**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/kanban-types.test.ts 2>/dev/null; echo "OK"
```

**Step 5: Commit**

```bash
git add extensions/vwp-dispatch/kanban-types.ts apps/vwp-board/src/types/kanban.ts apps/vwp-board/src/store/board-store.ts
git commit -m "feat(types): add ToolSSEEvent and ToolRunInfo types for workspace tools"
```

---

## Task 5: Increase SSE Event Buffer Capacity

**Files:**

- Modify: `extensions/vwp-approval/sse.ts:44`

**Step 1: Change EventBuffer capacity**

In `extensions/vwp-approval/sse.ts`, the `ApprovalSSE` class constructor creates `new EventBuffer(100)` on line 44. Change it to:

```typescript
  private buffer = new EventBuffer(500);
```

This increase accommodates the higher event volume from tool output streaming (batched every 2s / 4KB, but 3 concurrent tools can still generate many events).

**Step 2: Verify existing tests still pass**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-approval/
```

Expected: All existing tests PASS

**Step 3: Commit**

```bash
git add extensions/vwp-approval/sse.ts
git commit -m "perf(sse): increase EventBuffer capacity 100→500 for tool output events"
```

---

## Task 6: ToolRunner — Subprocess Manager

**Files:**

- Create: `extensions/vwp-dispatch/tool-runner.ts`
- Test: `extensions/vwp-dispatch/tool-runner.test.ts`

**Step 1: Write the failing tests**

Create `extensions/vwp-dispatch/tool-runner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { ToolRunner } = await import("./tool-runner.ts");

describe("ToolRunner", () => {
  let runner: InstanceType<typeof ToolRunner>;

  beforeEach(() => {
    runner = new ToolRunner({ maxConcurrent: 2 });
  });

  afterEach(async () => {
    await runner.cancelAll();
  });

  it("starts a simple python process and captures output", async () => {
    // Run a trivial python command that prints to stdout
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const runId = await runner.start({
      toolName: "test_tool",
      toolLabel: "Test Tool",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: 'print("hello from tool")' },
      envAllowlist: [],
      timeoutSeconds: 10,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });

    expect(runId).toBeTruthy();
    // Wait for completion
    await runner.waitForRun(runId);

    const started = events.find((e) => e.type === "tool_run_started");
    expect(started).toBeDefined();

    const completed = events.find((e) => e.type === "tool_run_completed");
    expect(completed).toBeDefined();
    expect(completed?.exitCode).toBe(0);
  });

  it("respects max concurrent limit", async () => {
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    // Start 2 long-running processes (max is 2)
    await runner.start({
      toolName: "slow1",
      toolLabel: "Slow 1",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: "import time; time.sleep(5)" },
      envAllowlist: [],
      timeoutSeconds: 10,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });
    await runner.start({
      toolName: "slow2",
      toolLabel: "Slow 2",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: "import time; time.sleep(5)" },
      envAllowlist: [],
      timeoutSeconds: 10,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });

    // Third should throw
    await expect(
      runner.start({
        toolName: "slow3",
        toolLabel: "Slow 3",
        toolDir: "/tmp",
        entrypoint: "-c",
        runtime: "python3",
        args: { __raw: "print('hi')" },
        envAllowlist: [],
        timeoutSeconds: 10,
        maxOutputBytes: 1048576,
        onEvent: () => {},
      }),
    ).rejects.toThrow(/concurrent/i);
  });

  it("can cancel a running process", async () => {
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const runId = await runner.start({
      toolName: "cancel_test",
      toolLabel: "Cancel Test",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: "import time; time.sleep(60)" },
      envAllowlist: [],
      timeoutSeconds: 120,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });

    // Cancel it
    const cancelled = await runner.cancel(runId);
    expect(cancelled).toBe(true);

    const cancelledEvent = events.find((e) => e.type === "tool_run_cancelled");
    expect(cancelledEvent).toBeDefined();
  });

  it("returns active runs", async () => {
    await runner.start({
      toolName: "active_test",
      toolLabel: "Active Test",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: "import time; time.sleep(10)" },
      envAllowlist: [],
      timeoutSeconds: 30,
      maxOutputBytes: 1048576,
      onEvent: () => {},
    });

    const active = runner.getActiveRuns();
    expect(active.length).toBe(1);
    expect(active[0].toolName).toBe("active_test");
    expect(active[0].status).toBe("running");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/tool-runner.test.ts
```

Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `extensions/vwp-dispatch/tool-runner.ts`:

```typescript
/**
 * ToolRunner — manages Python/Node subprocess lifecycle for workspace tools.
 *
 * Features:
 * - Max N concurrent tool runs (default 3)
 * - Per-run timeout with SIGTERM → SIGKILL escalation
 * - Output buffering with size cap
 * - Cancellation support
 * - SSE event emission via callback
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { buildSafeEnv } from "./safe-env.js";
import type { ToolRunInfo, ToolRunStatus, ToolSSEEvent } from "./kanban-types.js";

// ---------- Types ----------

export interface ToolRunOptions {
  toolName: string;
  toolLabel: string;
  toolDir: string;
  entrypoint: string;
  runtime: "python3" | "node";
  args: Record<string, string>;
  envAllowlist: string[];
  timeoutSeconds: number;
  maxOutputBytes: number;
  onEvent: (event: ToolSSEEvent) => void;
}

interface ActiveRun {
  info: ToolRunInfo;
  process: ChildProcess;
  timeout: ReturnType<typeof setTimeout>;
  outputSize: number;
  onEvent: (event: ToolSSEEvent) => void;
  resolve: () => void;
}

const SIGKILL_GRACE_MS = 5_000;
const OUTPUT_BATCH_MS = 2_000;
const OUTPUT_BATCH_BYTES = 4_096;

// ---------- Runner ----------

export class ToolRunner {
  private maxConcurrent: number;
  private runs = new Map<string, ActiveRun>();
  private completedRuns: ToolRunInfo[] = [];
  private maxHistory = 50;

  constructor(opts?: { maxConcurrent?: number }) {
    this.maxConcurrent = opts?.maxConcurrent ?? 3;
  }

  async start(options: ToolRunOptions): Promise<string> {
    if (this.runs.size >= this.maxConcurrent) {
      throw new Error(
        `Maximum concurrent tool runs (${this.maxConcurrent}) reached. Cancel a running tool first.`,
      );
    }

    const runId = randomUUID();
    const info: ToolRunInfo = {
      runId,
      toolName: options.toolName,
      toolLabel: options.toolLabel,
      args: options.args,
      status: "running",
      startedAt: Date.now(),
      completedAt: null,
      exitCode: null,
      error: null,
    };

    // Build command
    const cmd = options.runtime === "python3" ? "python3" : "node";
    const cmdArgs = [options.entrypoint];

    // Append args as --key value pairs (skip special __raw key)
    for (const [key, value] of Object.entries(options.args)) {
      if (key === "__raw") {
        // Special: raw arg passed directly (used for inline python -c)
        cmdArgs.push(value);
        continue;
      }
      if (value === "true") {
        cmdArgs.push(`--${key}`);
      } else if (value) {
        cmdArgs.push(`--${key}`, value);
      }
    }

    // Build env with per-tool allowlist
    const safeEnv = buildSafeEnv(process.env as Record<string, string>, options.envAllowlist);

    const child = spawn(cmd, cmdArgs, {
      cwd: options.toolDir,
      env: safeEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    // Emit started event
    options.onEvent({ type: "tool_run_started", run: { ...info } });

    // Output batching
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let outputSize = 0;

    const flushOutput = () => {
      if (stdoutBuffer) {
        options.onEvent({
          type: "tool_run_output",
          runId,
          stream: "stdout",
          chunk: stdoutBuffer,
        });
        stdoutBuffer = "";
      }
      if (stderrBuffer) {
        options.onEvent({
          type: "tool_run_output",
          runId,
          stream: "stderr",
          chunk: stderrBuffer,
        });
        stderrBuffer = "";
      }
    };

    const batchInterval = setInterval(flushOutput, OUTPUT_BATCH_MS);

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      outputSize += data.length;
      if (outputSize <= options.maxOutputBytes) {
        stdoutBuffer += text;
        if (stdoutBuffer.length >= OUTPUT_BATCH_BYTES) {
          flushOutput();
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      outputSize += data.length;
      if (outputSize <= options.maxOutputBytes) {
        stderrBuffer += text;
        if (stderrBuffer.length >= OUTPUT_BATCH_BYTES) {
          flushOutput();
        }
      }
    });

    // Timeout
    const timeout = setTimeout(() => {
      this.killProcess(runId, "timeout");
    }, options.timeoutSeconds * 1000);

    // Promise for waitForRun
    let resolveWait: () => void;
    const waitPromise = new Promise<void>((r) => {
      resolveWait = r;
    });

    const activeRun: ActiveRun = {
      info,
      process: child,
      timeout,
      outputSize: 0,
      onEvent: options.onEvent,
      resolve: resolveWait!,
    };
    this.runs.set(runId, activeRun);

    // Handle exit
    child.on("exit", (code, signal) => {
      clearInterval(batchInterval);
      clearTimeout(timeout);
      flushOutput();

      const run = this.runs.get(runId);
      if (!run) return;

      run.info.completedAt = Date.now();
      run.info.exitCode = code;
      const durationMs = run.info.completedAt - run.info.startedAt;

      if (run.info.status === "cancelled") {
        // Already emitted cancel event
      } else if (code === 0) {
        run.info.status = "completed";
        options.onEvent({
          type: "tool_run_completed",
          runId,
          toolName: options.toolName,
          exitCode: 0,
          durationMs,
        });
      } else {
        run.info.status = "failed";
        const errorMsg = signal
          ? `Process killed by signal ${signal}`
          : `Process exited with code ${code}`;
        run.info.error = errorMsg;
        options.onEvent({
          type: "tool_run_failed",
          runId,
          toolName: options.toolName,
          error: errorMsg,
        });
      }

      this.completedRuns.push({ ...run.info });
      if (this.completedRuns.length > this.maxHistory) {
        this.completedRuns.shift();
      }
      this.runs.delete(runId);
      run.resolve();
    });

    child.on("error", (err) => {
      clearInterval(batchInterval);
      clearTimeout(timeout);

      const run = this.runs.get(runId);
      if (!run) return;

      run.info.completedAt = Date.now();
      run.info.status = "failed";
      run.info.error = err.message;

      options.onEvent({
        type: "tool_run_failed",
        runId,
        toolName: options.toolName,
        error: err.message,
      });

      this.completedRuns.push({ ...run.info });
      if (this.completedRuns.length > this.maxHistory) {
        this.completedRuns.shift();
      }
      this.runs.delete(runId);
      run.resolve();
    });

    return runId;
  }

  async cancel(runId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run) return false;

    run.info.status = "cancelled";
    run.onEvent({
      type: "tool_run_cancelled",
      runId,
      toolName: run.info.toolName,
    });

    this.killProcess(runId, "cancel");
    return true;
  }

  async cancelAll(): Promise<void> {
    for (const runId of [...this.runs.keys()]) {
      await this.cancel(runId);
    }
  }

  async waitForRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    await new Promise<void>((resolve) => {
      const original = run.resolve;
      run.resolve = () => {
        original();
        resolve();
      };
    });
  }

  getActiveRuns(): ToolRunInfo[] {
    return [...this.runs.values()].map((r) => ({ ...r.info }));
  }

  getCompletedRuns(): ToolRunInfo[] {
    return [...this.completedRuns];
  }

  getRun(runId: string): ToolRunInfo | null {
    const active = this.runs.get(runId);
    if (active) return { ...active.info };
    return this.completedRuns.find((r) => r.runId === runId) ?? null;
  }

  private killProcess(runId: string, reason: string): void {
    const run = this.runs.get(runId);
    if (!run || !run.process.pid) return;

    try {
      run.process.kill("SIGTERM");
    } catch {
      // Process may already be dead
    }

    // Escalate to SIGKILL after grace period
    setTimeout(() => {
      try {
        run.process.kill("SIGKILL");
      } catch {
        // Ignore — process already exited
      }
    }, SIGKILL_GRACE_MS);
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/tool-runner.test.ts
```

Expected: All 4 tests PASS (some tests use `python3 -c` — requires Python 3 installed)

**Step 5: Commit**

```bash
git add extensions/vwp-dispatch/tool-runner.ts extensions/vwp-dispatch/tool-runner.test.ts
git commit -m "feat(dispatch): add ToolRunner subprocess manager with concurrency, timeout, cancel"
```

---

## Task 7: Tool HTTP Routes

**Files:**

- Create: `extensions/vwp-dispatch/tool-routes.ts`
- Test: `extensions/vwp-dispatch/tool-routes.test.ts`

**Step 1: Write the failing tests**

Create `extensions/vwp-dispatch/tool-routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

const { createToolHttpHandler } = await import("./tool-routes.ts");

function mockReq(method: string, url: string, body?: string): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  if (body) {
    process.nextTick(() => {
      req.push(body);
      req.push(null);
    });
  } else {
    process.nextTick(() => req.push(null));
  }
  return req;
}

function mockRes(): ServerResponse & { _body: string; _status: number } {
  const socket = new Socket();
  const res = new ServerResponse(new IncomingMessage(socket)) as ServerResponse & {
    _body: string;
    _status: number;
  };
  res._body = "";
  res._status = 200;
  const origEnd = res.end.bind(res);
  res.end = ((chunk?: unknown) => {
    if (chunk) res._body += String(chunk);
    res._status = res.statusCode;
    return origEnd();
  }) as typeof res.end;
  return res;
}

describe("createToolHttpHandler", () => {
  it("returns handler function", () => {
    const handler = createToolHttpHandler({
      toolsRoot: "/tmp/fake-tools",
      gatewayToken: undefined,
      runner: null as any,
    });
    expect(typeof handler).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/tool-routes.test.ts
```

Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `extensions/vwp-dispatch/tool-routes.ts`:

```typescript
/**
 * HTTP routes for workspace tool management.
 *
 * Routes:
 *   GET  /vwp/tools                         — list discovered tools
 *   POST /vwp/tools/:name/run               — start a tool run
 *   GET  /vwp/tools/runs                    — list active + recent runs
 *   GET  /vwp/tools/runs/:runId             — get run details
 *   DELETE /vwp/tools/runs/:runId           — cancel a run
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";
import type { ToolRunner } from "./tool-runner.js";
import type { LoadedTool } from "./tool-manifest.js";

const MAX_BODY_BYTES = 16 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("body_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export type ToolRoutesDeps = {
  toolsRoot: string;
  gatewayToken: string | undefined;
  runner: ToolRunner;
  getTools?: () => LoadedTool[];
};

export function createToolHttpHandler(deps: ToolRoutesDeps) {
  const { gatewayToken, runner } = deps;

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    if (!gatewayToken) return true;
    const bearer = getBearerToken(req);
    if (!bearer || !safeEqualSecret(bearer, gatewayToken)) {
      jsonResponse(res, 401, { error: "unauthorized" });
      return false;
    }
    return true;
  }

  return async function handleToolRoute(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const url = req.url ?? "";
    const method = req.method ?? "GET";

    // --- GET /vwp/tools ---
    if (url === "/vwp/tools" && method === "GET") {
      if (!checkAuth(req, res)) return true;
      const tools = deps.getTools?.() ?? [];
      jsonResponse(res, 200, {
        tools: tools.map((t) => ({
          name: t.manifest.name,
          label: t.manifest.label,
          description: t.manifest.description,
          category: t.manifest.category,
          args_schema: t.manifest.args_schema,
          runtime: t.manifest.runtime,
        })),
      });
      return true;
    }

    // --- POST /vwp/tools/:name/run ---
    const runMatch = url.match(/^\/vwp\/tools\/([^/]+)\/run$/);
    if (runMatch && method === "POST") {
      if (!checkAuth(req, res)) return true;
      const toolName = decodeURIComponent(runMatch[1]);
      const tools = deps.getTools?.() ?? [];
      const tool = tools.find((t) => t.manifest.name === toolName);
      if (!tool) {
        jsonResponse(res, 404, { error: `Tool "${toolName}" not found` });
        return true;
      }

      let body: Record<string, string> = {};
      try {
        const raw = await readBody(req);
        if (raw.trim()) {
          body = JSON.parse(raw);
        }
      } catch {
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      // Validate required args
      for (const [key, schema] of Object.entries(tool.manifest.args_schema)) {
        if (schema.required && !body[key]) {
          jsonResponse(res, 400, { error: `Missing required argument: ${key}` });
          return true;
        }
      }

      try {
        const sseCallback = deps.getTools
          ? (_event: unknown) => {
              // SSE emission is wired in index.ts
            }
          : () => {};

        const runId = await runner.start({
          toolName: tool.manifest.name,
          toolLabel: tool.manifest.label,
          toolDir: tool.toolDir,
          entrypoint: tool.manifest.entrypoint,
          runtime: tool.manifest.runtime,
          args: body,
          envAllowlist: tool.manifest.env_allowlist,
          timeoutSeconds: tool.manifest.timeout_seconds,
          maxOutputBytes: tool.manifest.max_output_bytes,
          onEvent: sseCallback,
        });
        jsonResponse(res, 202, { runId, status: "running" });
      } catch (err) {
        jsonResponse(res, 429, { error: String(err) });
      }
      return true;
    }

    // --- GET /vwp/tools/runs ---
    if (url === "/vwp/tools/runs" && method === "GET") {
      if (!checkAuth(req, res)) return true;
      const active = runner.getActiveRuns();
      const completed = runner.getCompletedRuns();
      jsonResponse(res, 200, { active, completed });
      return true;
    }

    // --- GET /vwp/tools/runs/:runId ---
    const runDetailMatch = url.match(/^\/vwp\/tools\/runs\/([^/]+)$/);
    if (runDetailMatch && method === "GET") {
      if (!checkAuth(req, res)) return true;
      const runId = decodeURIComponent(runDetailMatch[1]);
      const run = runner.getRun(runId);
      if (!run) {
        jsonResponse(res, 404, { error: "Run not found" });
        return true;
      }
      jsonResponse(res, 200, run);
      return true;
    }

    // --- DELETE /vwp/tools/runs/:runId ---
    if (runDetailMatch && method === "DELETE") {
      if (!checkAuth(req, res)) return true;
      const runId = decodeURIComponent(runDetailMatch[1]);
      const cancelled = await runner.cancel(runId);
      if (!cancelled) {
        jsonResponse(res, 404, { error: "Run not found or already completed" });
        return true;
      }
      jsonResponse(res, 200, { cancelled: true });
      return true;
    }

    // Not a tool route
    return false;
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/tool-routes.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add extensions/vwp-dispatch/tool-routes.ts extensions/vwp-dispatch/tool-routes.test.ts
git commit -m "feat(dispatch): add HTTP routes for tool listing, running, and cancellation"
```

---

## Task 8: Wire ToolRunner into Dispatch Plugin

**Files:**

- Modify: `extensions/vwp-dispatch/index.ts`

**Step 1: Add imports at the top of index.ts**

After the existing imports (around line 23), add:

```typescript
import { ToolRunner } from "./tool-runner.js";
import { createToolHttpHandler } from "./tool-routes.js";
import { discoverTools, type LoadedTool } from "./tool-manifest.js";
```

**Step 2: Initialize ToolRunner and tool discovery in the register function**

After line 83 (after `const gateway = new GatewayClient();`), add:

```typescript
// Initialize tool runner and discover workspace tools.
const toolRunner = new ToolRunner({ maxConcurrent: 3 });
let loadedTools: LoadedTool[] = [];
const toolsRoot = join(process.cwd(), "tools");

void (async () => {
  try {
    loadedTools = await discoverTools(toolsRoot);
    api.logger.info(`vwp-dispatch: discovered ${loadedTools.length} workspace tools`);
  } catch (err) {
    api.logger.warn(`vwp-dispatch: tool discovery failed: ${String(err)}`);
  }
})();
```

**Step 3: Register the tool HTTP handler**

After line 154 (after `api.registerHttpHandler(kanbanHandler);`), add:

```typescript
// Register Tool HTTP handler — delegates to tool-routes.ts.
const toolHandler = createToolHttpHandler({
  toolsRoot,
  gatewayToken,
  runner: toolRunner,
  getTools: () => loadedTools,
});
api.registerHttpHandler(toolHandler);
```

**Step 4: Wire SSE event emission for tool runs**

Update the `createToolHttpHandler` call to provide an SSE-aware `onEvent` factory. Actually, we need to update the tool-routes.ts to accept an `onSSE` callback. Let's modify `tool-routes.ts` `ToolRoutesDeps`:

Add `onSSE?: (event: unknown) => void;` to `ToolRoutesDeps`.

Then in the POST handler's `runner.start()` call, use:

```typescript
const runId = await runner.start({
  ...toolConfig,
  onEvent: (event) => {
    deps.onSSE?.(event);
  },
});
```

And in index.ts, pass:

```typescript
const toolHandler = createToolHttpHandler({
  toolsRoot,
  gatewayToken,
  runner: toolRunner,
  getTools: () => loadedTools,
  onSSE: (event) => sse.emit(event as any),
});
```

**Step 5: Add tool runner cleanup to shutdown**

In the shutdown handler (around line 288), add before `api.logger.info("vwp-dispatch: shutting down...");`:

```typescript
await toolRunner.cancelAll();
```

**Step 6: Verify everything compiles and existing tests pass**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/
```

Expected: All existing tests PASS

**Step 7: Commit**

```bash
git add extensions/vwp-dispatch/index.ts extensions/vwp-dispatch/tool-routes.ts
git commit -m "feat(dispatch): wire ToolRunner and tool routes into dispatch plugin"
```

---

## Task 9: Frontend Tool API Client

**Files:**

- Modify: `apps/vwp-board/src/lib/api-client.ts`

**Step 1: Add tool API methods to KanbanApiClient**

At the end of the `KanbanApiClient` class (before the closing `}`), add:

```typescript
  // --- Tool API ---

  async listTools(): Promise<{
    tools: Array<{
      name: string;
      label: string;
      description: string;
      category: string;
      args_schema: Record<string, { type: string; values?: string[]; required?: boolean; label: string }>;
      runtime: string;
    }>;
  }> {
    const url = this._url("/vwp/tools");
    return this._fetch(url);
  }

  async runTool(toolName: string, args: Record<string, string>): Promise<{ runId: string; status: string }> {
    const url = this._url(`/vwp/tools/${encodeURIComponent(toolName)}/run`);
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  }

  async listToolRuns(): Promise<{
    active: Array<import("@/types/kanban").ToolRunInfo>;
    completed: Array<import("@/types/kanban").ToolRunInfo>;
  }> {
    const url = this._url("/vwp/tools/runs");
    return this._fetch(url);
  }

  async getToolRun(runId: string): Promise<import("@/types/kanban").ToolRunInfo> {
    const url = this._url(`/vwp/tools/runs/${encodeURIComponent(runId)}`);
    return this._fetch(url);
  }

  async cancelToolRun(runId: string): Promise<{ cancelled: boolean }> {
    const url = this._url(`/vwp/tools/runs/${encodeURIComponent(runId)}`);
    return this._fetch(url, { method: "DELETE" });
  }
```

**Step 2: Verify build**

```bash
cd /Users/dave/Work/openclaw/apps/vwp-board && npx next build 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add apps/vwp-board/src/lib/api-client.ts
git commit -m "feat(board): add tool API methods to KanbanApiClient"
```

---

## Task 10: Tool Store Slice in Zustand

**Files:**

- Modify: `apps/vwp-board/src/store/board-store.ts`

**Step 1: Add tool state to the BoardStore interface**

After the `agentPanelOpen` / `setAgentPanelOpen` lines in the `BoardStore` interface, add:

```typescript
  // Tool state (Workspace Tools Integration)
  toolRuns: import("@/types/kanban").ToolRunInfo[];
  toolOutputs: Record<string, string>; // runId → accumulated output
  fetchToolRuns: () => Promise<void>;
```

**Step 2: Add initial state in the create() call**

After `agentPanelOpen: false,` add:

```typescript
  toolRuns: [],
  toolOutputs: {},
```

**Step 3: Add fetchToolRuns action**

After `setAgentPanelOpen: (open) => set({ agentPanelOpen: open }),` add:

```typescript
  fetchToolRuns: async () => {
    try {
      const data = await kanbanApi.listToolRuns();
      set({ toolRuns: [...data.active, ...data.completed] });
    } catch {
      // Silently fail — tools may not be available
    }
  },
```

**Step 4: Handle tool SSE events in handleSSEEvent**

In the `handleSSEEvent` switch statement, add cases before the closing `}`:

```typescript
      case "tool_run_started": {
        const run = (event as any).run;
        set((state) => ({
          toolRuns: [...state.toolRuns.filter((r) => r.runId !== run.runId), run],
        }));
        break;
      }
      case "tool_run_output": {
        const { runId, chunk } = event as any;
        set((state) => ({
          toolOutputs: {
            ...state.toolOutputs,
            [runId]: (state.toolOutputs[runId] ?? "") + chunk,
          },
        }));
        break;
      }
      case "tool_run_completed": {
        const { runId, exitCode, durationMs } = event as any;
        set((state) => ({
          toolRuns: state.toolRuns.map((r) =>
            r.runId === runId
              ? { ...r, status: "completed" as const, exitCode, completedAt: Date.now() }
              : r,
          ),
        }));
        break;
      }
      case "tool_run_failed": {
        const { runId, error } = event as any;
        set((state) => ({
          toolRuns: state.toolRuns.map((r) =>
            r.runId === runId
              ? { ...r, status: "failed" as const, error, completedAt: Date.now() }
              : r,
          ),
        }));
        break;
      }
      case "tool_run_cancelled": {
        const { runId } = event as any;
        set((state) => ({
          toolRuns: state.toolRuns.map((r) =>
            r.runId === runId
              ? { ...r, status: "cancelled" as const, completedAt: Date.now() }
              : r,
          ),
        }));
        break;
      }
```

**Step 5: Commit**

```bash
git add apps/vwp-board/src/store/board-store.ts
git commit -m "feat(board): add tool store slice with SSE event handling"
```

---

## Task 11: Tools Page — Tool Grid & Run Dialog

**Files:**

- Create: `apps/vwp-board/src/app/tools/page.tsx`

**Step 1: Create the tools page**

Create `apps/vwp-board/src/app/tools/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useBoardStore } from "@/store/board-store";
import { kanbanApi } from "@/lib/api-client";
import type { ToolRunInfo, ToolRunStatus } from "@/types/kanban";

// ---------- Types ----------

interface ToolDef {
  name: string;
  label: string;
  description: string;
  category: string;
  args_schema: Record<
    string,
    { type: string; values?: string[]; required?: boolean; label: string }
  >;
  runtime: string;
}

// ---------- Status Badge ----------

function StatusBadge({ status }: { status: ToolRunStatus }) {
  const colors: Record<ToolRunStatus, string> = {
    queued: "bg-gray-200 text-gray-700",
    running: "bg-blue-100 text-blue-700 animate-pulse",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? ""}`}
    >
      {status}
    </span>
  );
}

// ---------- Tool Card ----------

function ToolCard({ tool, onRun }: { tool: ToolDef; onRun: (tool: ToolDef) => void }) {
  const categoryColors: Record<string, string> = {
    research: "border-l-blue-500",
    content: "border-l-purple-500",
  };

  return (
    <div
      className={`rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 border-l-4 ${categoryColors[tool.category] ?? "border-l-gray-400"}`}
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{tool.label}</h3>
          <span className="text-xs text-[var(--color-text-muted)]">{tool.category}</span>
        </div>
        <span className="rounded bg-[var(--color-bg-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
          {tool.runtime}
        </span>
      </div>
      <p className="mb-3 text-xs text-[var(--color-text-secondary)] leading-relaxed">
        {tool.description}
      </p>
      <button
        onClick={() => onRun(tool)}
        className="w-full rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
      >
        Run
      </button>
    </div>
  );
}

// ---------- Run Dialog ----------

function RunDialog({
  tool,
  onClose,
  onSubmit,
}: {
  tool: ToolDef;
  onClose: () => void;
  onSubmit: (args: Record<string, string>) => void;
}) {
  const [args, setArgs] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(args);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-[var(--color-text)]">Run {tool.label}</h2>
        <p className="mb-4 text-xs text-[var(--color-text-secondary)]">{tool.description}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {Object.entries(tool.args_schema).map(([key, schema]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
                {schema.label}
                {schema.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {schema.type === "enum" && schema.values ? (
                <select
                  value={args[key] ?? ""}
                  onChange={(e) => setArgs((prev) => ({ ...prev, [key]: e.target.value }))}
                  required={schema.required}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                >
                  <option value="">Select...</option>
                  {schema.values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : schema.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={args[key] === "true"}
                  onChange={(e) =>
                    setArgs((prev) => ({
                      ...prev,
                      [key]: e.target.checked ? "true" : "",
                    }))
                  }
                  className="h-4 w-4"
                />
              ) : (
                <input
                  type="text"
                  value={args[key] ?? ""}
                  onChange={(e) => setArgs((prev) => ({ ...prev, [key]: e.target.value }))}
                  required={schema.required}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                  placeholder={schema.label}
                />
              )}
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Start Run
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Run Output Viewer ----------

function RunOutputViewer({
  run,
  output,
  onCancel,
}: {
  run: ToolRunInfo;
  output: string;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">
            {run.toolLabel ?? run.toolName}
          </h3>
          <StatusBadge status={run.status} />
        </div>
        {run.status === "running" && (
          <button
            onClick={onCancel}
            className="rounded-[var(--radius-sm)] border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Cancel
          </button>
        )}
      </div>
      <div className="text-xs text-[var(--color-text-muted)] mb-2">
        Started {new Date(run.startedAt).toLocaleTimeString()}
        {run.completedAt &&
          ` — finished in ${Math.round((run.completedAt - run.startedAt) / 1000)}s`}
      </div>
      {output && (
        <pre className="max-h-64 overflow-auto rounded bg-[var(--color-bg)] p-3 font-mono text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
          {output}
        </pre>
      )}
      {run.error && (
        <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{run.error}</div>
      )}
    </div>
  );
}

// ---------- Main Page ----------

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<ToolDef | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toolRuns = useBoardStore((s) => s.toolRuns);
  const toolOutputs = useBoardStore((s) => s.toolOutputs);
  const fetchToolRuns = useBoardStore((s) => s.fetchToolRuns);

  useEffect(() => {
    async function load() {
      try {
        const data = await kanbanApi.listTools();
        setTools(data.tools);
        await fetchToolRuns();
      } catch (err) {
        setError("Failed to load tools. Is the dispatch plugin running?");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchToolRuns]);

  const handleRun = useCallback(
    async (args: Record<string, string>) => {
      if (!selectedTool) return;
      try {
        await kanbanApi.runTool(selectedTool.name, args);
        setSelectedTool(null);
        setError(null);
      } catch (err) {
        setError(
          `Failed to start ${selectedTool.label}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [selectedTool],
  );

  const handleCancel = useCallback(async (runId: string) => {
    try {
      await kanbanApi.cancelToolRun(runId);
    } catch {
      // SSE will update the status
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-[var(--color-text-muted)]">Loading tools...</div>
      </div>
    );
  }

  const activeRuns = toolRuns.filter((r) => r.status === "running");
  const recentRuns = toolRuns
    .filter((r) => r.status !== "running")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 10);

  return (
    <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Workspace Tools</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Launch and monitor workspace tools from Mission Control
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Active Runs */}
      {activeRuns.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
            Active Runs ({activeRuns.length})
          </h2>
          <div className="flex flex-col gap-3">
            {activeRuns.map((run) => (
              <RunOutputViewer
                key={run.runId}
                run={run}
                output={toolOutputs[run.runId] ?? ""}
                onCancel={() => handleCancel(run.runId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tool Grid */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
          Available Tools ({tools.length})
        </h2>
        {tools.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-muted)]">
            No tools found. Add tool manifests to the <code>tools/</code> directory.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard key={tool.name} tool={tool} onRun={setSelectedTool} />
            ))}
          </div>
        )}
      </div>

      {/* Recent Runs */}
      {recentRuns.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Recent Runs</h2>
          <div className="flex flex-col gap-2">
            {recentRuns.map((run) => (
              <div
                key={run.runId}
                className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {run.toolLabel ?? run.toolName}
                  </span>
                  <StatusBadge status={run.status} />
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run Dialog */}
      {selectedTool && (
        <RunDialog tool={selectedTool} onClose={() => setSelectedTool(null)} onSubmit={handleRun} />
      )}
    </div>
  );
}
```

**Step 2: Verify it renders**

```bash
cd /Users/dave/Work/openclaw/apps/vwp-board && npx next build 2>&1 | tail -5
```

Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/vwp-board/src/app/tools/page.tsx
git commit -m "feat(board): add /tools page with tool grid, run dialog, and output viewer"
```

---

## Task 12: Add Tools Nav Link to Layout

**Files:**

- Modify: `apps/vwp-board/src/app/layout.tsx:31-54` (Sidebar)
- Modify: `apps/vwp-board/src/app/layout.tsx:56-84` (TabBar)

**Step 1: Add Tools link to Sidebar nav**

In the `Sidebar` function, add a "Tools" link after the "New Goal" link:

```tsx
<a
  href="/tools"
  className="rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
>
  Tools
</a>
```

**Step 2: Add Tools tab to TabBar**

In the `TabBar` function, add a Tools tab after the "New Goal" tab and before `<MobileAgentTab />`:

```tsx
<a
  href="/tools"
  className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]"
>
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M14.5 3.5l2 2-8.5 8.5H6v-2L14.5 3.5z" />
    <path d="M12.5 5.5l2 2" />
    <path d="M3 17h14" />
  </svg>
  Tools
</a>
```

**Step 3: Commit**

```bash
git add apps/vwp-board/src/app/layout.tsx
git commit -m "feat(board): add Tools navigation to sidebar and mobile tab bar"
```

---

## Task 13: Final Integration Test

**Step 1: Verify all backend tests pass**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/ extensions/vwp-approval/
```

Expected: All tests PASS

**Step 2: Verify frontend builds**

```bash
cd /Users/dave/Work/openclaw/apps/vwp-board && npx next build 2>&1 | tail -10
```

Expected: Build succeeds with `/tools` route listed

**Step 3: Verify tool discovery works**

```bash
cd /Users/dave/Work/openclaw && node -e "
  import('./extensions/vwp-dispatch/tool-manifest.ts').then(async m => {
    const tools = await m.discoverTools('./tools');
    console.log('Discovered tools:', tools.map(t => t.manifest.name));
  });
" 2>/dev/null || npx tsx -e "
  const { discoverTools } = require('./extensions/vwp-dispatch/tool-manifest.ts');
  discoverTools('./tools').then(tools => {
    console.log('Discovered tools:', tools.map(t => t.manifest.name));
  });
"
```

Expected: Lists 5 tools: `reddit_scout`, `x_scout`, `trend_scout`, `social_alchemist`, `content_drafter`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(tools): workspace tools integration — complete v1"
```

---

## Task 14: E2E Tool Execution Integration Test

**Goal:** Verify the full pipeline works end-to-end: tool discovery → API listing → tool run → output streaming → completion display. This ensures users can actually run tools and see output directly from Mission Control.

**Files:**

- Create: `extensions/vwp-dispatch/tool-e2e.test.ts`

**Step 1: Write the integration test**

Create `extensions/vwp-dispatch/tool-e2e.test.ts`:

```typescript
/**
 * End-to-end integration test for the workspace tools pipeline.
 *
 * Tests the full flow:
 *   1. discoverTools() finds manifests in tools/
 *   2. ToolRunner starts a Python subprocess
 *   3. SSE events are emitted (started, output, completed)
 *   4. Output is captured and available via getRun()
 *   5. Concurrent run limits are enforced
 *   6. Cancellation works mid-run
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { discoverTools, validateManifest } = await import("./tool-manifest.ts");
const { ToolRunner } = await import("./tool-runner.ts");
const { buildSafeEnv } = await import("./safe-env.ts");

// ---------- Fixtures ----------

const TEST_DIR = join(tmpdir(), `openclaw-tool-e2e-${Date.now()}`);
const SUITE_DIR = join(TEST_DIR, "test-suite");

const HELLO_TOOL_MANIFEST = {
  name: "hello_tool",
  label: "Hello Tool",
  description: "Prints a greeting message — used for E2E testing",
  category: "test",
  entrypoint: "hello.py",
  runtime: "python3",
  args_schema: {
    name: { type: "string", required: true, label: "Name" },
  },
  env_allowlist: [],
  outputs: [],
  timeout_seconds: 30,
  max_output_bytes: 1048576,
};

const HELLO_PY = `#!/usr/bin/env python3
import argparse, sys, time

parser = argparse.ArgumentParser()
parser.add_argument("--name", required=True)
args = parser.parse_args()

print(f"Hello, {args.name}!")
print(f"Tool output line 2: processing...", flush=True)
time.sleep(0.2)
print(f"Tool output line 3: done!", flush=True)
sys.exit(0)
`;

const SLOW_TOOL_MANIFEST = {
  name: "slow_tool",
  label: "Slow Tool",
  description: "Sleeps for a configurable duration — used for cancel testing",
  category: "test",
  entrypoint: "slow.py",
  runtime: "python3",
  args_schema: {
    seconds: { type: "string", required: true, label: "Sleep seconds" },
  },
  env_allowlist: [],
  outputs: [],
  timeout_seconds: 60,
  max_output_bytes: 1048576,
};

const SLOW_PY = `#!/usr/bin/env python3
import argparse, time, sys

parser = argparse.ArgumentParser()
parser.add_argument("--seconds", required=True, type=int)
args = parser.parse_args()

print(f"Starting sleep for {args.seconds}s...", flush=True)
time.sleep(args.seconds)
print("Done sleeping!", flush=True)
sys.exit(0)
`;

const FAIL_TOOL_MANIFEST = {
  name: "fail_tool",
  label: "Fail Tool",
  description: "Always exits with code 1 — used for error handling testing",
  category: "test",
  entrypoint: "fail.py",
  runtime: "python3",
  args_schema: {},
  env_allowlist: [],
  outputs: [],
  timeout_seconds: 10,
  max_output_bytes: 1048576,
};

const FAIL_PY = `#!/usr/bin/env python3
import sys
print("Error: something went wrong!", file=sys.stderr)
sys.exit(1)
`;

// ---------- Setup ----------

beforeAll(() => {
  mkdirSync(SUITE_DIR, { recursive: true });

  writeFileSync(join(SUITE_DIR, "tool-hello.json"), JSON.stringify(HELLO_TOOL_MANIFEST, null, 2));
  writeFileSync(join(SUITE_DIR, "hello.py"), HELLO_PY);

  writeFileSync(join(SUITE_DIR, "tool-slow.json"), JSON.stringify(SLOW_TOOL_MANIFEST, null, 2));
  writeFileSync(join(SUITE_DIR, "slow.py"), SLOW_PY);

  writeFileSync(join(SUITE_DIR, "tool-fail.json"), JSON.stringify(FAIL_TOOL_MANIFEST, null, 2));
  writeFileSync(join(SUITE_DIR, "fail.py"), FAIL_PY);
});

afterAll(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
});

// ---------- Tests ----------

describe("E2E: Tool Discovery", () => {
  it("discovers all tool manifests in a directory", async () => {
    const tools = await discoverTools(TEST_DIR);
    expect(tools.length).toBe(3);
    const names = tools.map((t) => t.manifest.name).sort();
    expect(names).toEqual(["fail_tool", "hello_tool", "slow_tool"]);
  });

  it("each manifest passes validation", async () => {
    const tools = await discoverTools(TEST_DIR);
    for (const tool of tools) {
      const result = validateManifest(tool.manifest as any, tool.toolDir);
      expect(result.valid).toBe(true);
    }
  });
});

describe("E2E: Tool Execution — Success", () => {
  let runner: InstanceType<typeof ToolRunner>;

  afterEach(async () => {
    await runner?.cancelAll();
  });

  it("runs a Python tool and captures full output with SSE events", async () => {
    runner = new ToolRunner({ maxConcurrent: 3 });
    const events: Array<{ type: string; [key: string]: unknown }> = [];

    const runId = await runner.start({
      toolName: "hello_tool",
      toolLabel: "Hello Tool",
      toolDir: SUITE_DIR,
      entrypoint: "hello.py",
      runtime: "python3",
      args: { name: "Mission Control" },
      envAllowlist: [],
      timeoutSeconds: 30,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });

    expect(runId).toBeTruthy();
    await runner.waitForRun(runId);

    // Verify SSE event sequence
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes[0]).toBe("tool_run_started");
    expect(eventTypes[eventTypes.length - 1]).toBe("tool_run_completed");

    // Verify output was captured
    const outputEvents = events.filter((e) => e.type === "tool_run_output");
    const fullOutput = outputEvents.map((e) => e.chunk).join("");
    expect(fullOutput).toContain("Hello, Mission Control!");
    expect(fullOutput).toContain("done!");

    // Verify run record
    const run = runner.getRun(runId);
    expect(run).not.toBeNull();
    expect(run!.status).toBe("completed");
    expect(run!.exitCode).toBe(0);
    expect(run!.completedAt).toBeGreaterThan(run!.startedAt);

    // Verify it appears in completed runs
    const completed = runner.getCompletedRuns();
    expect(completed.some((r) => r.runId === runId)).toBe(true);
  });
});

describe("E2E: Tool Execution — Failure", () => {
  let runner: InstanceType<typeof ToolRunner>;

  afterEach(async () => {
    await runner?.cancelAll();
  });

  it("captures error output and marks run as failed", async () => {
    runner = new ToolRunner({ maxConcurrent: 3 });
    const events: Array<{ type: string; [key: string]: unknown }> = [];

    const runId = await runner.start({
      toolName: "fail_tool",
      toolLabel: "Fail Tool",
      toolDir: SUITE_DIR,
      entrypoint: "fail.py",
      runtime: "python3",
      args: {},
      envAllowlist: [],
      timeoutSeconds: 10,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });

    await runner.waitForRun(runId);

    // Verify failure event
    const failEvent = events.find((e) => e.type === "tool_run_failed");
    expect(failEvent).toBeDefined();
    expect(failEvent!.error).toContain("code 1");

    // Verify stderr captured
    const stderrEvents = events.filter(
      (e) => e.type === "tool_run_output" && e.stream === "stderr",
    );
    const stderrOutput = stderrEvents.map((e) => e.chunk).join("");
    expect(stderrOutput).toContain("something went wrong");

    // Verify run record
    const run = runner.getRun(runId);
    expect(run!.status).toBe("failed");
    expect(run!.exitCode).toBe(1);
  });
});

describe("E2E: Tool Execution — Cancellation", () => {
  let runner: InstanceType<typeof ToolRunner>;

  afterEach(async () => {
    await runner?.cancelAll();
  });

  it("cancels a running tool and emits cancel event", async () => {
    runner = new ToolRunner({ maxConcurrent: 3 });
    const events: Array<{ type: string; [key: string]: unknown }> = [];

    const runId = await runner.start({
      toolName: "slow_tool",
      toolLabel: "Slow Tool",
      toolDir: SUITE_DIR,
      entrypoint: "slow.py",
      runtime: "python3",
      args: { seconds: "30" },
      envAllowlist: [],
      timeoutSeconds: 60,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });

    // Wait a beat for the process to start
    await new Promise((r) => setTimeout(r, 500));

    // Verify it's running
    expect(runner.getActiveRuns().length).toBe(1);

    // Cancel it
    const cancelled = await runner.cancel(runId);
    expect(cancelled).toBe(true);

    // Wait for process to die
    await runner.waitForRun(runId);

    // Verify cancel event
    const cancelEvent = events.find((e) => e.type === "tool_run_cancelled");
    expect(cancelEvent).toBeDefined();

    // Verify run record
    const run = runner.getRun(runId);
    expect(run!.status).toBe("cancelled");
  });
});

describe("E2E: safe-env allowlist", () => {
  it("passes allowlisted env vars to tool subprocess", () => {
    const env = {
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "sk-ant-test",
      BRAVE_API_KEY: "BSA-test",
      REDDIT_SECRET: "secret-val",
      DATABASE_URL: "postgres://should-be-blocked",
    };

    const safe = buildSafeEnv(env, ["ANTHROPIC_API_KEY", "BRAVE_API_KEY"]);

    expect(safe.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(safe.BRAVE_API_KEY).toBe("BSA-test");
    expect(safe.PATH).toBe("/usr/bin");
    // These should still be blocked (not in allowlist)
    expect(safe.REDDIT_SECRET).toBeUndefined();
    expect(safe.DATABASE_URL).toBeUndefined();
  });
});

describe("E2E: Concurrent run limits", () => {
  let runner: InstanceType<typeof ToolRunner>;

  afterEach(async () => {
    await runner?.cancelAll();
  });

  it("enforces max concurrent tool runs", async () => {
    runner = new ToolRunner({ maxConcurrent: 2 });

    // Start 2 slow runs
    await runner.start({
      toolName: "slow1",
      toolLabel: "Slow 1",
      toolDir: SUITE_DIR,
      entrypoint: "slow.py",
      runtime: "python3",
      args: { seconds: "10" },
      envAllowlist: [],
      timeoutSeconds: 30,
      maxOutputBytes: 1048576,
      onEvent: () => {},
    });
    await runner.start({
      toolName: "slow2",
      toolLabel: "Slow 2",
      toolDir: SUITE_DIR,
      entrypoint: "slow.py",
      runtime: "python3",
      args: { seconds: "10" },
      envAllowlist: [],
      timeoutSeconds: 30,
      maxOutputBytes: 1048576,
      onEvent: () => {},
    });

    // Third should be rejected
    await expect(
      runner.start({
        toolName: "slow3",
        toolLabel: "Slow 3",
        toolDir: SUITE_DIR,
        entrypoint: "slow.py",
        runtime: "python3",
        args: { seconds: "10" },
        envAllowlist: [],
        timeoutSeconds: 30,
        maxOutputBytes: 1048576,
        onEvent: () => {},
      }),
    ).rejects.toThrow(/concurrent/i);
  });
});
```

**Step 2: Run the E2E tests**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/tool-e2e.test.ts
```

Expected: All 7 tests PASS — confirms the full tool pipeline works

**Step 3: Commit**

```bash
git add extensions/vwp-dispatch/tool-e2e.test.ts
git commit -m "test(dispatch): add E2E integration tests for workspace tool execution pipeline"
```

---

## Task 15: Live Tool Execution Verification via Browser

**Goal:** After all code is implemented, verify end-to-end that a user can: navigate to /tools, see the tool grid, click Run on a tool, fill in arguments, see live output streaming, and see the completed result — all from Mission Control in the browser.

**Files:**

- Create: `apps/vwp-board/e2e/tools-page.spec.ts`

**Step 1: Write the Playwright E2E test**

Create `apps/vwp-board/e2e/tools-page.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";

test.describe("Tools Page — Mission Control", () => {
  test("T01: Tools page loads and shows available tools", async ({ page }) => {
    await page.goto(`${BASE}/tools`);
    await page.waitForLoadState("networkidle");

    // Page title
    await expect(page.locator("h1")).toContainText("Workspace Tools");

    // Tool grid should be visible
    const toolSection = page.locator("text=Available Tools");
    await expect(toolSection).toBeVisible();

    // Take screenshot for verification
    await page.screenshot({ path: "e2e-tools-grid.png", fullPage: true });
  });

  test("T02: Navigation — Tools link exists in sidebar and tab bar", async ({ page }) => {
    await page.goto(`${BASE}/board`);
    await page.waitForLoadState("networkidle");

    // Desktop sidebar should have Tools link
    const sidebarLink = page.locator('aside a[href="/tools"]');
    await expect(sidebarLink).toBeVisible();

    // Click it
    await sidebarLink.click();
    await page.waitForURL("**/tools");
    await expect(page.locator("h1")).toContainText("Workspace Tools");
  });

  test("T03: Run dialog opens with correct form fields", async ({ page }) => {
    await page.goto(`${BASE}/tools`);
    await page.waitForLoadState("networkidle");

    // Find a tool card with a Run button
    const runButton = page.locator("button", { hasText: "Run" }).first();

    // If tools loaded, click Run
    if (await runButton.isVisible()) {
      await runButton.click();

      // Dialog should appear
      const dialog = page.locator(".fixed.inset-0");
      await expect(dialog).toBeVisible();

      // Should have form fields
      const inputs = dialog.locator("input, select");
      expect(await inputs.count()).toBeGreaterThan(0);

      // Should have Start Run button
      await expect(dialog.locator("button", { hasText: "Start Run" })).toBeVisible();

      // Should have Cancel button
      await expect(dialog.locator("button", { hasText: "Cancel" })).toBeVisible();

      // Close dialog
      await dialog.locator("button", { hasText: "Cancel" }).click();
      await expect(dialog).not.toBeVisible();

      await page.screenshot({ path: "e2e-tools-dialog.png" });
    }
  });

  test("T04: Tool execution shows output in Mission Control", async ({ page }) => {
    await page.goto(`${BASE}/tools`);
    await page.waitForLoadState("networkidle");

    // Find a tool card and click Run
    const runButton = page.locator("button", { hasText: "Run" }).first();
    if (!(await runButton.isVisible())) {
      test.skip(true, "No tools available — dispatch plugin may not be running");
      return;
    }

    await runButton.click();

    // Fill in required fields (use generic test data)
    const dialog = page.locator(".fixed.inset-0");
    const requiredInputs = dialog.locator("input[required], select[required]");
    const inputCount = await requiredInputs.count();

    for (let i = 0; i < inputCount; i++) {
      const input = requiredInputs.nth(i);
      const tagName = await input.evaluate((el) => el.tagName);
      if (tagName === "SELECT") {
        // Select the first non-empty option
        const options = input.locator("option");
        const optCount = await options.count();
        if (optCount > 1) {
          const value = await options.nth(1).getAttribute("value");
          if (value) await input.selectOption(value);
        }
      } else {
        await input.fill("test-query");
      }
    }

    // Start the run
    await dialog.locator("button", { hasText: "Start Run" }).click();

    // Wait for the Active Runs section to appear
    await page.waitForSelector("text=Active Runs", { timeout: 10_000 }).catch(() => {});

    // Wait for either completion or timeout
    await page.waitForTimeout(5_000);

    // Take screenshot of output
    await page.screenshot({ path: "e2e-tools-output.png", fullPage: true });

    // Check for output or status badges
    const outputSection = page.locator("pre");
    const statusBadge = page
      .locator("text=running")
      .or(page.locator("text=completed"))
      .or(page.locator("text=failed"));

    // At least one should be visible (tool started)
    const hasOutput = await outputSection.isVisible().catch(() => false);
    const hasStatus = await statusBadge
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasOutput || hasStatus).toBe(true);
  });

  test("T05: Responsive — tools page works on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE}/tools`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("Workspace Tools");

    // Mobile tab bar should have Tools link
    const mobileToolsLink = page.locator('nav a[href="/tools"]');
    await expect(mobileToolsLink.first()).toBeVisible();

    await page.screenshot({ path: "e2e-tools-mobile.png", fullPage: true });
  });
});
```

**Step 2: Run the E2E tests (requires running servers)**

```bash
cd /Users/dave/Work/openclaw && npx playwright test apps/vwp-board/e2e/tools-page.spec.ts --reporter=list
```

Expected: Tests pass if servers are running (T04 may skip if dispatch plugin not active)

**Step 3: Commit**

```bash
git add apps/vwp-board/e2e/tools-page.spec.ts
git commit -m "test(board): add Playwright E2E tests for tools page execution and display"
```

---

## Summary of All Files

### Created (new files):

1. `tools/content-suite/*.py` — copied workspace Python tools
2. `tools/content-suite/tool-reddit-scout.json` — manifest
3. `tools/content-suite/tool-x-scout.json` — manifest
4. `tools/content-suite/tool-trend-scout.json` — manifest
5. `tools/content-suite/tool-social-alchemist.json` — manifest
6. `tools/content-suite/tool-content-drafter.json` — manifest
7. `tools/content-suite/requirements.txt` — Python dependencies
8. `extensions/vwp-dispatch/tool-manifest.ts` — schema validation & discovery
9. `extensions/vwp-dispatch/tool-manifest.test.ts` — tests
10. `extensions/vwp-dispatch/safe-env.test.ts` — tests
11. `extensions/vwp-dispatch/tool-runner.ts` — subprocess manager
12. `extensions/vwp-dispatch/tool-runner.test.ts` — tests
13. `extensions/vwp-dispatch/tool-routes.ts` — HTTP API
14. `extensions/vwp-dispatch/tool-routes.test.ts` — tests
15. `apps/vwp-board/src/app/tools/page.tsx` — Tools page

### Modified (existing files):

1. `extensions/vwp-dispatch/safe-env.ts` — per-tool allowlist param
2. `extensions/vwp-dispatch/kanban-types.ts` — ToolSSEEvent union
3. `extensions/vwp-approval/sse.ts` — buffer 100→500
4. `extensions/vwp-dispatch/index.ts` — wire ToolRunner + routes
5. `apps/vwp-board/src/types/kanban.ts` — ToolRunInfo type
6. `apps/vwp-board/src/store/board-store.ts` — tool store slice + SSE handlers
7. `apps/vwp-board/src/lib/api-client.ts` — tool API methods
8. `apps/vwp-board/src/app/layout.tsx` — nav links

### Deferred (NOT in this plan):

- `job-auto-apply` (needs BrowserToolRunner for Playwright lifecycle)
- MCP tool UI (notebooklm, shopify — already accessible as MCP servers)
- Conversational bridge (NLP → tool auto-invocation)
- `visual_artist`, `youtube_strategist` (add later with same manifest pattern)
- Tool API key settings page (add in follow-up)
