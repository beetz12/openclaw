# Mission Control Phase 5A Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real-time agent monitoring to the VWP Board — a Gateway client that connects to OpenClaw, an Agent Panel UI, and connection status indicators.

**Architecture:** Backend `GatewayClient` (WebSocket) connects to OpenClaw Gateway on localhost:18789 with challenge-response auth. Agent status flows unidirectionally: Gateway → vwp-dispatch DB (in-memory) → SSE → Frontend Zustand store → UI components. Frontend gets a slide-over Agent Panel (desktop) / bottom sheet (mobile) with agent-task bidirectional linking.

**Tech Stack:** TypeScript, Vitest, WebSocket (Node.js `ws`), SSE (existing ApprovalSSE), Zustand, React 19, Next.js 15, Tailwind CSS 4

---

## Dependency Order

```
Task 1 (types) ──► Task 2 (GatewayClient) ──► Task 4 (wire gateway→SSE)
                                                        │
Task 1 (types) ──► Task 3 (AgentStateManager) ─────────┘
                                                        │
                   Task 5 (SSE heartbeat) ──────────────┤
                                                        ▼
                   Task 6 (ConnectionIndicator) ──► Task 10 (integration)
                   Task 7 (agent store) ──────────► Task 10
                   Task 8 (AgentPanel) ───────────► Task 10
                   Task 9 (agent-task link) ──────► Task 10
```

Tasks 2, 3, 5 can run in parallel after Task 1. Tasks 6, 7, 8, 9 can run in parallel after Task 5. Task 10 is the final integration.

---

## Task 1: Agent Status Types

**Files:**

- Modify: `extensions/vwp-dispatch/kanban-types.ts`
- Modify: `apps/vwp-board/src/types/kanban.ts`
- Modify: `apps/vwp-board/src/store/board-store.ts` (type import only)

### Step 1: Add agent types to backend kanban-types.ts

Add after the existing `KanbanSSEEvent` type at line 37:

```typescript
// --- Agent status types (Phase 5A: Mission Control) ---

export type AgentStatus = "active" | "idle" | "error";

export interface AgentInfo {
  id: string;
  name: string;
  status: AgentStatus;
  taskId: string | null;
  subtaskId: string | null;
  lastAction: string | null;
  lastSeen: number;
  error: string | null;
}

export type AgentSSEEvent =
  | { type: "agent_status_changed"; agent: AgentInfo }
  | { type: "agent_connected"; agent: AgentInfo }
  | { type: "agent_disconnected"; agentId: string }
  | { type: "agent_log"; agentId: string; taskId: string; message: string; timestamp: number }
  | { type: "gateway_status"; connected: boolean };
```

### Step 2: Update the KanbanSSEEvent union to include agent events

In `extensions/vwp-dispatch/kanban-types.ts`, change the `KanbanSSEEvent` type to include agent events:

```typescript
export type KanbanSSEEvent =
  | { type: "task_column_changed"; taskId: string; from: KanbanColumnId; to: KanbanColumnId }
  | { type: "subtask_started"; taskId: string; subtaskId: string; agentName: string }
  | { type: "subtask_completed"; taskId: string; subtaskId: string; result: string }
  | { type: "subtask_failed"; taskId: string; subtaskId: string; error: string }
  | { type: "agent_action"; taskId: string; agentName: string; action: string; detail: string }
  | { type: "cost_update"; taskId: string; currentTokens: number; currentUsd: number }
  | { type: "approval_required"; taskId: string; subtaskId: string; actionType: string }
  | AgentSSEEvent;
```

### Step 3: Mirror agent types in frontend

Add to `apps/vwp-board/src/types/kanban.ts` after line 93 (after `KanbanSubtask`):

```typescript
// --- Agent status types (Phase 5A: Mission Control) ---

export type AgentStatus = "active" | "idle" | "error";

export interface AgentInfo {
  id: string;
  name: string;
  status: AgentStatus;
  taskId: string | null;
  subtaskId: string | null;
  lastAction: string | null;
  lastSeen: number;
  error: string | null;
}
```

### Step 4: Register new SSE event types in sse-client.ts

In `apps/vwp-board/src/lib/sse-client.ts`, add to the `eventTypes` array (line 71-87):

```typescript
const eventTypes = [
  "connected",
  "task_column_changed",
  "subtask_started",
  "subtask_completed",
  "subtask_failed",
  "agent_action",
  "cost_update",
  "approval_required",
  "message_queued",
  "message_approved",
  "message_rejected",
  "message_auto_approved",
  "task_action_queued",
  "task_action_approved",
  "task_action_rejected",
  // Phase 5A: Agent status events
  "agent_status_changed",
  "agent_connected",
  "agent_disconnected",
  "agent_log",
  "gateway_status",
];
```

### Step 5: Commit

```bash
cd /Users/dave/Work/openclaw
git add extensions/vwp-dispatch/kanban-types.ts apps/vwp-board/src/types/kanban.ts apps/vwp-board/src/lib/sse-client.ts
git commit -m "feat(types): add agent status types for Phase 5A mission control"
```

---

## Task 2: GatewayClient (Backend, TDD)

**Files:**

- Create: `extensions/vwp-dispatch/gateway-client.ts`
- Create: `extensions/vwp-dispatch/gateway-client.test.ts`

### Step 1: Write the failing tests

