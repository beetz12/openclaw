# Workspace Tools Integration — Completion Plan (Security-Hardened)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete the remaining 2 backend tasks (7 & 8) of the workspace tools integration, with security hardening identified by multi-agent brainstorming review. Then write integration tests.

**Status:** 13/15 original tasks are DONE. Tasks 7 (HTTP routes) and 8 (plugin wiring) remain. Tasks 9-12 (frontend) are complete. Tasks 13-15 (tests) need routes to exist first.

**Brainstorming Review:** APPROVED with amendments — 2 blockers fixed (arg injection, auth bypass), 6 additional hardening items incorporated.

**Key files to reference:**

- Route pattern: `extensions/vwp-dispatch/kanban-routes.ts`
- Plugin entry: `extensions/vwp-dispatch/index.ts`
- ToolRunner: `extensions/vwp-dispatch/tool-runner.ts`
- Tool manifests: `extensions/vwp-dispatch/tool-manifest.ts`
- Safe env: `extensions/vwp-dispatch/safe-env.ts`
- SSE types: `extensions/vwp-dispatch/kanban-types.ts`
- Frontend API client: `apps/vwp-board/src/lib/api-client.ts`
- Frontend store: `apps/vwp-board/src/store/board-store.ts`

---

## Task 1: Tool HTTP Routes (Security-Hardened)

**Files:**

- Create: `extensions/vwp-dispatch/tool-routes.ts`
- Create: `extensions/vwp-dispatch/__tests__/tool-routes.test.ts`

**Context:** This implements the 5 HTTP endpoints the frontend already expects. The original plan (Task 7) had 3 security issues identified by multi-agent brainstorming:

1. `checkAuth` returned "authorized" when `gatewayToken` is undefined (auth bypass)
2. No stripping of `__raw` key from user args (arbitrary code injection)
3. Incomplete arg validation (only checked required, not types/enums/unknown keys)

**Step 1: Write the failing tests**

Create `extensions/vwp-dispatch/__tests__/tool-routes.test.ts`:

Tests must cover:

- `createToolHttpHandler` returns a function
- Non-tool routes return `false` (pass through)
- 401 when no auth token provided AND when `gatewayToken` is undefined (fail-closed)
- GET /vwp/tools returns tool list with manifest fields
- GET /vwp/tools returns empty array + warning when no tools discovered
- POST /vwp/tools/:name/run — 404 for unknown tool
- POST /vwp/tools/:name/run — 400 for missing required args
- POST /vwp/tools/:name/run — 400 for unknown args not in schema
- POST /vwp/tools/:name/run — 400 for invalid enum value
- POST /vwp/tools/:name/run — **strips `__raw` key from args before passing to ToolRunner** (SECURITY)
- POST /vwp/tools/:name/run — 202 on success with runId
- POST /vwp/tools/:name/run — 429 when concurrency limit reached, with `code: "CONCURRENCY_LIMIT"`
- POST /vwp/tools/:name/run — 400 when runtime binary not found (pre-check)
- GET /vwp/tools/runs — returns active + completed
- GET /vwp/tools/runs/:runId — 404 for unknown run
- GET /vwp/tools/runs/:runId — 200 for known run
- DELETE /vwp/tools/runs/:runId — 200 with `{ cancelled: true }`
- DELETE /vwp/tools/runs/:runId — 404 for unknown/completed run
- URL with query string doesn't break route matching (use parsed pathname)

Use the same `mockReq`/`mockRes` test helpers from kanban-routes tests. Mock the ToolRunner with vitest spies.

**Step 2: Run tests, verify they fail (module not found)**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/__tests__/tool-routes.test.ts
```

**Step 3: Implement `tool-routes.ts`**

Create `extensions/vwp-dispatch/tool-routes.ts` following the kanban-routes.ts pattern exactly:

```typescript
/**
 * HTTP routes for workspace tool management.
 *
 * Routes:
 *   GET    /vwp/tools                  — list discovered tools
 *   POST   /vwp/tools/:name/run        — start a tool run
 *   GET    /vwp/tools/runs             — list active + recent runs
 *   GET    /vwp/tools/runs/:runId      — get run details
 *   DELETE /vwp/tools/runs/:runId      — cancel a run
 */
