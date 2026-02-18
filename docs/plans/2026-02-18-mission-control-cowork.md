# Mission Control CoWork: Local Filesystem + MCP Agent

**Date:** 2026-02-18
**Status:** Draft — pending approval
**Goal:** Replicate Claude CoWork's local filesystem coding ability with full access to local MCP servers and skills

---

## Executive Summary

Add a "CoWork" mode to Mission Control where users select a local project folder and chat with a coding agent that can read/write files, run commands, and use local MCP servers — all through the existing browser UI. Electron wrapping is deferred to Phase 3 after the core agent workflow is proven.

**Key architectural insight:** The existing CLI runner (`src/agents/cli-runner.ts:243`) already passes `cwd: workspaceDir` to the subprocess. The Claude Agent SDK V1 (stable) supports `mcpServers` natively. The delta to "local CoWork" is smaller than initially estimated.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Mission Control UI (Next.js)                       │
│  ┌────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Chat Panel  │  │ Project  │  │ MCP Server     │  │
│  │ (existing)  │  │ Selector │  │ Manager Panel  │  │
│  └─────┬──────┘  └────┬─────┘  └───────┬────────┘  │
│        │              │                 │           │
│        └──────────────┼─────────────────┘           │
│                       │ HTTP/SSE                    │
└───────────────────────┼─────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────┐
│  OpenClaw Gateway     │                              │
│  ┌────────────────────┴──────────────────────────┐  │
│  │  vwp-dispatch plugin                          │  │
│  │  ┌──────────────┐  ┌───────────────────────┐  │  │
│  │  │ Project      │  │ CoWork Agent          │  │  │
│  │  │ Registry     │  │ (Agent SDK V1)        │  │  │
│  │  │ /vwp/project │  │                       │  │  │
│  │  └──────────────┘  │  tools: claude_code   │  │  │
│  │                    │  cwd: project.rootPath │  │  │
│  │  ┌──────────────┐  │  mcpServers: {...}    │  │  │
│  │  │ MCP Client   │  │                       │  │  │
│  │  │ Manager      │  └──────────┬────────────┘  │  │
│  │  └──────┬───────┘             │               │  │
│  │         │                     │ SSE events    │  │
│  └─────────┼─────────────────────┼───────────────┘  │
│            │                     │                   │
└────────────┼─────────────────────┼───────────────────┘
             │ stdio                │
     ┌───────┴───────┐      ┌──────┴──────┐
     │ Local MCP     │      │ Filesystem  │
     │ Servers       │      │ (project    │
     │ (skills, etc) │      │  root only) │
     └───────────────┘      └─────────────┘
```

---

## Phase 1: Project Registry + CoWork Agent (Weeks 1-4)

### 1.1 Project Registry Backend

**New file:** `extensions/vwp-dispatch/project-registry.ts`

Add a new HTTP handler following the existing pattern (see `onboarding.ts:52` for reference).

**Routes:**

```
POST /vwp/projects                — register a project folder
GET  /vwp/projects                — list registered projects
GET  /vwp/projects/:id            — get project details
DELETE /vwp/projects/:id          — unregister a project
POST /vwp/projects/:id/validate   — check path still exists + git status
```

**Schema (Zod):**

```typescript
const ProjectSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  rootPath: z.string().min(1),
  mcpServers: z
    .record(
      z.object({
        command: z.string(),
        args: z.array(z.string()).default([]),
        env: z.record(z.string()).default({}),
      }),
    )
    .default({}),
  createdAt: z.number(),
});
```

**Storage:** `~/.openclaw/vwp/projects.json` (via existing `atomicWriteFile`)

**Path validation (CRITICAL):**

```typescript
import { realpath } from "node:fs/promises";