Create `extensions/vwp-dispatch/gateway-client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;

  sent: string[] = [];

  constructor(public url: string) {
    super();
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: 1000, reason: "Normal", wasClean: true });
    }
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  simulateMessage(data: unknown): void {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }

  simulateError(error: unknown): void {
    if (this.onerror) this.onerror(error);
  }

  simulateClose(code = 1006, reason = "Abnormal"): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code, reason, wasClean: false });
  }
}

let lastCreatedSocket: MockWebSocket | null = null;

vi.stubGlobal(
  "WebSocket",
  class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      lastCreatedSocket = this;
    }
  },
);

const { GatewayClient } = await import("./gateway-client.ts");

describe("GatewayClient", () => {
  let client: InstanceType<typeof GatewayClient>;

  beforeEach(() => {
    vi.useFakeTimers();
    lastCreatedSocket = null;
    client = new GatewayClient("ws://127.0.0.1:18789", "test-token");
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  describe("connect()", () => {
    it("creates WebSocket with token in URL", () => {
      const promise = client.connect();
      expect(lastCreatedSocket).not.toBeNull();
      expect(lastCreatedSocket!.url).toContain("token=test-token");
      // Clean up by simulating auth flow
      lastCreatedSocket!.simulateOpen();
      lastCreatedSocket!.simulateMessage({
        type: "event",
        event: "connect.challenge",
        params: {},
      });
      // Parse the sent connect request and resolve
      const sent = JSON.parse(lastCreatedSocket!.sent[0]);
      lastCreatedSocket!.simulateMessage({
        type: "res",
        id: sent.id,
        ok: true,
        payload: {},
      });
      return promise;
    });

    it("responds to challenge with connect request", async () => {
      const promise = client.connect();
      lastCreatedSocket!.simulateOpen();
      lastCreatedSocket!.simulateMessage({
        type: "event",
        event: "connect.challenge",
        params: {},
      });

      expect(lastCreatedSocket!.sent.length).toBe(1);
      const sent = JSON.parse(lastCreatedSocket!.sent[0]);
      expect(sent.type).toBe("req");
      expect(sent.method).toBe("connect");
      expect(sent.params.auth.token).toBe("test-token");
      expect(sent.params.client.id).toBe("vwp-dispatch");

      // Complete auth
      lastCreatedSocket!.simulateMessage({
        type: "res",
        id: sent.id,
        ok: true,
        payload: {},
      });
      await promise;
    });

    it("resolves after successful authentication", async () => {
      const promise = client.connect();
      lastCreatedSocket!.simulateOpen();
      lastCreatedSocket!.simulateMessage({
        type: "event",
        event: "connect.challenge",
      });
      const sent = JSON.parse(lastCreatedSocket!.sent[0]);
      lastCreatedSocket!.simulateMessage({
        type: "res",
        id: sent.id,
        ok: true,
        payload: {},
      });
      await promise;
      expect(client.isConnected()).toBe(true);
    });

    it("rejects on connection timeout", async () => {
      const promise = client.connect();
      vi.advanceTimersByTime(10_001);
      await expect(promise).rejects.toThrow("Connection timeout");
    });

    it("rejects on auth failure", async () => {
      const promise = client.connect();
      lastCreatedSocket!.simulateOpen();
      lastCreatedSocket!.simulateMessage({
        type: "event",
        event: "connect.challenge",
      });
      const sent = JSON.parse(lastCreatedSocket!.sent[0]);
      lastCreatedSocket!.simulateMessage({
        type: "res",
        id: sent.id,
        ok: false,
        error: { message: "Invalid token" },
      });
      await expect(promise).rejects.toThrow("Authentication failed");
    });

    it("prevents simultaneous connection attempts", async () => {
      const p1 = client.connect();
      const p2 = client.connect();
      expect(p1).toBe(p2); // Same promise

      // Complete the connection
      lastCreatedSocket!.simulateOpen();
      lastCreatedSocket!.simulateMessage({ type: "event", event: "connect.challenge" });
      const sent = JSON.parse(lastCreatedSocket!.sent[0]);
      lastCreatedSocket!.simulateMessage({ type: "res", id: sent.id, ok: true, payload: {} });
      await p1;
    });
  });

  describe("call()", () => {
    async function connectClient() {
      const p = client.connect();
      lastCreatedSocket!.simulateOpen();
      lastCreatedSocket!.simulateMessage({ type: "event", event: "connect.challenge" });
      const sent = JSON.parse(lastCreatedSocket!.sent[0]);
      lastCreatedSocket!.simulateMessage({ type: "res", id: sent.id, ok: true, payload: {} });
      await p;
    }

    it("sends RPC request and returns response", async () => {
      await connectClient();
      const promise = client.call("sessions.list", {});
      const sent = JSON.parse(lastCreatedSocket!.sent[1]);
      expect(sent.method).toBe("sessions.list");

      lastCreatedSocket!.simulateMessage({
        type: "res",
        id: sent.id,
        ok: true,
        payload: [{ id: "s1" }],
      });
      const result = await promise;
      expect(result).toEqual([{ id: "s1" }]);
    });

    it("rejects on RPC error", async () => {
      await connectClient();
      const promise = client.call("bad.method");
      const sent = JSON.parse(lastCreatedSocket!.sent[1]);
      lastCreatedSocket!.simulateMessage({
        type: "res",
        id: sent.id,
        ok: false,
        error: { message: "Not found" },
      });
      await expect(promise).rejects.toThrow("Not found");
    });

    it("rejects on timeout", async () => {
      await connectClient();
      const promise = client.call("slow.method");
      vi.advanceTimersByTime(30_001);
      await expect(promise).rejects.toThrow("Request timeout");
    });

    it("throws when not connected", async () => {
      await expect(client.call("test")).rejects.toThrow("Not connected");
    });
  });

  describe("reconnection", () => {
    async function connectClient() {
      const p = client.connect();
      lastCreatedSocket!.simulateOpen();
      lastCreatedSocket!.simulateMessage({ type: "event", event: "connect.challenge" });
      const sent = JSON.parse(lastCreatedSocket!.sent[0]);
      lastCreatedSocket!.simulateMessage({ type: "res", id: sent.id, ok: true, payload: {} });
      await p;
    }

    it("auto-reconnects on unexpected disconnect", async () => {
      await connectClient();
      const disconnectHandler = vi.fn();
      client.on("disconnected", disconnectHandler);

      lastCreatedSocket!.simulateClose(1006, "Abnormal");
      expect(disconnectHandler).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);

      // Advance past reconnect delay (10s)
      vi.advanceTimersByTime(10_001);
      // A new socket should be created
      expect(lastCreatedSocket).not.toBeNull();
    });

    it("does not reconnect after intentional disconnect", async () => {
      await connectClient();
      const prevSocket = lastCreatedSocket;
      client.disconnect();
      vi.advanceTimersByTime(15_000);
      // No new socket created after disconnect
      expect(lastCreatedSocket).toBe(prevSocket);
    });
  });

  describe("events", () => {
    async function connectClient() {
      const p = client.connect();
      lastCreatedSocket!.simulateOpen();
      lastCreatedSocket!.simulateMessage({ type: "event", event: "connect.challenge" });
      const sent = JSON.parse(lastCreatedSocket!.sent[0]);
      lastCreatedSocket!.simulateMessage({ type: "res", id: sent.id, ok: true, payload: {} });
      await p;
    }

    it("emits gateway events", async () => {
      await connectClient();
      const handler = vi.fn();
      client.on("session.message", handler);

      lastCreatedSocket!.simulateMessage({
        type: "event",
        event: "session.message",
        params: { sessionId: "s1", content: "hello" },
      });

      expect(handler).toHaveBeenCalledWith({ sessionId: "s1", content: "hello" });
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/dave/Work/openclaw
npx vitest run extensions/vwp-dispatch/gateway-client.test.ts
```