```

**Critical implementation details (from brainstorming review):**

1. **Auth — fail closed:**

   ```typescript
   function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
     const token = getBearerToken(req);
     if (!gatewayToken || !safeEqualSecret(token, gatewayToken)) {
       jsonResponse(res, 401, { error: "Unauthorized" });
       return false;
     }
     return true;
   }
   ```

   Note: `!gatewayToken` returns 401, not true. Match kanban-routes.ts exactly.

2. **URL matching — use parsed pathname:**

   ```typescript
   const url = new URL(req.url ?? "/", "http://localhost");
   const pathname = url.pathname;
   ```

3. **Arg validation — full schema check + strip `__raw`:**

   ```typescript
   function validateArgs(
     body: Record<string, unknown>,
     schema: Record<string, ArgSchema>,
   ): { valid: true; args: Record<string, string> } | { valid: false; error: string } {
     const args: Record<string, string> = {};

     // Check required fields present
     for (const [key, s] of Object.entries(schema)) {
       if (s.required && (body[key] === undefined || body[key] === "")) {
         return { valid: false, error: `Missing required argument: ${key}` };
       }
     }

     // Validate and copy only known keys
     for (const [key, value] of Object.entries(body)) {
       // SECURITY: Strip __raw key — prevents arbitrary code injection
       if (key === "__raw") continue;

       const s = schema[key];
       if (!s) {
         return { valid: false, error: `Unknown argument: ${key}` };
       }

       const strValue = String(value);

       if (s.type === "enum" && s.values && !s.values.includes(strValue)) {
         return {
           valid: false,
           error: `Invalid value for ${key}. Must be one of: ${s.values.join(", ")}`,
         };
       }

       if (s.type === "boolean" && strValue !== "true" && strValue !== "false") {
         return { valid: false, error: `Invalid value for ${key}. Must be true or false` };
       }

       args[key] = strValue;
     }

     return { valid: true, args };
   }
   ```

4. **Runtime pre-check before spawn:**

   ```typescript
   import { execSync } from "node:child_process";

   function isRuntimeAvailable(runtime: "python3" | "node"): boolean {
     try {
       execSync(`which ${runtime}`, { stdio: "ignore" });
       return true;
     } catch {
       return false;
     }
   }
   ```

   Return 400: `{ error: "Runtime 'python3' is not installed or not in PATH", code: "RUNTIME_NOT_FOUND" }`

5. **Structured concurrency error:**
   Return 429: `{ error: "Maximum concurrent tool runs (3) reached. Cancel a running tool first.", code: "CONCURRENCY_LIMIT" }`

6. **ToolRoutesDeps type:**
   ```typescript
   export type ToolRoutesDeps = {
     gatewayToken: string | undefined;
     runner: ToolRunner;
     getTools: () => LoadedTool[];
     onSSE?: (event: ToolSSEEvent) => void;
   };
   ```

**Step 4: Run tests, verify they pass**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/__tests__/tool-routes.test.ts
```

**Step 5: Commit**

```bash
git add extensions/vwp-dispatch/tool-routes.ts extensions/vwp-dispatch/__tests__/tool-routes.test.ts
git commit -m "feat(dispatch): add security-hardened HTTP routes for workspace tools

- Fail-closed auth (401 when no gateway token configured)
- Full arg validation against manifest schema (types, enums, required)
- Strip __raw key from user args to prevent code injection
- Runtime pre-check before subprocess spawn
- Structured error codes (CONCURRENCY_LIMIT, RUNTIME_NOT_FOUND)"
```

---

## Task 2: Wire ToolRunner into Dispatch Plugin

**Files:**

- Modify: `extensions/vwp-dispatch/index.ts`

**Context:** This connects the ToolRunner, tool discovery, and tool routes into the dispatch plugin's `register()` function. The original plan (Task 8) was mostly correct but the SSE callback was a no-op placeholder. This task ensures the real callback is wired.