async function validateProjectPath(rootPath: string): Promise<boolean> {
  try {
    const resolved = await realpath(path.resolve(rootPath));
    // Must be an absolute path to an existing directory
    const stat = await fs.stat(resolved);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function isPathWithinRoot(rootPath: string, requestedPath: string): boolean {
  // Resolve symlinks FIRST, then check containment
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(rootPath, requestedPath);
  return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
}
```

**Register in `index.ts`:** Add handler after team routes (line 252), following existing pattern.

### 1.2 CoWork Agent Module

**New file:** `extensions/vwp-dispatch/cowork-agent.ts`

Use the Claude Agent SDK V1 (stable, `@anthropic-ai/claude-agent-sdk`) instead of the unstable V2 or raw CLI backend. The SDK provides:

- Built-in Claude Code tools (`Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`)
- Native MCP server management (stdio transport)
- Budget controls (`maxBudgetUsd`)
- Turn limits (`maxTurns`)
- Permission callbacks (`canUseTool`)

```typescript
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface CoworkSession {
  id: string;
  projectId: string;
  status: "running" | "paused" | "completed" | "failed";
  startedAt: number;
}

export async function startCoworkSession(params: {
  projectId: string;
  rootPath: string;
  prompt: string;
  model?: string;
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  onEvent: (event: CoworkSSEEvent) => void;
  maxBudgetUsd?: number;
  maxTurns?: number;
  permissionMode?: "acceptEdits" | "bypassPermissions";
}): Promise<CoworkSession> {
  const sessionId = randomUUID();

  const q = query({
    prompt: params.prompt,
    options: {
      model: params.model ?? "claude-sonnet-4-6",
      cwd: params.rootPath,

      // Use Claude Code's full tool suite
      tools: { type: "preset", preset: "claude_code" },

      // Load CLAUDE.md from the project
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["project"],

      // Permission control
      permissionMode: params.permissionMode ?? "acceptEdits",

      // Budget and turn limits
      maxBudgetUsd: params.maxBudgetUsd ?? 5.0,
      maxTurns: params.maxTurns ?? 50,

      // Local MCP servers from project config
      mcpServers: Object.fromEntries(
        Object.entries(params.mcpServers ?? {}).map(([name, cfg]) => [
          name,
          { type: "stdio" as const, command: cfg.command, args: cfg.args, env: cfg.env },
        ]),
      ),
    },
  });

  // Stream events to SSE
  void (async () => {
    try {
      for await (const msg of q) {
        switch (msg.type) {
          case "system":
            params.onEvent({ type: "cowork_started", sessionId, projectId: params.projectId });
            break;
          case "assistant":
            for (const block of msg.message.content) {
              if (block.type === "text") {
                params.onEvent({ type: "cowork_text", sessionId, text: block.text });
              }
              if (block.type === "tool_use") {
                params.onEvent({
                  type: "cowork_tool_use",
                  sessionId,
                  tool: block.name,
                  input: JSON.stringify(block.input).slice(0, 500),
                });
              }
            }
            break;
          case "result":
            params.onEvent({
              type: "cowork_completed",
              sessionId,
              result: msg.result ?? "",
              costUsd: msg.total_cost_usd ?? 0,
            });
            break;
        }
      }
    } catch (err) {
      params.onEvent({
        type: "cowork_error",
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  return { id: sessionId, projectId: params.projectId, status: "running", startedAt: Date.now() };
}
```

### 1.3 CoWork HTTP Routes

**New file:** `extensions/vwp-dispatch/cowork-routes.ts`

```
POST /vwp/cowork/start     — start a cowork session on a project
POST /vwp/cowork/send       — send follow-up message to active session
POST /vwp/cowork/cancel     — cancel active session
GET  /vwp/cowork/status     — get session status
GET  /vwp/cowork/sessions   — list recent sessions
```

### 1.4 SSE Events (MUST register in both places)

**Backend** — add to `kanban-types.ts` (after line 108):

```typescript
export type CoworkSSEEvent =
  | { type: "cowork_started"; sessionId: string; projectId: string }
  | { type: "cowork_text"; sessionId: string; text: string }
  | { type: "cowork_tool_use"; sessionId: string; tool: string; input: string }
  | { type: "cowork_tool_result"; sessionId: string; tool: string; output: string }
  | { type: "cowork_completed"; sessionId: string; result: string; costUsd: number }
  | { type: "cowork_error"; sessionId: string; error: string }
  | { type: "cowork_approval_needed"; sessionId: string; tool: string; description: string };
```

Add `| CoworkSSEEvent` to the `KanbanSSEEvent` union.

**Frontend** — add to `sse-client.ts` eventTypes array (after line 114):

```typescript
// CoWork events
"cowork_started",
"cowork_text",
"cowork_tool_use",
"cowork_tool_result",
"cowork_completed",
"cowork_error",
"cowork_approval_needed",
```

### 1.5 Git Safety Net

Before each cowork session, auto-checkpoint:

```typescript
import { execFile } from "node:child_process";

async function gitCheckpoint(rootPath: string, sessionId: string): Promise<string | null> {
  try {
    // Check if it's a git repo
    await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: rootPath });

    // Stash or commit current state
    const { stdout } = await execFileAsync("git", ["stash", "create", `cowork-${sessionId}`], {
      cwd: rootPath,
    });
    const stashRef = stdout.trim();

    if (stashRef) {
      // Save the ref so we can restore later
      await execFileAsync(
        "git",
        ["stash", "store", "-m", `cowork-checkpoint-${sessionId}`, stashRef],
        {
          cwd: rootPath,
        },
      );
    }

    return stashRef || null;
  } catch {
    return null; // Not a git repo or git not available
  }
}
```

### 1.6 Frontend: Project Selection UI

**New component:** `apps/vwp-board/src/components/cowork/ProjectSelector.tsx`

For Phase 1 (no Electron), the user types/pastes the project path:

```
┌─────────────────────────────────────────────┐
│  CoWork Mode                                │
│                                             │
│  Project folder:                            │
│  ┌─────────────────────────────────────┐    │
│  │ /Users/dave/Work/my-project         │    │
│  └─────────────────────────────────────┘    │
│  [Register Project]                         │
│                                             │
│  Recent projects:                           │
│  ● my-project  /Users/dave/Work/my-project  │
│  ● api-server  /Users/dave/Work/api         │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ Refactor the auth module to use JWT │    │
│  └─────────────────────────────────────┘    │
│  [Start CoWork]                             │
└─────────────────────────────────────────────┘
```

**New Zustand store:** `apps/vwp-board/src/store/cowork-store.ts`

- Active session state
- Project list (fetched from `/vwp/projects`)
- Streaming text, tool use events
- Session history

### 1.7 Dependency

```bash
# In the openclaw root (or extensions/vwp-dispatch if it has its own package.json)
pnpm add @anthropic-ai/claude-agent-sdk
```

### Phase 1 Deliverable

Working "CoWork" in the browser: user pastes a folder path, types a coding task, and watches the agent read/write files in that folder via SSE streaming. Git checkpoint before each session. No Electron required.

---

## Phase 2: MCP + UX Hardening (Weeks 5-6)

### 2.1 MCP Server Management

The Agent SDK V1 handles MCP server lifecycle internally when you pass `mcpServers` to `query()`. But users need to configure which MCP servers are available per project.

**UI:** Add an "MCP Servers" section to the project settings panel:

```
┌─────────────────────────────────────────────┐
│  Project: my-project                        │
│  Path: /Users/dave/Work/my-project          │
│                                             │
│  MCP Servers:                               │
│  ┌─────────────────────────────────────┐    │
│  │ ✓ filesystem    npx @mcp/server-fs  │    │
│  │ ✓ openclaw-mcp  node ./mcp-server   │    │
│  │ + Add MCP server...                 │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Available tools: (from connected servers)  │
│  • read_file, write_file, list_dir          │
│  • search_code, run_tests                   │
└─────────────────────────────────────────────┘
```

**Backend route:** `POST /vwp/projects/:id/mcp-servers` — update per-project MCP config. Stored in `projects.json`.

**Auto-discovery:** Read `.mcp.json` from the project root if it exists (matching skill registry pattern from `skill-registry.ts`).

### 2.2 Tiered Permission System

Instead of per-write approval (too slow) or blanket auto-approve (unsafe):

| Level               | Description                           | When                        |
| ------------------- | ------------------------------------- | --------------------------- |
| `ask`               | Agent proposes, user approves via SSE | Default for destructive ops |
| `acceptEdits`       | Allow file read/write, ask for bash   | Recommended for coding      |
| `bypassPermissions` | Allow everything                      | Power user opt-in           |

The Agent SDK V1 supports `permissionMode` directly. Wire it to a UI toggle in the CoWork panel.

### 2.3 Diff Preview + Undo

**Before writes:** The Agent SDK streams `tool_use` events. For `Write` and `Edit` tools, show a diff preview in the UI before the tool executes (when in `ask` mode).

**Undo:** Since Phase 1 creates a git stash checkpoint:

```
POST /vwp/cowork/:sessionId/undo   — git stash pop the checkpoint
```

Show an "Undo all changes" button in the UI after each session completes.

### 2.4 Error Surfacing

When an MCP server crashes or a tool fails, surface it visibly:

```typescript
// In the cowork agent stream handler
case "error":
  params.onEvent({
    type: "cowork_error",
    sessionId,
    error: msg.error ?? "Unknown error",
  });
  break;
```

The frontend should show errors inline in the chat stream (red text, not silent).

### Phase 2 Deliverable

Full-featured browser-based CoWork with MCP server configuration, tiered permissions, diff preview, git-based undo, and visible error handling.

---

## Phase 3: Electron Wrapper (Weeks 7-10)

### 3.1 Electron Setup

**New directory:** `apps/vwp-desktop/`

Use `electron-builder` (not electron-forge) — the Next.js + Electron ecosystem (Nextron, next-electron-rsc) is built around it.

**Approach decision:** Run Next.js as a local server that Electron points to. This avoids the `output: 'export'` limitations and keeps RSC/API routes working.

```
apps/vwp-desktop/
  electron/
    main.ts          — Electron entry, starts gateway + next server
    preload.ts       — IPC bridge (contextIsolation: true)
  package.json       — electron-builder config
  electron-builder.yml
```

### 3.2 Main Process

```typescript
// electron/main.ts
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";

let gatewayProcess: ChildProcess | null = null;
let nextProcess: ChildProcess | null = null;

app.whenReady().then(async () => {
  // Start OpenClaw gateway
  gatewayProcess = spawn("pnpm", ["vwp:start"], { cwd: PROJECT_ROOT });

  // Start Next.js
  nextProcess = spawn("pnpm", ["--filter", "vwp-board", "start"], { cwd: PROJECT_ROOT });

  // Wait for services to be ready
  await waitForPort(19001); // gateway
  await waitForPort(3000); // next

  // Create window pointing to Next.js
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL("http://localhost:3000");
});

// IPC: native folder picker
ipcMain.handle("select-project-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Select Project Folder",
  });
  return result.canceled ? null : result.filePaths[0];
});
```

### 3.3 Preload Script

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  selectProjectFolder: () => ipcRenderer.invoke("select-project-folder"),
  isElectron: true,
});
```

### 3.4 Frontend Detection

```typescript
// In ProjectSelector.tsx
const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

// If Electron: use native dialog
const selectFolder = async () => {
  if (isElectron) {
    return (window as any).electronAPI.selectProjectFolder();
  }
  // Browser fallback: text input (Phase 1 behavior)
  return promptForPath();
};
```

### 3.5 Packaging

```yaml
# electron-builder.yml
appId: com.openclaw.missioncontrol
productName: Mission Control
directories:
  output: dist-electron
mac:
  target: [dmg, zip]
  category: public.app-category.developer-tools
  hardenedRuntime: true
  entitlements: entitlements.mac.plist
win:
  target: [nsis]
asar: false # Required for next-electron-rsc if used later
```

### 3.6 Process Lifecycle

- **Start:** Electron main → spawn gateway → spawn Next.js → open window
- **Crash recovery:** Monitor child processes, restart on exit code !== 0
- **Shutdown:** `app.on("before-quit")` → SIGTERM gateway → SIGTERM Next → wait 5s → SIGKILL
- **Port conflicts:** Check ports 19001/3000 before starting, kill stale processes

### Phase 3 Deliverable

Packaged `.dmg` / `.exe` with native folder picker, auto-managed gateway/Next.js lifecycle, and all Phase 1-2 functionality.

---

## Phase 4: Agent SDK V2 Migration (Post-launch, when V2 stabilizes)

When `unstable_v2_createSession` becomes stable:

- Replace `query()` with `createSession()` + `send()` + `stream()`
- Enable multi-turn conversations within a CoWork session (follow-up without restarting)
- Enable session forking (branch off to try alternative approaches)
- Keep V1 as fallback during transition

---

## Risk Register

| Risk                                         | Impact                      | Mitigation                                     |
| -------------------------------------------- | --------------------------- | ---------------------------------------------- |
| Agent SDK V1 doesn't support multi-turn well | Can't do follow-up messages | Use CLI backend session resume as fallback     |
| MCP server crashes during agent run          | Agent loses tools mid-turn  | SDK handles reconnection; surface error in UI  |
| Path traversal despite validation            | Security breach             | Symlink resolution + real path check + no `..` |
| Electron process management complexity       | Crashes, zombie processes   | Process supervisor with health checks          |
| Next.js + Electron SSR conflicts             | Build/runtime failures      | Run Next.js as localhost server, not embedded  |
| Agent writes destructive changes             | Data loss                   | Git checkpoint before every session            |

---

## File Change Summary

### New files

```
extensions/vwp-dispatch/project-registry.ts     — project CRUD + path validation
extensions/vwp-dispatch/cowork-agent.ts          — Agent SDK V1 wrapper
extensions/vwp-dispatch/cowork-routes.ts         — HTTP routes for cowork
apps/vwp-board/src/components/cowork/ProjectSelector.tsx
apps/vwp-board/src/components/cowork/CoworkPanel.tsx
apps/vwp-board/src/components/cowork/CoworkStream.tsx
apps/vwp-board/src/store/cowork-store.ts
apps/vwp-desktop/                                — Phase 3 only
```

### Modified files

```
extensions/vwp-dispatch/index.ts                 — register project + cowork handlers
extensions/vwp-dispatch/kanban-types.ts           — add CoworkSSEEvent types
apps/vwp-board/src/lib/sse-client.ts             — add cowork event types (~line 114)
apps/vwp-board/src/lib/api-client.ts             — add project + cowork API methods
apps/vwp-board/src/app/layout.tsx                — add CoWork nav item
package.json                                     — add @anthropic-ai/claude-agent-sdk
```

### Dependencies

```
@anthropic-ai/claude-agent-sdk    — Agent SDK V1 (stable)
electron                          — Phase 3 only
electron-builder                  — Phase 3 only
```

---

## Success Criteria

1. User can register a local folder and start a coding session from the browser
2. Agent can read/write files only within the registered project root
3. Agent actions stream in real-time via SSE to the Mission Control UI
4. MCP servers configured per-project are available to the agent
5. Git checkpoint created before each session; undo restores it
6. (Phase 3) Native folder picker via Electron dialog
7. (Phase 3) Single `.dmg` installer that starts all services