Expected: FAIL with "Cannot find module './gateway-client.ts'"

### Step 3: Write minimal implementation

Create `extensions/vwp-dispatch/gateway-client.ts`:

```typescript
import { EventEmitter } from "node:events";

const CONNECTION_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = 10_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private _connected = false;
  private _authenticated = false;
  private connecting: Promise<void> | null = null;
  private autoReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(
    private url: string = process.env.OPENCLAW_GATEWAY_URL ?? "ws://127.0.0.1:18789",
    private token: string = process.env.OPENCLAW_GATEWAY_TOKEN ?? "",
  ) {
    super();
    // Prevent unhandled error crashes
    this.on("error", () => {});
  }

  isConnected(): boolean {
    return this._connected && this._authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      // Clean up existing connection
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.onopen = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
        this.ws = null;
      }

      const wsUrl = new URL(this.url);
      if (this.token) wsUrl.searchParams.set("token", this.token);

      this.ws = new WebSocket(wsUrl.toString());

      const connectionTimeout = setTimeout(() => {
        if (!this._connected) {
          this.ws?.close();
          this.connecting = null;
          reject(new Error("Connection timeout"));
        }
      }, CONNECTION_TIMEOUT_MS);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        // Wait for challenge — don't send anything yet
      };

      this.ws.onclose = (event: { code: number; reason: string; wasClean: boolean }) => {
        clearTimeout(connectionTimeout);
        const wasConnected = this._connected;
        this._connected = false;
        this._authenticated = false;
        this.connecting = null;
        this.emit("disconnected");

        if (this.autoReconnect && wasConnected) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        clearTimeout(connectionTimeout);
        this.emit("error", new Error("WebSocket error"));
        if (!this._connected) {
          this.connecting = null;
          reject(new Error("Failed to connect to OpenClaw Gateway"));
        }
      };

      this.ws.onmessage = (event: { data: string }) => {
        try {
          const data = JSON.parse(event.data);

          // Handle challenge-response authentication
          if (data.type === "event" && data.event === "connect.challenge") {
            const requestId = crypto.randomUUID();
            const response = {
              type: "req",
              id: requestId,
              method: "connect",
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: { id: "vwp-dispatch", version: "1.0.0", platform: "node", mode: "agent" },
                auth: { token: this.token },
              },
            };

            this.pendingRequests.set(requestId, {
              resolve: () => {
                this._connected = true;
                this._authenticated = true;
                this.connecting = null;
                this.emit("connected");
                resolve();
              },
              reject: (error: Error) => {
                this.connecting = null;
                this.ws?.close();
                reject(new Error(`Authentication failed: ${error.message}`));
              },
              timer: setTimeout(() => {
                this.pendingRequests.delete(requestId);
                this.connecting = null;
                reject(new Error("Authentication timeout"));
              }, REQUEST_TIMEOUT_MS),
            });

            this.ws!.send(JSON.stringify(response));
            return;
          }

          this.handleMessage(data);
        } catch {
          // Ignore parse errors
        }
      };
    });

    return this.connecting;
  }

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.isConnected()) {
      throw new Error("Not connected to OpenClaw Gateway");
    }

    const id = crypto.randomUUID();
    const message = { type: "req", id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.ws!.send(JSON.stringify(message));
    });
  }

  disconnect(): void {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Clear all pending requests
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      this.pendingRequests.delete(id);
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this._authenticated = false;
    this.connecting = null;
  }

  private handleMessage(data: {
    type?: string;
    id?: string;
    ok?: boolean;
    payload?: unknown;
    error?: { message: string };
    event?: string;
    params?: unknown;
    method?: string;
  }): void {
    // Handle RPC responses
    if (data.type === "res" && data.id) {
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(data.id);
        if (data.ok === false && data.error) {
          pending.reject(new Error(data.error.message));
        } else {
          pending.resolve(data.payload);
        }
        return;
      }
    }

    // Handle events
    if (data.type === "event" && data.event) {
      this.emit(data.event, data.params);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.autoReconnect) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.autoReconnect) return;
      try {
        await this.connect();
      } catch {
        this.scheduleReconnect();
      }
    }, RECONNECT_DELAY_MS);
  }
}
```

### Step 4: Run test to verify it passes

```bash
cd /Users/dave/Work/openclaw
npx vitest run extensions/vwp-dispatch/gateway-client.test.ts
```

Expected: All tests PASS

### Step 5: Commit

```bash
cd /Users/dave/Work/openclaw
git add extensions/vwp-dispatch/gateway-client.ts extensions/vwp-dispatch/gateway-client.test.ts
git commit -m "feat(gateway): add GatewayClient with challenge-response auth and reconnection"
```

---

## Task 3: Agent State Manager (Backend, TDD)

**Files:**

- Create: `extensions/vwp-dispatch/agent-state.ts`
- Create: `extensions/vwp-dispatch/agent-state.test.ts`

### Step 1: Write the failing tests