**Step 1: Add imports**

After existing imports in `index.ts`, add:

```typescript
import { ToolRunner } from "./tool-runner.js";
import { createToolHttpHandler } from "./tool-routes.js";
import { discoverTools, type LoadedTool } from "./tool-manifest.js";
```

**Step 2: Initialize ToolRunner and discover tools**

After `const gateway = new GatewayClient();` (around line 83), add:

```typescript
// Tool runner for workspace tool execution
const toolRunner = new ToolRunner({ maxConcurrent: 3 });
let loadedTools: LoadedTool[] = [];
const toolsRoot = join(process.cwd(), "tools");
```

In the background init IIFE (where registry scan happens), add tool discovery:

```typescript
try {
  loadedTools = await discoverTools(toolsRoot);
  if (loadedTools.length > 0) {
    api.logger.info(`vwp-dispatch: discovered ${loadedTools.length} workspace tools`);
  } else {
    api.logger.warn("vwp-dispatch: no workspace tools found in tools/ directory");
  }
} catch (err) {
  api.logger.warn(`vwp-dispatch: tool discovery failed: ${String(err)}`);
}
```

**Step 3: Register tool HTTP handler with real SSE callback**

After `api.registerHttpHandler(kanbanHandler);`, add:

```typescript
// Tool HTTP routes with real SSE emission
const toolHandler = createToolHttpHandler({
  gatewayToken,
  runner: toolRunner,
  getTools: () => loadedTools,
  onSSE: (event) => sse.emit(event as any),
});
api.registerHttpHandler(toolHandler);
```

**Step 4: Add ToolRunner cleanup to shutdown**

In the ShutdownManager handler (before `api.logger.info("vwp-dispatch: shutting down...")`), add:

```typescript
await toolRunner.cancelAll();
```

**Step 5: Verify compilation and existing tests pass**

```bash
cd /Users/dave/Work/openclaw && npx vitest run extensions/vwp-dispatch/
```

**Step 6: Commit**

```bash
git add extensions/vwp-dispatch/index.ts
git commit -m "feat(dispatch): wire ToolRunner and tool routes into dispatch plugin

- Tool discovery at startup with logging
- Real SSE callback wired (not placeholder)
- ToolRunner cleanup on shutdown"
```

---

## Task 3: Integration Tests

**Files:**

- Create: `extensions/vwp-dispatch/__tests__/tool-integration.test.ts`

**Context:** Test the full flow: tool discovery → route handling → ToolRunner → SSE events. Use a real temp directory with test manifests and a simple Node.js script as the tool.

**Tests:**

1. Full lifecycle: discover tool → POST run → receive SSE events → GET run shows completed
2. Arg validation rejects bad input before spawning
3. Cancel run stops the subprocess
4. GET /vwp/tools returns discovered tools
5. Concurrency limit enforced (start 3, try 4th → 429)
6. Unknown tool → 404
7. Auth required on all endpoints

**Implementation notes:**

- Create a temp `tools/test-suite/tool-echo.json` manifest pointing to a simple `echo.js` script
- `echo.js` just does `console.log(JSON.stringify(process.argv))` and exits 0
- Use `createToolHttpHandler` with a real `ToolRunner` instance
- Collect SSE events via the `onSSE` callback
- Clean up temp directory after tests

**Commit:**

```bash
git add extensions/vwp-dispatch/__tests__/tool-integration.test.ts
git commit -m "test(dispatch): add integration tests for workspace tools lifecycle"
```

---

## Task 4: Frontend UX Hardening — Tools Page

**Files:**

- Modify: `apps/vwp-board/src/app/tools/page.tsx`

**Context:** The User Advocate review identified 7 UX concerns. The tools/page.tsx already has the basic UI (ToolCard, RunDialog, RunOutputViewer). These improvements make error states clear and prevent user confusion.

**Changes to implement:**