Create `extensions/vwp-dispatch/agent-state.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentStateManager } from "./agent-state.ts";
import type { AgentInfo } from "./kanban-types.ts";

describe("AgentStateManager", () => {
  let manager: AgentStateManager;

  beforeEach(() => {
    manager = new AgentStateManager();
  });

  describe("upsertAgent()", () => {
    it("adds a new agent", () => {
      manager.upsertAgent({ id: "a1", name: "Lead", status: "active", taskId: "t1" });
      const agents = manager.getAll();
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe("a1");
      expect(agents[0].name).toBe("Lead");
      expect(agents[0].status).toBe("active");
      expect(agents[0].taskId).toBe("t1");
    });

    it("updates existing agent by id", () => {
      manager.upsertAgent({ id: "a1", name: "Lead", status: "active", taskId: "t1" });
      manager.upsertAgent({ id: "a1", status: "idle" });
      const agents = manager.getAll();
      expect(agents).toHaveLength(1);
      expect(agents[0].status).toBe("idle");
      expect(agents[0].name).toBe("Lead"); // Preserved
    });

    it("returns the full AgentInfo after upsert", () => {
      const result = manager.upsertAgent({
        id: "a1",
        name: "Lead",
        status: "active",
        taskId: "t1",
      });
      expect(result.id).toBe("a1");
      expect(result.lastSeen).toBeGreaterThan(0);
    });
  });

  describe("getByTaskId()", () => {
    it("returns agents for a specific task", () => {
      manager.upsertAgent({ id: "a1", name: "Lead", status: "active", taskId: "t1" });
      manager.upsertAgent({ id: "a2", name: "Spec", status: "active", taskId: "t1" });
      manager.upsertAgent({ id: "a3", name: "Other", status: "active", taskId: "t2" });
      expect(manager.getByTaskId("t1")).toHaveLength(2);
      expect(manager.getByTaskId("t2")).toHaveLength(1);
    });
  });

  describe("removeAgent()", () => {
    it("removes an agent by id", () => {
      manager.upsertAgent({ id: "a1", name: "Lead", status: "active", taskId: "t1" });
      manager.removeAgent("a1");
      expect(manager.getAll()).toHaveLength(0);
    });

    it("returns the removed agent", () => {
      manager.upsertAgent({ id: "a1", name: "Lead", status: "active", taskId: "t1" });
      const removed = manager.removeAgent("a1");
      expect(removed?.id).toBe("a1");
    });

    it("returns null for nonexistent agent", () => {
      expect(manager.removeAgent("nope")).toBeNull();
    });
  });

  describe("clearForTask()", () => {
    it("removes all agents for a task", () => {
      manager.upsertAgent({ id: "a1", name: "Lead", status: "active", taskId: "t1" });
      manager.upsertAgent({ id: "a2", name: "Spec", status: "active", taskId: "t1" });
      manager.upsertAgent({ id: "a3", name: "Other", status: "active", taskId: "t2" });
      manager.clearForTask("t1");
      expect(manager.getAll()).toHaveLength(1);
      expect(manager.getAll()[0].id).toBe("a3");
    });
  });

  describe("addLog()", () => {
    it("stores log entries for an agent", () => {
      manager.upsertAgent({ id: "a1", name: "Lead", status: "active", taskId: "t1" });
      manager.addLog("a1", "Starting analysis");
      manager.addLog("a1", "Found 3 files");
      const logs = manager.getLogs("a1");
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe("Starting analysis");
    });

    it("caps log entries at 100 per agent", () => {
      manager.upsertAgent({ id: "a1", name: "Lead", status: "active", taskId: "t1" });
      for (let i = 0; i < 110; i++) {
        manager.addLog("a1", `Log ${i}`);
      }
      expect(manager.getLogs("a1")).toHaveLength(100);
      expect(manager.getLogs("a1")[0].message).toBe("Log 10"); // Oldest dropped
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /Users/dave/Work/openclaw
npx vitest run extensions/vwp-dispatch/agent-state.test.ts
```

Expected: FAIL with "Cannot find module"

### Step 3: Write minimal implementation

Create `extensions/vwp-dispatch/agent-state.ts`:

```typescript
import type { AgentInfo } from "./kanban-types.js";

const MAX_LOGS_PER_AGENT = 100;

export interface AgentLogEntry {
  message: string;
  timestamp: number;
}

type AgentUpsert = { id: string } & Partial<Omit<AgentInfo, "id" | "lastSeen">>;

export class AgentStateManager {
  private agents = new Map<string, AgentInfo>();
  private logs = new Map<string, AgentLogEntry[]>();

  upsertAgent(partial: AgentUpsert): AgentInfo {
    const existing = this.agents.get(partial.id);
    const agent: AgentInfo = {
      id: partial.id,
      name: partial.name ?? existing?.name ?? "unknown",
      status: partial.status ?? existing?.status ?? "idle",
      taskId: partial.taskId !== undefined ? partial.taskId : (existing?.taskId ?? null),
      subtaskId:
        partial.subtaskId !== undefined ? partial.subtaskId : (existing?.subtaskId ?? null),
      lastAction:
        partial.lastAction !== undefined ? partial.lastAction : (existing?.lastAction ?? null),
      lastSeen: Date.now(),
      error: partial.error !== undefined ? partial.error : (existing?.error ?? null),
    };
    this.agents.set(agent.id, agent);
    return agent;
  }

  getAll(): AgentInfo[] {
    return [...this.agents.values()];
  }

  get(id: string): AgentInfo | undefined {
    return this.agents.get(id);
  }

  getByTaskId(taskId: string): AgentInfo[] {
    return this.getAll().filter((a) => a.taskId === taskId);
  }

  removeAgent(id: string): AgentInfo | null {
    const agent = this.agents.get(id);
    if (!agent) return null;
    this.agents.delete(id);
    this.logs.delete(id);
    return agent;
  }

  clearForTask(taskId: string): void {
    for (const [id, agent] of this.agents) {
      if (agent.taskId === taskId) {
        this.agents.delete(id);
        this.logs.delete(id);
      }
    }
  }

  addLog(agentId: string, message: string): void {
    let entries = this.logs.get(agentId);
    if (!entries) {
      entries = [];
      this.logs.set(agentId, entries);
    }
    entries.push({ message, timestamp: Date.now() });
    if (entries.length > MAX_LOGS_PER_AGENT) {
      entries.splice(0, entries.length - MAX_LOGS_PER_AGENT);
    }
  }

  getLogs(agentId: string): AgentLogEntry[] {
    return this.logs.get(agentId) ?? [];
  }
}
```

### Step 4: Run test to verify it passes

```bash
cd /Users/dave/Work/openclaw
npx vitest run extensions/vwp-dispatch/agent-state.test.ts
```

Expected: All tests PASS

### Step 5: Commit

```bash
cd /Users/dave/Work/openclaw
git add extensions/vwp-dispatch/agent-state.ts extensions/vwp-dispatch/agent-state.test.ts
git commit -m "feat(agents): add AgentStateManager for tracking agent status in memory"
```

---

## Task 4: Wire Gateway → Agent State → SSE (Backend)

**Files:**

- Modify: `extensions/vwp-dispatch/index.ts`
- Modify: `extensions/vwp-dispatch/team-launcher.ts` (add agent tracking)

### Step 1: Add GatewayClient + AgentStateManager to plugin index.ts

In `extensions/vwp-dispatch/index.ts`, add imports after line 20:

```typescript
import { GatewayClient } from "./gateway-client.js";
import { AgentStateManager } from "./agent-state.js";
```

### Step 2: Initialize in the register() function

After the `const sse = new ApprovalSSE();` line (line 79), add:

```typescript
const agentState = new AgentStateManager();
const gateway = new GatewayClient();

// Connect to gateway in background (non-blocking)
void (async () => {
  try {
    await gateway.connect();
    api.logger.info("vwp-dispatch: connected to OpenClaw Gateway");
    sse.emit({ type: "gateway_status", connected: true });
  } catch (err) {
    api.logger.warn(`vwp-dispatch: gateway connection failed: ${String(err)}`);
    sse.emit({ type: "gateway_status", connected: false });
  }
})();

// Forward gateway events to agent state + SSE
gateway.on("connected", () => {
  sse.emit({ type: "gateway_status", connected: true });
});
gateway.on("disconnected", () => {
  sse.emit({ type: "gateway_status", connected: false });
});
```

### Step 3: Add agent status HTTP endpoint

In `extensions/vwp-dispatch/kanban-routes.ts`, add a GET endpoint for agent status. Find the existing route handler and add:

```typescript
// GET /vwp/dispatch/agents — list all tracked agents
if (req.method === "GET" && pathname === "/vwp/dispatch/agents") {
  const agents = agentState.getAll();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(agents));
  return;
}

// GET /vwp/dispatch/agents/:agentId/logs — get agent logs
const agentLogsMatch = pathname.match(/^\/vwp\/dispatch\/agents\/([^/]+)\/logs$/);
if (req.method === "GET" && agentLogsMatch) {
  const logs = agentState.getLogs(agentLogsMatch[1]);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(logs));
  return;
}
```

**Note:** The `agentState` instance needs to be passed to the kanban route handler. Update `createKanbanHttpHandler` to accept `{ gatewayToken, agentState }` and pass the instance from index.ts.

### Step 4: Update team-launcher to track agent status

In the `launchTeam` function, after specialists are spawned, emit agent events through the SSE:

When a specialist starts:

```typescript
sse.emit({
  type: "agent_connected",
  agent: agentState.upsertAgent({
    id: `${taskId}-${spec.role}`,
    name: spec.role,
    status: "active",
    taskId,
  }),
});
```

When a specialist completes:

```typescript
const agent = agentState.upsertAgent({
  id: `${taskId}-${spec.role}`,
  status: "idle",
  lastAction: "completed",
});
sse.emit({ type: "agent_status_changed", agent });
```

When a specialist fails:

```typescript
const agent = agentState.upsertAgent({
  id: `${taskId}-${spec.role}`,
  status: "error",
  error: errorMessage,
});
sse.emit({ type: "agent_status_changed", agent });
```

### Step 5: Add gateway disconnect to shutdown

In the shutdown handler (line 256), add:

```typescript
shutdown.onShutdown(async () => {
  api.logger.info("vwp-dispatch: shutting down...");
  gateway.disconnect();
  health.dispose();
  await queue.persist();
  registry.stopWatching();
});
```

### Step 6: Commit

```bash
cd /Users/dave/Work/openclaw
git add extensions/vwp-dispatch/index.ts extensions/vwp-dispatch/kanban-routes.ts extensions/vwp-dispatch/team-launcher.ts
git commit -m "feat(gateway): wire GatewayClient into plugin with agent state tracking"
```

---

## Task 5: SSE Heartbeat Detection (Frontend, TDD)

**Files:**

- Modify: `apps/vwp-board/src/lib/sse-client.ts`
- Modify: `apps/vwp-board/src/store/board-store.ts`

### Step 1: Add heartbeat tracking to BoardSSEClient

In `apps/vwp-board/src/lib/sse-client.ts`, add heartbeat detection. After line 16 (`private _intentionalClose = false;`), add:

```typescript
  private _lastHeartbeat = 0;
  private _heartbeatChecker: ReturnType<typeof setInterval> | null = null;
  private _staleCallbacks = new Set<(stale: boolean) => void>();

  get stale(): boolean {
    if (!this.connected) return false;
    return this._lastHeartbeat > 0 && Date.now() - this._lastHeartbeat > 45_000;
  }

  onStaleChange(callback: (stale: boolean) => void): () => void {
    this._staleCallbacks.add(callback);
    return () => this._staleCallbacks.delete(callback);
  }
```

### Step 2: Start heartbeat checker on connect

In the `connect()` method, after setting `source.onopen` (line 52-54), modify to also track heartbeat:

```typescript
source.onopen = () => {
  this._retryMs = INITIAL_RETRY_MS;
  this._lastHeartbeat = Date.now();
  this._startHeartbeatChecker();
};
```

### Step 3: Track heartbeat in message handler

In the `_dispatch` method, add at the top (before JSON parse):

```typescript
  private _dispatch(ev: MessageEvent): void {
    // Track any message as heartbeat activity
    this._lastHeartbeat = Date.now();
    this._notifyStale(false);
```

### Step 4: Add heartbeat checker and cleanup methods

Add before the `_scheduleReconnect` method:

```typescript
  private _startHeartbeatChecker(): void {
    this._stopHeartbeatChecker();
    this._heartbeatChecker = setInterval(() => {
      if (this._lastHeartbeat > 0 && Date.now() - this._lastHeartbeat > 45_000) {
        this._notifyStale(true);
      }
    }, 10_000);
  }

  private _stopHeartbeatChecker(): void {
    if (this._heartbeatChecker) {
      clearInterval(this._heartbeatChecker);
      this._heartbeatChecker = null;
    }
  }

  private _notifyStale(stale: boolean): void {
    for (const cb of this._staleCallbacks) {
      try { cb(stale); } catch { /* ignore */ }
    }
  }
```

### Step 5: Clean up heartbeat checker on disconnect

In the `_cleanup()` method, add:

```typescript
  private _cleanup(): void {
    this._stopHeartbeatChecker();
    if (this._source) {
      this._source.close();
      this._source = null;
    }
  }
```