1. **FE-1: Loading/disabled state on Run button** (HIGH)
   - Add `isRunning` state to RunDialog component
   - Set `true` on submit, `false` on response/error
   - Disable the Run button and show spinner while `isRunning`
   - Prevents double-click exhausting concurrency limit

2. **FE-2: User-friendly concurrency limit message** (HIGH)
   - Check error response for `code: "CONCURRENCY_LIMIT"`
   - Show: "All tool slots are in use (max 3). Cancel a running tool to free a slot."
   - Style as warning banner, not generic error

3. **FE-3: Translate runtime errors** (HIGH)
   - Check error response for `code: "RUNTIME_NOT_FOUND"`
   - Show: "The required runtime (Python 3 or Node.js) is not installed on the server."
   - For generic spawn errors containing "ENOENT", show similar message

4. **FE-5: Improve empty state messaging** (MEDIUM)
   - When tools array is empty, show helpful message:
     "No workspace tools found. Add tool manifests to the tools/ directory."
   - If API returns a `warning` field, display it

5. **FE-6: Tool timeout display** (MEDIUM)
   - In ToolCard or RunDialog, show the tool's timeout duration
   - Format as "Timeout: 5m" or "Timeout: 30s"
   - During execution, optionally show elapsed time

6. **FE-7: Output truncation marker** (LOW)
   - In RunOutputViewer, if output stops mid-stream and tool is still running,
     check if output size approaches maxOutputBytes
   - When output stops but tool hasn't completed, show "[Output truncated — limit reached]"

**Commit:**

```bash
git add apps/vwp-board/src/app/tools/page.tsx
git commit -m "fix(tools-ui): add loading states, error translation, and UX improvements

- Loading/disabled state on Run button prevents double-click
- User-friendly messages for concurrency limit and missing runtime
- Improved empty state messaging
- Timeout display in tool cards
- Output truncation indicator"
```

---

## Task 5: Frontend Store UX — SSE Staleness for Tool Runs

**Files:**

- Modify: `apps/vwp-board/src/store/board-store.ts`

**Context:** When SSE disconnects, tool runs that were "running" appear stuck with no indication that the status may be stale. The store already tracks `sseConnected` state.

**Changes to implement:**

1. **FE-4: SSE staleness indicator for tool runs** (HIGH)
   - Add `toolRunsStale: boolean` to the store state (default false)
   - When `setSseConnected(false)` is called, also set `toolRunsStale: true`
   - When `setSseConnected(true)` is called, set `toolRunsStale: false` and trigger `fetchToolRuns()` to refresh
   - The tools page should check `toolRunsStale` and show a banner: "Connection lost — tool status may be outdated"

**Commit:**

```bash
git add apps/vwp-board/src/store/board-store.ts
git commit -m "fix(store): add SSE staleness tracking for tool runs

- Track toolRunsStale state
- Auto-refresh tool runs on SSE reconnect
- Frontend can show staleness warning"
```

---

## Brainstorming Decision Log

| #   | Decision                               | Alternatives                          | Objections               | Resolution                                                                 |
| --- | -------------------------------------- | ------------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| D1  | Separate tool-routes.ts                | Inline in kanban-routes.ts            | None                     | Keep — matches project pattern                                             |
| D2  | Pre-loaded LoadedTool[] via getTools() | Re-discover per request               | None                     | Keep — performance                                                         |
| D3  | onEvent → sse.emit() via callback      | Direct SSE coupling                   | CG-W3: no-op placeholder | Fixed: real callback wired in Task 2                                       |
| D4  | Full arg validation in route handler   | Trust client / validate in ToolRunner | CG-B1, S3: injection     | Strengthened: validate types/enums/required, strip \_\_raw, reject unknown |
| D5  | Fail-closed auth                       | Allow unauthenticated when no token   | CG-B2: bypass risk       | 401 when gatewayToken undefined                                            |
| D6  | Runtime pre-check before spawn         | Let spawn fail naturally              | UA-H3: cryptic ENOENT    | Pre-check with clear error + code                                          |
| D7  | Structured error codes                 | Generic error strings                 | UA-H2: opaque errors     | Return `code` field for machine-readable errors                            |