### Step 6: Add `sseStale` to Zustand store

In `apps/vwp-board/src/store/board-store.ts`, add `sseStale` state:

After `sseConnected: boolean;` (line 50), add:

```typescript
sseStale: boolean;
```

After `setSseConnected:` (line 64), add:

```typescript
  setSseStale: (stale: boolean) => void;
```

In the store implementation, after `sseConnected: false,` (line 104), add:

```typescript
  sseStale: false,
```

After `setSseConnected:` implementation (line 182), add:

```typescript
  setSseStale: (stale) => set({ sseStale: stale }),
```

### Step 7: Commit

```bash
cd /Users/dave/Work/openclaw
git add apps/vwp-board/src/lib/sse-client.ts apps/vwp-board/src/store/board-store.ts
git commit -m "feat(sse): add heartbeat detection with 45s stale timeout"
```

---

## Task 6: Connection Status Indicator (Frontend)

**Files:**

- Create: `apps/vwp-board/src/components/status/ConnectionIndicator.tsx`
- Create: `apps/vwp-board/src/components/status/index.ts`
- Modify: `apps/vwp-board/src/app/board/page.tsx`

### Step 1: Create ConnectionIndicator component

Create `apps/vwp-board/src/components/status/ConnectionIndicator.tsx`:

```tsx
"use client";

interface ConnectionIndicatorProps {
  sseConnected: boolean;
  sseStale: boolean;
  gatewayConnected: boolean;
}

export function ConnectionIndicator({
  sseConnected,
  sseStale,
  gatewayConnected,
}: ConnectionIndicatorProps) {
  const sseStatus = !sseConnected
    ? { color: "bg-rose-500", label: "Offline" }
    : sseStale
      ? { color: "bg-amber-400", label: "Stale" }
      : { color: "bg-emerald-500", label: "Live" };

  const gwStatus = gatewayConnected
    ? { color: "bg-emerald-500", label: "Gateway" }
    : { color: "bg-slate-300", label: "Gateway offline" };

  return (
    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
      <div className="flex items-center gap-1.5" title={`SSE: ${sseStatus.label}`}>
        <span className={`h-2 w-2 rounded-full ${sseStatus.color}`} />
        {sseStatus.label}
      </div>
      <div className="flex items-center gap-1.5" title={`Gateway: ${gwStatus.label}`}>
        <span className={`h-2 w-2 rounded-full ${gwStatus.color}`} />
        {gwStatus.label}
      </div>
    </div>
  );
}
```

### Step 2: Create barrel export

Create `apps/vwp-board/src/components/status/index.ts`:

```typescript
export { ConnectionIndicator } from "./ConnectionIndicator";
```

### Step 3: Use in board page

In `apps/vwp-board/src/app/board/page.tsx`, replace the inline status indicator (lines 104-112) with the new component. This requires adding `gatewayConnected` state to the board store (will be wired in Task 7).

For now, replace the status bar:

```tsx
import { ConnectionIndicator } from "@/components/status/ConnectionIndicator";

// In BoardContent, add:
const sseStale = useBoardStore((s) => s.sseStale);
const gatewayConnected = useBoardStore((s) => s.gatewayConnected);

// Replace the status bar div:
<div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
  <h2 className="text-lg font-bold text-[var(--color-text)]">Board</h2>
  <ConnectionIndicator
    sseConnected={sseConnected}
    sseStale={sseStale}
    gatewayConnected={gatewayConnected}
  />
</div>;
```

### Step 4: Commit

```bash
cd /Users/dave/Work/openclaw
git add apps/vwp-board/src/components/status/ConnectionIndicator.tsx apps/vwp-board/src/components/status/index.ts apps/vwp-board/src/app/board/page.tsx
git commit -m "feat(ui): add ConnectionIndicator with SSE + gateway status"
```

---

## Task 7: Agent Store Slice (Frontend Zustand)

**Files:**

- Modify: `apps/vwp-board/src/store/board-store.ts`
- Modify: `apps/vwp-board/src/hooks/useSse.ts`

### Step 1: Add agent state to Zustand store

In `apps/vwp-board/src/store/board-store.ts`:

Add import:

```typescript
import type { AgentInfo } from "@/types/kanban";
```

Add to the `KanbanSSEEvent` union type (after existing events):

```typescript
  | { type: "agent_status_changed"; agent: AgentInfo }
  | { type: "agent_connected"; agent: AgentInfo }
  | { type: "agent_disconnected"; agentId: string }
  | { type: "agent_log"; agentId: string; taskId: string; message: string; timestamp: number }
  | { type: "gateway_status"; connected: boolean };
```

Add to `BoardStore` interface:

```typescript
  // Agent state (Phase 5A)
  agents: AgentInfo[];
  gatewayConnected: boolean;
  agentPanelOpen: boolean;
  setAgentPanelOpen: (open: boolean) => void;
```

Add to store defaults:

```typescript
  agents: [],
  gatewayConnected: false,
  agentPanelOpen: false,
  setAgentPanelOpen: (open) => set({ agentPanelOpen: open }),
```

Add cases to `handleSSEEvent`:

```typescript
      case "agent_connected": {
        const agents = get().agents.filter((a) => a.id !== event.agent.id);
        set({ agents: [...agents, event.agent] });
        break;
      }
      case "agent_status_changed": {
        const agents = get().agents.map((a) => a.id === event.agent.id ? event.agent : a);
        set({ agents });
        break;
      }
      case "agent_disconnected": {
        set({ agents: get().agents.filter((a) => a.id !== event.agentId) });
        break;
      }
      case "agent_log":
        // Handled by agent panel detail view
        break;
      case "gateway_status":
        set({ gatewayConnected: event.connected });
        break;
```

### Step 2: Wire stale detection in useSse hook

In `apps/vwp-board/src/hooks/useSse.ts`, add stale tracking:

```typescript
import { boardSSE } from "@/lib/sse-client";
import { useBoardStore, type KanbanSSEEvent } from "@/store/board-store";

export function useSse(): void {
  const handleSSEEvent = useBoardStore((s) => s.handleSSEEvent);
  const setSseConnected = useBoardStore((s) => s.setSseConnected);
  const setSseStale = useBoardStore((s) => s.setSseStale);

  useEffect(() => {
    boardSSE.connect();

    const unsubConnected = boardSSE.on("connected", () => {
      setSseConnected(true);
    });

    const unsubStale = boardSSE.onStaleChange((stale) => {
      setSseStale(stale);
    });

    const unsubAll = boardSSE.on("*", (data) => {
      const event = data as KanbanSSEEvent;
      if (event && typeof event === "object" && "type" in event) {
        handleSSEEvent(event);
      }
    });

    return () => {
      unsubConnected();
      unsubStale();
      unsubAll();
      boardSSE.disconnect();
      setSseConnected(false);
      setSseStale(false);
    };
  }, [handleSSEEvent, setSseConnected, setSseStale]);
}
```

### Step 3: Commit

```bash
cd /Users/dave/Work/openclaw
git add apps/vwp-board/src/store/board-store.ts apps/vwp-board/src/hooks/useSse.ts
git commit -m "feat(store): add agent state slice and gateway status to Zustand"
```

---

## Task 8: Agent Panel Component (Frontend)

**Files:**

- Create: `apps/vwp-board/src/components/agents/AgentPanel.tsx`
- Create: `apps/vwp-board/src/components/agents/AgentCard.tsx`
- Create: `apps/vwp-board/src/components/agents/index.ts`

### Step 1: Create AgentCard component

Create `apps/vwp-board/src/components/agents/AgentCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { AgentInfo } from "@/types/kanban";

const STATUS_STYLES: Record<AgentInfo["status"], { dot: string; label: string }> = {
  active: { dot: "bg-emerald-500 animate-pulse", label: "Active" },
  idle: { dot: "bg-slate-300", label: "Idle" },
  error: { dot: "bg-rose-500", label: "Error" },
};

interface AgentCardProps {
  agent: AgentInfo;
  onTaskClick?: (taskId: string) => void;
}

export function AgentCard({ agent, onTaskClick }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLES[agent.status];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
          <span className="text-sm font-medium text-[var(--color-text)]">{agent.name}</span>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">{style.label}</span>
      </div>

      {/* Task link */}
      {agent.taskId && (
        <button
          type="button"
          onClick={() => onTaskClick?.(agent.taskId!)}
          className="mt-1.5 text-xs text-[var(--color-primary)] hover:underline truncate block w-full text-left"
        >
          Task: {agent.taskId.slice(0, 8)}...
        </button>
      )}

      {/* Last action */}
      {agent.lastAction && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)] truncate">{agent.lastAction}</p>
      )}

      {/* Error */}
      {agent.error && (
        <p className="mt-1 text-xs text-[var(--color-danger)] truncate">{agent.error}</p>
      )}

      {/* Expand toggle (placeholder for logs) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        {expanded ? "Hide logs" : "Show logs"}
      </button>

      {expanded && (
        <div className="mt-2 max-h-32 overflow-auto rounded bg-[var(--color-bg)] p-2 text-[11px] font-mono text-[var(--color-text-muted)]">
          <p className="italic">Log streaming coming soon</p>
        </div>
      )}
    </div>
  );
}
```

### Step 2: Create AgentPanel component

Create `apps/vwp-board/src/components/agents/AgentPanel.tsx`:

```tsx
"use client";

import { useCallback, useEffect } from "react";
import { useBoardStore } from "@/store/board-store";
import { AgentCard } from "./AgentCard";

interface AgentPanelProps {
  onTaskClick?: (taskId: string) => void;
}

export function AgentPanel({ onTaskClick }: AgentPanelProps) {
  const open = useBoardStore((s) => s.agentPanelOpen);
  const setOpen = useBoardStore((s) => s.setAgentPanelOpen);
  const agents = useBoardStore((s) => s.agents);
  const gatewayConnected = useBoardStore((s) => s.gatewayConnected);

  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  if (!open) return null;

  const activeAgents = agents.filter((a) => a.status === "active");
  const otherAgents = agents.filter((a) => a.status !== "active");

  return (
    <>
      {/* Backdrop (mobile) */}
      <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={handleClose} />

      {/* Panel */}
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-hidden rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg md:static md:inset-auto md:z-auto md:max-h-none md:w-80 md:rounded-none md:rounded-l-none md:border-l md:border-t-0 md:shadow-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--color-text)]">Agents</h3>
            <span className="rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
              {agents.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${gatewayConnected ? "bg-emerald-500" : "bg-rose-500"}`}
              title={gatewayConnected ? "Gateway connected" : "Gateway offline"}
            />
            <button
              type="button"
              onClick={handleClose}
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]"
              aria-label="Close agent panel"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-auto p-3" style={{ maxHeight: "calc(70vh - 52px)" }}>
          {agents.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">No agents running</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Agents appear here when tasks are being executed
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {activeAgents.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Active ({activeAgents.length})
                  </p>
                  {activeAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} onTaskClick={onTaskClick} />
                  ))}
                </>
              )}
              {otherAgents.length > 0 && (
                <>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Recent ({otherAgents.length})
                  </p>
                  {otherAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} onTaskClick={onTaskClick} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

### Step 3: Create barrel export

Create `apps/vwp-board/src/components/agents/index.ts`:

```typescript
export { AgentPanel } from "./AgentPanel";
export { AgentCard } from "./AgentCard";
```

### Step 4: Commit

```bash
cd /Users/dave/Work/openclaw
git add apps/vwp-board/src/components/agents/AgentPanel.tsx apps/vwp-board/src/components/agents/AgentCard.tsx apps/vwp-board/src/components/agents/index.ts
git commit -m "feat(ui): add AgentPanel slide-over with AgentCard components"
```

---

## Task 9: Agent-Task Linking (Frontend)

**Files:**

- Modify: `apps/vwp-board/src/components/kanban/TaskCard.tsx`

### Step 1: Add agent indicator to TaskCard

In `apps/vwp-board/src/components/kanban/TaskCard.tsx`, add an agent activity indicator. Import the store:

```typescript
import { useBoardStore } from "@/store/board-store";
```

Inside the `TaskCard` component, after the existing hooks, add:

```typescript
const agents = useBoardStore((s) => s.agents);
const taskAgents = agents.filter((a) => a.taskId === task.id && a.status === "active");
```

Add a visual indicator in the footer section (before the timestamp), replacing the existing `AgentStatus` usage or adding alongside it:

```tsx
{
  taskAgents.length > 0 && (
    <span
      className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        useBoardStore.getState().setAgentPanelOpen(true);
      }}
      title={`${taskAgents.length} agent(s) working`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      {taskAgents.length} agent{taskAgents.length > 1 ? "s" : ""}
    </span>
  );
}
```

### Step 2: Commit

```bash
cd /Users/dave/Work/openclaw
git add apps/vwp-board/src/components/kanban/TaskCard.tsx
git commit -m "feat(ui): add agent activity indicator to TaskCard with panel link"
```

---

## Task 10: Final Integration (Wire Everything Together)

**Files:**

- Modify: `apps/vwp-board/src/app/board/page.tsx`
- Modify: `apps/vwp-board/src/components/desktop/DesktopBoardLayout.tsx`
- Modify: `apps/vwp-board/src/app/layout.tsx`

### Step 1: Add Agents button to sidebar

In `apps/vwp-board/src/app/layout.tsx`, the `Sidebar` component needs an "Agents" link. Since AgentPanel is a store-driven overlay (not a route), add a button that toggles it.

Make it a client component wrapper. Add after the "New Goal" nav link in the Sidebar:

```tsx
<AgentToggleButton />
```

Create a small client component in the same file or a separate one:

```tsx
"use client";

import { useBoardStore } from "@/store/board-store";

function AgentToggleButton() {
  const agentCount = useBoardStore((s) => s.agents.length);
  const setOpen = useBoardStore((s) => s.setAgentPanelOpen);
  const open = useBoardStore((s) => s.agentPanelOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
    >
      <span>Agents</span>
      {agentCount > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-700">
          {agentCount}
        </span>
      )}
    </button>
  );
}
```

**Note:** Since `layout.tsx` is a server component, the `AgentToggleButton` must be extracted to a separate client component file or the Sidebar must become a client component. The cleanest approach is to extract the Sidebar to `components/layout/Sidebar.tsx` as a client component.

### Step 2: Add AgentPanel to DesktopBoardLayout

In `apps/vwp-board/src/components/desktop/DesktopBoardLayout.tsx`, add the AgentPanel after the TaskDetailPanel:

```tsx
import { AgentPanel } from "@/components/agents/AgentPanel";
import { useBoardStore } from "@/store/board-store";

// Inside DesktopBoardLayout:
const agentPanelOpen = useBoardStore((s) => s.agentPanelOpen);

// In the JSX return:
return (
  <div className="flex h-full">
    <div className="min-w-0 flex-1 overflow-auto">
      <KanbanBoard
        columns={columns}
        onMoveTask={onMoveTask}
        onReorderTask={onReorderTask}
        onTaskClick={handleTaskClick}
      />
    </div>
    <TaskDetailPanel
      taskId={selectedTaskId}
      onClose={handleClosePanel}
      onApprove={onApprove}
      onReject={onReject}
      onRetry={onRetry}
      onCancel={onCancel}
    />
    {agentPanelOpen && (
      <AgentPanel
        onTaskClick={(taskId) => {
          handleTaskClick(taskId);
        }}
      />
    )}
  </div>
);
```

### Step 3: Add Agents button to mobile TabBar

In the mobile TabBar (layout.tsx), add an Agents tab. Since the TabBar is in a server component, extract it similarly or add a client wrapper.

### Step 4: Run the full test suite

```bash
cd /Users/dave/Work/openclaw
npx vitest run extensions/vwp-dispatch/gateway-client.test.ts extensions/vwp-dispatch/agent-state.test.ts
```

Expected: All tests PASS

### Step 5: Run E2E tests

```bash
cd /Users/dave/Work/openclaw/apps/vwp-board
npx playwright test
```

Expected: Existing tests still pass (new features are additive)

### Step 6: Commit

```bash
cd /Users/dave/Work/openclaw
git add apps/vwp-board/src/app/layout.tsx apps/vwp-board/src/app/board/page.tsx apps/vwp-board/src/components/desktop/DesktopBoardLayout.tsx
git commit -m "feat(mission-control): wire AgentPanel into board layout with sidebar toggle"
```

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `npx vitest run extensions/vwp-dispatch/gateway-client.test.ts` — all pass
- [ ] `npx vitest run extensions/vwp-dispatch/agent-state.test.ts` — all pass
- [ ] `cd apps/vwp-board && npx playwright test` — existing E2E tests pass
- [ ] Gateway client connects when OpenClaw is running locally
- [ ] Connection indicator shows green/red for SSE and Gateway
- [ ] Agent panel opens/closes from sidebar button
- [ ] Agent panel is slide-over on desktop, bottom sheet on mobile
- [ ] Task cards show agent indicator when agents are active
- [ ] Clicking agent in panel highlights associated task
- [ ] SSE heartbeat timeout shows "Stale" after 45s of silence
- [ ] Gateway disconnect triggers reconnect after 10s

## Files Summary

**Created (7):**

- `extensions/vwp-dispatch/gateway-client.ts`
- `extensions/vwp-dispatch/gateway-client.test.ts`
- `extensions/vwp-dispatch/agent-state.ts`
- `extensions/vwp-dispatch/agent-state.test.ts`
- `apps/vwp-board/src/components/agents/AgentPanel.tsx`
- `apps/vwp-board/src/components/agents/AgentCard.tsx`
- `apps/vwp-board/src/components/agents/index.ts`
- `apps/vwp-board/src/components/status/ConnectionIndicator.tsx`
- `apps/vwp-board/src/components/status/index.ts`

**Modified (9):**

- `extensions/vwp-dispatch/kanban-types.ts`
- `extensions/vwp-dispatch/index.ts`
- `extensions/vwp-dispatch/kanban-routes.ts`
- `extensions/vwp-dispatch/team-launcher.ts`
- `apps/vwp-board/src/types/kanban.ts`
- `apps/vwp-board/src/lib/sse-client.ts`
- `apps/vwp-board/src/store/board-store.ts`
- `apps/vwp-board/src/hooks/useSse.ts`
- `apps/vwp-board/src/app/board/page.tsx`
- `apps/vwp-board/src/app/layout.tsx`
- `apps/vwp-board/src/components/desktop/DesktopBoardLayout.tsx`
- `apps/vwp-board/src/components/kanban/TaskCard.tsx`
