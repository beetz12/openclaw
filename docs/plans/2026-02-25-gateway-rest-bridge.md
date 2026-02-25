# Gateway REST Bridge — Unified Mission Control

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose upstream gateway WebSocket RPC methods (cron, sessions, usage, config, channels, health) as HTTP REST endpoints in vwp-dispatch, then build VWP Board pages that consume them — eliminating the need to open the Control UI for daily operations.

**Architecture:** New route files in `extensions/vwp-dispatch/` follow the exact same pattern as `chat-routes.ts`: accept HTTP REST, call `gateway.call()` for the RPC method, return JSON. New pages in `apps/vwp-board/` consume these endpoints through `api-client.ts`. The existing `GatewayClient` handles all WebSocket protocol complexity.

**Tech Stack:** TypeScript, Node.js HTTP (IncomingMessage/ServerResponse), GatewayClient WebSocket bridge, Next.js 15 App Router, React 19, Tailwind CSS, Zustand

---

## Reference Files

These files are the patterns to follow. Read them before starting any task:

- **Route pattern:** `extensions/vwp-dispatch/chat-routes.ts` — auth, readBody, jsonResponse, gateway.call()
- **Registration:** `extensions/vwp-dispatch/index.ts:219-281` — api.registerHttpHandler()
- **Gateway client:** `extensions/vwp-dispatch/gateway-client.ts` — .call() and .isConnected()
- **Auth helpers:** `extensions/vwp-dispatch/upstream-imports.ts` — getBearerToken, safeEqualSecret
- **API client:** `apps/vwp-board/src/lib/api-client.ts` — KanbanApiClient._fetch() pattern
- **Page pattern:** `apps/vwp-board/src/app/calendar/page.tsx` — existing page to upgrade
- **Cost pattern:** `apps/vwp-board/src/components/cost-dashboard/CostDashboard.tsx` — existing to enhance

---

## Task 1: Cron Routes (Backend)

**Files:**
- Create: `extensions/vwp-dispatch/cron-routes.ts`
- Create: `extensions/vwp-dispatch/cron-routes.test.ts`
- Modify: `extensions/vwp-dispatch/index.ts`

### Step 1: Write the failing test

```typescript
// cron-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCronHttpHandler } from "./cron-routes.js";
import type { IncomingMessage, ServerResponse } from "node:http";

function mockReq(method: string, url: string): IncomingMessage {
  const req = {
    method,
    url,
    headers: { authorization: "Bearer test-token" },
    on: vi.fn((event: string, cb: Function) => {
      if (event === "end") cb();
      return req;
    }),
    destroy: vi.fn(),
  } as unknown as IncomingMessage;
  return req;
}

function mockRes(): ServerResponse & { _status: number; _body: string } {
  const res = {
    statusCode: 200,
    _status: 200,
    _body: "",
    setHeader: vi.fn(),
    end: vi.fn((data: string) => {
      res._body = data;
      res._status = res.statusCode;
    }),
  } as unknown as ServerResponse & { _status: number; _body: string };
  return res;
}

describe("cron-routes", () => {
  const mockGateway = {
    isConnected: vi.fn(() => true),
    call: vi.fn(),
  };

  const handler = createCronHttpHandler({
    gatewayToken: "test-token",
    gateway: () => mockGateway as any,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGateway.isConnected.mockReturnValue(true);
  });

  it("returns false for non-cron routes", async () => {
    const req = mockReq("GET", "/vwp/chat/status");
    const res = mockRes();
    expect(await handler(req, res)).toBe(false);
  });

  it("GET /vwp/cron/jobs returns job list", async () => {
    const jobs = [{ id: "j1", name: "Morning brief", enabled: true }];
    mockGateway.call.mockResolvedValue({ jobs });

    const req = mockReq("GET", "/vwp/cron/jobs");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("cron.list", { includeDisabled: true });
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual({ jobs });
  });

  it("GET /vwp/cron/status returns cron status", async () => {
    const status = { enabled: true, jobs: 3, nextWakeAtMs: 1234 };
    mockGateway.call.mockResolvedValue(status);

    const req = mockReq("GET", "/vwp/cron/status");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("cron.status", {});
    expect(res._status).toBe(200);
  });

  it("returns 503 when gateway disconnected", async () => {
    mockGateway.isConnected.mockReturnValue(false);

    const req = mockReq("GET", "/vwp/cron/jobs");
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(503);
  });

  it("returns 401 without valid token", async () => {
    const req = mockReq("GET", "/vwp/cron/jobs");
    (req.headers as Record<string, string>).authorization = "Bearer wrong";
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(401);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd extensions/vwp-dispatch && npx vitest run cron-routes.test.ts`
Expected: FAIL — module `./cron-routes.js` not found

### Step 3: Write the implementation

```typescript
// cron-routes.ts
/**
 * HTTP routes bridging gateway cron RPC methods to REST.
 *
 * Routes:
 *   GET    /vwp/cron/status          — cron scheduler status
 *   GET    /vwp/cron/jobs            — list all cron jobs
 *   POST   /vwp/cron/jobs            — create a cron job
 *   PATCH  /vwp/cron/jobs/:id        — update a cron job
 *   DELETE /vwp/cron/jobs/:id        — remove a cron job
 *   POST   /vwp/cron/jobs/:id/run    — trigger a cron job
 *   GET    /vwp/cron/jobs/:id/runs   — get run history
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayClient } from "./gateway-client.js";
import { getBearerToken, safeEqualSecret } from "./upstream-imports.js";

const MAX_BODY_BYTES = 64 * 1024;

export type CronRoutesDeps = {
  gatewayToken: string | undefined;
  gateway: GatewayClient | (() => GatewayClient | undefined);
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) { req.destroy(); reject(new Error("body_too_large")); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function createCronHttpHandler(deps: CronRoutesDeps) {
  const { gatewayToken } = deps;
  const resolveGateway = (): GatewayClient | undefined =>
    typeof deps.gateway === "function" ? deps.gateway() : deps.gateway;

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const token = getBearerToken(req);
    if (!gatewayToken || !safeEqualSecret(token, gatewayToken)) {
      json(res, 401, { error: "Unauthorized" });
      return false;
    }
    return true;
  }

  function requireGateway(res: ServerResponse): GatewayClient | null {
    const gw = resolveGateway();
    if (!gw || !gw.isConnected()) {
      json(res, 503, { error: "Gateway not connected" });
      return null;
    }
    return gw;
  }

  // Extract :id from /vwp/cron/jobs/:id or /vwp/cron/jobs/:id/run etc.
  const JOB_ID_RE = /^\/vwp\/cron\/jobs\/([^/]+)/;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (!pathname.startsWith("/vwp/cron/")) return false;
    if (!checkAuth(req, res)) return true;

    // GET /vwp/cron/status
    if (req.method === "GET" && pathname === "/vwp/cron/status") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("cron.status", {});
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/cron/jobs — list all jobs
    if (req.method === "GET" && pathname === "/vwp/cron/jobs") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("cron.list", { includeDisabled: true });
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // POST /vwp/cron/jobs — create job
    if (req.method === "POST" && pathname === "/vwp/cron/jobs") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const body = JSON.parse(await readBody(req));
        const result = await gw.call("cron.add", body);
        json(res, 201, result);
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          json(res, 413, { error: "Request body too large" });
        } else {
          json(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
      }
      return true;
    }

    // Match job-specific routes: /vwp/cron/jobs/:id[/action]
    const idMatch = pathname.match(JOB_ID_RE);
    if (!idMatch) return false;

    const jobId = decodeURIComponent(idMatch[1]);
    const suffix = pathname.slice(idMatch[0].length); // "" or "/run" or "/runs"

    // PATCH /vwp/cron/jobs/:id — update job
    if (req.method === "PATCH" && suffix === "") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const body = JSON.parse(await readBody(req));
        const result = await gw.call("cron.update", { id: jobId, patch: body });
        json(res, 200, result);
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // DELETE /vwp/cron/jobs/:id — remove job
    if (req.method === "DELETE" && suffix === "") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("cron.remove", { id: jobId });
        json(res, 200, result);
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // POST /vwp/cron/jobs/:id/run — trigger job
    if (req.method === "POST" && suffix === "/run") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("cron.run", { id: jobId, mode: "force" });
        json(res, 200, result);
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/cron/jobs/:id/runs — run history
    if (req.method === "GET" && suffix === "/runs") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
        const result = await gw.call("cron.runs", { id: jobId, limit: Math.min(limit, 200) });
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    return false;
  };
}
```

### Step 4: Run test to verify it passes

Run: `cd extensions/vwp-dispatch && npx vitest run cron-routes.test.ts`
Expected: PASS

### Step 5: Register the handler in index.ts

Add to `extensions/vwp-dispatch/index.ts` after the existing handler registrations (~line 281):

```typescript
// After the cowork handler registration, add:
import { createCronHttpHandler } from "./cron-routes.js";

// In the register() function, after the coworkHandler registration:
const cronHandler = createCronHttpHandler({
  gatewayToken,
  gateway: () => gateway,
});
api.registerHttpHandler(cronHandler);
```

### Step 6: Run full test suite

Run: `cd extensions/vwp-dispatch && npx vitest run`
Expected: All tests pass

### Step 7: Commit

```bash
git add extensions/vwp-dispatch/cron-routes.ts extensions/vwp-dispatch/cron-routes.test.ts extensions/vwp-dispatch/index.ts
git commit -m "feat(vwp-dispatch): add REST bridge for gateway cron RPC methods"
```

---

## Task 2: Usage & Sessions Routes (Backend)

**Files:**
- Create: `extensions/vwp-dispatch/usage-routes.ts`
- Create: `extensions/vwp-dispatch/usage-routes.test.ts`
- Modify: `extensions/vwp-dispatch/index.ts`

### Step 1: Write the failing test

```typescript
// usage-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUsageHttpHandler } from "./usage-routes.js";
import type { IncomingMessage, ServerResponse } from "node:http";

function mockReq(method: string, url: string): IncomingMessage {
  const req = {
    method,
    url,
    headers: { authorization: "Bearer test-token" },
    on: vi.fn((event: string, cb: Function) => {
      if (event === "end") cb();
      return req;
    }),
    destroy: vi.fn(),
  } as unknown as IncomingMessage;
  return req;
}

function mockRes(): ServerResponse & { _status: number; _body: string } {
  const res = {
    statusCode: 200,
    _status: 200,
    _body: "",
    setHeader: vi.fn(),
    end: vi.fn((data: string) => {
      res._body = data;
      res._status = res.statusCode;
    }),
  } as unknown as ServerResponse & { _status: number; _body: string };
  return res;
}

describe("usage-routes", () => {
  const mockGateway = {
    isConnected: vi.fn(() => true),
    call: vi.fn(),
  };

  const handler = createUsageHttpHandler({
    gatewayToken: "test-token",
    gateway: () => mockGateway as any,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGateway.isConnected.mockReturnValue(true);
  });

  it("returns false for non-usage routes", async () => {
    const req = mockReq("GET", "/vwp/chat/status");
    const res = mockRes();
    expect(await handler(req, res)).toBe(false);
  });

  it("GET /vwp/usage/cost returns cost summary", async () => {
    const costData = { totals: { totalCost: 12.50 }, daily: [] };
    mockGateway.call.mockResolvedValue(costData);

    const req = mockReq("GET", "/vwp/usage/cost?days=30");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("usage.cost", { days: 30 });
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual(costData);
  });

  it("GET /vwp/usage/sessions returns session usage", async () => {
    const usageData = { totals: {}, sessions: [], aggregates: {} };
    mockGateway.call.mockResolvedValue(usageData);

    const req = mockReq("GET", "/vwp/usage/sessions?startDate=2026-02-01&endDate=2026-02-25");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("sessions.usage", {
      startDate: "2026-02-01",
      endDate: "2026-02-25",
    });
    expect(res._status).toBe(200);
  });

  it("GET /vwp/sessions returns session list", async () => {
    const sessions = { sessions: [], count: 0 };
    mockGateway.call.mockResolvedValue(sessions);

    const req = mockReq("GET", "/vwp/sessions?limit=20");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("sessions.list", expect.objectContaining({ limit: 20 }));
    expect(res._status).toBe(200);
  });

  it("GET /vwp/health returns health summary", async () => {
    const health = { ok: true, ts: Date.now() };
    mockGateway.call.mockResolvedValue(health);

    const req = mockReq("GET", "/vwp/health");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("health", {});
    expect(res._status).toBe(200);
  });

  it("GET /vwp/gateway/config returns config snapshot", async () => {
    const config = { path: "/etc/openclaw.json", exists: true };
    mockGateway.call.mockResolvedValue(config);

    const req = mockReq("GET", "/vwp/gateway/config");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("config.get", {});
    expect(res._status).toBe(200);
  });

  it("GET /vwp/channels/status returns channel status", async () => {
    const channels = { ts: Date.now(), channelAccounts: {} };
    mockGateway.call.mockResolvedValue(channels);

    const req = mockReq("GET", "/vwp/channels/status");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("channels.status", { probe: false });
    expect(res._status).toBe(200);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd extensions/vwp-dispatch && npx vitest run usage-routes.test.ts`
Expected: FAIL — module not found

### Step 3: Write the implementation

```typescript
// usage-routes.ts
/**
 * HTTP routes bridging gateway usage, sessions, health, config, and channels RPC methods.
 *
 * Routes:
 *   GET  /vwp/usage/cost              — cost summary (usage.cost)
 *   GET  /vwp/usage/sessions          — session usage breakdown (sessions.usage)
 *   GET  /vwp/sessions                — session list (sessions.list)
 *   GET  /vwp/health                  — gateway health (health)
 *   GET  /vwp/gateway/status          — gateway status (status)
 *   GET  /vwp/gateway/config          — config snapshot (config.get)
 *   GET  /vwp/channels/status         — channel connection status (channels.status)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayClient } from "./gateway-client.js";
import { getBearerToken, safeEqualSecret } from "./upstream-imports.js";

export type UsageRoutesDeps = {
  gatewayToken: string | undefined;
  gateway: GatewayClient | (() => GatewayClient | undefined);
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function createUsageHttpHandler(deps: UsageRoutesDeps) {
  const { gatewayToken } = deps;
  const resolveGateway = (): GatewayClient | undefined =>
    typeof deps.gateway === "function" ? deps.gateway() : deps.gateway;

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const token = getBearerToken(req);
    if (!gatewayToken || !safeEqualSecret(token, gatewayToken)) {
      json(res, 401, { error: "Unauthorized" });
      return false;
    }
    return true;
  }

  function requireGateway(res: ServerResponse): GatewayClient | null {
    const gw = resolveGateway();
    if (!gw || !gw.isConnected()) {
      json(res, 503, { error: "Gateway not connected" });
      return null;
    }
    return gw;
  }

  // Routes handled by this handler (checked in order to allow early return)
  const ROUTES = ["/vwp/usage/", "/vwp/sessions", "/vwp/health", "/vwp/gateway/", "/vwp/channels/"];

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (!ROUTES.some((r) => pathname.startsWith(r))) return false;
    if (req.method !== "GET") return false;
    if (!checkAuth(req, res)) return true;

    // GET /vwp/usage/cost
    if (pathname === "/vwp/usage/cost") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const days = url.searchParams.get("days");
        const startDate = url.searchParams.get("startDate") ?? undefined;
        const endDate = url.searchParams.get("endDate") ?? undefined;
        const params: Record<string, unknown> = {};
        if (days) params.days = parseInt(days, 10);
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        const result = await gw.call("usage.cost", params);
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/usage/sessions
    if (pathname === "/vwp/usage/sessions") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const params: Record<string, unknown> = {};
        const startDate = url.searchParams.get("startDate");
        const endDate = url.searchParams.get("endDate");
        const key = url.searchParams.get("key");
        const limit = url.searchParams.get("limit");
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (key) params.key = key;
        if (limit) params.limit = parseInt(limit, 10);
        const result = await gw.call("sessions.usage", params);
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/sessions
    if (pathname === "/vwp/sessions") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const limit = url.searchParams.get("limit");
        const search = url.searchParams.get("search") ?? undefined;
        const activeMinutes = url.searchParams.get("activeMinutes");
        const params: Record<string, unknown> = {
          includeDerivedTitles: true,
          includeLastMessage: true,
        };
        if (limit) params.limit = parseInt(limit, 10);
        if (search) params.search = search;
        if (activeMinutes) params.activeMinutes = parseInt(activeMinutes, 10);
        const result = await gw.call("sessions.list", params);
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/health
    if (pathname === "/vwp/health") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("health", {});
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/gateway/status
    if (pathname === "/vwp/gateway/status") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("status", {});
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/gateway/config
    if (pathname === "/vwp/gateway/config") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("config.get", {});
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/channels/status
    if (pathname === "/vwp/channels/status") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const probe = url.searchParams.get("probe") === "true";
        const result = await gw.call("channels.status", { probe });
        json(res, 200, result);
      } catch (err) {
        json(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    return false;
  };
}
```

### Step 4: Run test to verify it passes

Run: `cd extensions/vwp-dispatch && npx vitest run usage-routes.test.ts`
Expected: PASS

### Step 5: Register the handler in index.ts

Add to `extensions/vwp-dispatch/index.ts`:

```typescript
import { createUsageHttpHandler } from "./usage-routes.js";

// In register(), after cronHandler:
const usageHandler = createUsageHttpHandler({
  gatewayToken,
  gateway: () => gateway,
});
api.registerHttpHandler(usageHandler);
```

### Step 6: Run full test suite

Run: `cd extensions/vwp-dispatch && npx vitest run`
Expected: All tests pass

### Step 7: Commit

```bash
git add extensions/vwp-dispatch/usage-routes.ts extensions/vwp-dispatch/usage-routes.test.ts extensions/vwp-dispatch/index.ts
git commit -m "feat(vwp-dispatch): add REST bridge for usage, sessions, health, config, channels"
```

---

## Task 3: Frontend API Client Methods

**Files:**
- Modify: `apps/vwp-board/src/lib/api-client.ts`

### Step 1: Add cron API methods to KanbanApiClient

Add these methods to the `KanbanApiClient` class in `api-client.ts`, after the existing CoWork methods:

```typescript
  // --- Cron API (gateway bridge) ---

  async getCronStatus(): Promise<{ enabled: boolean; storePath: string; jobs: number; nextWakeAtMs: number | null }> {
    const url = this._url("/vwp/cron/status");
    return this._fetch(url);
  }

  async getCronJobs(): Promise<{ jobs: Array<{
    id: string; name: string; description?: string; enabled: boolean;
    schedule: { kind: string; expr?: string; at?: string; everyMs?: number };
    payload: { kind: string; message?: string; text?: string };
    state: { nextRunAtMs?: number; lastRunAtMs?: number; lastStatus?: string; lastError?: string; lastDurationMs?: number };
  }> }> {
    const url = this._url("/vwp/cron/jobs");
    return this._fetch(url);
  }

  async createCronJob(job: Record<string, unknown>): Promise<unknown> {
    const url = this._url("/vwp/cron/jobs");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });
  }

  async updateCronJob(id: string, patch: Record<string, unknown>): Promise<unknown> {
    const url = this._url(`/vwp/cron/jobs/${encodeURIComponent(id)}`);
    return this._fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async deleteCronJob(id: string): Promise<{ ok: boolean; removed: boolean }> {
    const url = this._url(`/vwp/cron/jobs/${encodeURIComponent(id)}`);
    return this._fetch(url, { method: "DELETE" });
  }

  async runCronJob(id: string): Promise<{ ok: boolean; ran: boolean; reason?: string }> {
    const url = this._url(`/vwp/cron/jobs/${encodeURIComponent(id)}/run`);
    return this._fetch(url, { method: "POST" });
  }

  async getCronJobRuns(id: string, limit = 50): Promise<{ entries: Array<{
    ts: number; jobId: string; status?: string; error?: string; summary?: string; durationMs?: number;
  }> }> {
    const url = this._url(`/vwp/cron/jobs/${encodeURIComponent(id)}/runs`, { limit });
    return this._fetch(url);
  }

  // --- Usage/Sessions API (gateway bridge) ---

  async getUsageCost(opts?: { days?: number; startDate?: string; endDate?: string }): Promise<{
    updatedAt: number; days: number;
    totals: { totalTokens: number; totalCost: number; input: number; output: number };
    daily: Array<{ date: string; totalTokens: number; totalCost: number }>;
  }> {
    const url = this._url("/vwp/usage/cost", {
      days: opts?.days,
      startDate: opts?.startDate,
      endDate: opts?.endDate,
    });
    return this._fetch(url);
  }

  async getSessionUsage(opts?: { startDate?: string; endDate?: string; limit?: number }): Promise<unknown> {
    const url = this._url("/vwp/usage/sessions", {
      startDate: opts?.startDate,
      endDate: opts?.endDate,
      limit: opts?.limit,
    });
    return this._fetch(url);
  }

  async getSessions(opts?: { limit?: number; search?: string; activeMinutes?: number }): Promise<{
    sessions: Array<{ key: string; kind: string; derivedTitle?: string; lastMessagePreview?: string; updatedAt: number | null; totalTokens?: number; model?: string }>;
    count: number;
  }> {
    const url = this._url("/vwp/sessions", {
      limit: opts?.limit,
      search: opts?.search,
      activeMinutes: opts?.activeMinutes,
    });
    return this._fetch(url);
  }

  async getGatewayHealth(): Promise<{ ok: boolean; ts: number; agents: unknown[]; sessions: unknown }> {
    const url = this._url("/vwp/health");
    return this._fetch(url);
  }

  async getGatewayConfig(): Promise<{ path: string; exists: boolean; config: unknown }> {
    const url = this._url("/vwp/gateway/config");
    return this._fetch(url);
  }

  async getChannelsStatus(probe = false): Promise<{
    ts: number; channelOrder: string[];
    channelAccounts: Record<string, Array<{ accountId: string; name?: string; connected?: boolean; enabled?: boolean; configured?: boolean; lastError?: string }>>;
  }> {
    const url = this._url("/vwp/channels/status", { probe: probe ? "true" : undefined });
    return this._fetch(url);
  }
```

### Step 2: Commit

```bash
git add apps/vwp-board/src/lib/api-client.ts
git commit -m "feat(vwp-board): add API client methods for cron, usage, sessions, health, channels"
```

---

## Task 4: Cron Management Page (Frontend)

**Files:**
- Create: `apps/vwp-board/src/app/cron/page.tsx`

This replaces the static calendar automation templates with real cron job data.

### Step 1: Create the cron page

```tsx
// apps/vwp-board/src/app/cron/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { kanbanApi } from "@/lib/api-client";

type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; at?: string; everyMs?: number };
  payload: { kind: string; message?: string; text?: string };
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastError?: string;
    lastDurationMs?: number;
  };
};

type RunEntry = {
  ts: number;
  jobId: string;
  status?: string;
  error?: string;
  summary?: string;
  durationMs?: number;
};

function formatSchedule(s: CronJob["schedule"]): string {
  if (s.kind === "cron" && s.expr) return s.expr;
  if (s.kind === "at" && s.at) return `Once at ${s.at}`;
  if (s.kind === "every" && s.everyMs) {
    const mins = Math.round(s.everyMs / 60000);
    return mins >= 60 ? `Every ${Math.round(mins / 60)}h` : `Every ${mins}m`;
  }
  return s.kind;
}

function timeAgo(ms: number | undefined): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const data = await kanbanApi.getCronJobs();
      setJobs(data.jobs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cron jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    const id = setInterval(() => void loadJobs(), 30000);
    return () => clearInterval(id);
  }, [loadJobs]);

  const handleRun = useCallback(async (jobId: string) => {
    setRunningId(jobId);
    try {
      await kanbanApi.runCronJob(jobId);
      setTimeout(() => void loadJobs(), 2000);
    } catch {
      // best effort
    } finally {
      setRunningId(null);
    }
  }, [loadJobs]);

  const handleToggle = useCallback(async (job: CronJob) => {
    try {
      await kanbanApi.updateCronJob(job.id, { enabled: !job.enabled });
      void loadJobs();
    } catch {
      // best effort
    }
  }, [loadJobs]);

  const handleViewRuns = useCallback(async (jobId: string) => {
    if (selectedJob === jobId) { setSelectedJob(null); return; }
    setSelectedJob(jobId);
    setRunsLoading(true);
    try {
      const data = await kanbanApi.getCronJobRuns(jobId, 20);
      setRuns(data.entries);
    } catch {
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, [selectedJob]);

  const enabledJobs = useMemo(() => jobs.filter((j) => j.enabled), [jobs]);
  const disabledJobs = useMemo(() => jobs.filter((j) => !j.enabled), [jobs]);

  if (loading) {
    return <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading cron jobs...</div>;
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
        <button type="button" onClick={() => { setLoading(true); void loadJobs(); }}
          className="mt-2 rounded border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">Cron Jobs</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {enabledJobs.length} active, {disabledJobs.length} disabled
            </p>
          </div>
          <button type="button" onClick={() => { setLoading(true); void loadJobs(); }}
            className="rounded border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[var(--color-bg-subtle)]">
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {jobs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No cron jobs configured. Create jobs via the gateway config or CLI.</p>
        ) : (
          jobs.map((job) => (
            <div key={job.id} className="rounded-xl border border-[var(--color-border)] bg-white">
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${job.enabled ? "bg-emerald-500" : "bg-gray-300"}`} />
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">{job.name}</p>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">
                      {formatSchedule(job.schedule)}
                    </span>
                  </div>
                  {job.description && (
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate">{job.description}</p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                    <span>Last: {timeAgo(job.state.lastRunAtMs)}</span>
                    {job.state.lastStatus && (
                      <span className={job.state.lastStatus === "ok" ? "text-emerald-600" : job.state.lastStatus === "error" ? "text-red-600" : "text-gray-500"}>
                        {job.state.lastStatus}
                      </span>
                    )}
                    {job.state.nextRunAtMs && (
                      <span>Next: {new Date(job.state.nextRunAtMs).toLocaleTimeString()}</span>
                    )}
                    {job.state.lastDurationMs != null && (
                      <span>{(job.state.lastDurationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  {job.state.lastError && (
                    <p className="mt-1 text-[11px] text-red-600 truncate">{job.state.lastError}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => void handleToggle(job)}
                    className={`rounded px-2 py-1 text-[11px] font-medium ${job.enabled ? "bg-gray-100 text-gray-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {job.enabled ? "Disable" : "Enable"}
                  </button>
                  <button type="button" onClick={() => void handleRun(job.id)}
                    disabled={runningId === job.id}
                    className="rounded bg-indigo-100 px-2 py-1 text-[11px] font-medium text-indigo-700 disabled:opacity-50">
                    {runningId === job.id ? "Running..." : "Run Now"}
                  </button>
                  <button type="button" onClick={() => void handleViewRuns(job.id)}
                    className="rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                    {selectedJob === job.id ? "Hide" : "History"}
                  </button>
                </div>
              </div>

              {selectedJob === job.id && (
                <div className="border-t border-[var(--color-border)] bg-gray-50 p-3">
                  {runsLoading ? (
                    <p className="text-xs text-[var(--color-text-muted)]">Loading history...</p>
                  ) : runs.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)]">No run history yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {runs.slice(0, 10).map((run, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--color-text-muted)]">
                            {new Date(run.ts).toLocaleString()}
                          </span>
                          <span className={run.status === "ok" ? "text-emerald-600" : run.status === "error" ? "text-red-600" : "text-gray-500"}>
                            {run.status ?? "unknown"}
                          </span>
                          {run.durationMs != null && (
                            <span className="text-[var(--color-text-muted)]">{(run.durationMs / 1000).toFixed(1)}s</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

### Step 2: Commit

```bash
git add apps/vwp-board/src/app/cron/page.tsx
git commit -m "feat(vwp-board): add cron job management page with live gateway data"
```

---

## Task 5: Upgrade Calendar Page to Use Real Cron Data

**Files:**
- Modify: `apps/vwp-board/src/app/calendar/page.tsx`

### Step 1: Replace static templates with real cron data

Replace the `DEFAULT_AUTOMATIONS` constant and loading logic. The calendar page should now fetch from `/vwp/cron/jobs` and merge with active tasks, replacing the static templates entirely. If the cron endpoint is unavailable (gateway disconnected), fall back to showing tasks only.

The key changes:
- Remove the `DEFAULT_AUTOMATIONS` hardcoded array
- Add a `loadCronJobs` call alongside `loadTasks`
- Map cron jobs to `CalendarItem` with real schedule strings
- Remove the "Cron jobs are currently shown as templates" disclaimer

### Step 2: Commit

```bash
git add apps/vwp-board/src/app/calendar/page.tsx
git commit -m "feat(vwp-board): upgrade calendar page to use live cron job data from gateway"
```

---

## Task 6: Enhance Cost Dashboard with Gateway Usage Data

**Files:**
- Modify: `apps/vwp-board/src/components/cost-dashboard/CostDashboard.tsx`

### Step 1: Add gateway usage data tab

Enhance the cost dashboard to show a "Gateway Usage" section alongside the existing task-based cost view. Add a toggle between "Task Costs" (existing) and "Gateway Usage" (new) views.

The "Gateway Usage" view calls `kanbanApi.getUsageCost({ days })` and displays:
- Total spend from `totals.totalCost`
- Token breakdown from `totals.input`, `totals.output`
- Daily cost chart from `daily[]`

Keep the existing task-based cost view as the default. The gateway usage view is additive.

### Step 2: Commit

```bash
git add apps/vwp-board/src/components/cost-dashboard/CostDashboard.tsx
git commit -m "feat(vwp-board): add gateway usage data to cost dashboard"
```

---

## Task 7: Add Navigation Entry for Cron Page

**Files:**
- Modify: `apps/vwp-board/src/app/layout.tsx`

### Step 1: Add /cron to sidebar navigation

Find the navigation items array in `layout.tsx` and add an entry for the cron page after the calendar entry:

```tsx
{ href: "/cron", label: "Cron Jobs", icon: "..." }
```

Use the same pattern as existing nav items.

### Step 2: Commit

```bash
git add apps/vwp-board/src/app/layout.tsx
git commit -m "feat(vwp-board): add cron jobs to sidebar navigation"
```

---

## Task 8: E2E Test for Cron Page

**Files:**
- Create: `apps/vwp-board/e2e/cron-page.spec.ts`

### Step 1: Write E2E test

Follow the pattern of existing E2E tests (e.g., `calendar-page.spec.ts`). The test should:
- Inject auth token via `page.evaluate()`
- Mock the `/vwp/cron/jobs` endpoint with test fixtures
- Navigate to `/cron`
- Verify the job list renders with names, schedules, and status indicators
- Verify toggle and run buttons are present

### Step 2: Run the E2E test

Run: `cd apps/vwp-board && npx playwright test e2e/cron-page.spec.ts`
Expected: PASS

### Step 3: Commit

```bash
git add apps/vwp-board/e2e/cron-page.spec.ts
git commit -m "test(vwp-board): add E2E test for cron management page"
```

---

## Task 9: Full Test Suite Verification

### Step 1: Run backend tests

Run: `cd extensions/vwp-dispatch && npx vitest run`
Expected: All pass

### Step 2: Run frontend build

Run: `cd apps/vwp-board && npx next build`
Expected: Build succeeds

### Step 3: Run full project check

Run: `pnpm check && pnpm test`
Expected: All pass

### Step 4: Final commit (if any lint/type fixes needed)

```bash
git add -A
git commit -m "chore: fix lint and type issues from gateway bridge integration"
```

---

## Summary

| Task | What | Type | Est. Effort |
|------|------|------|-------------|
| 1 | Cron REST routes (backend) | New file + tests | Medium |
| 2 | Usage/sessions/health/config/channels REST routes (backend) | New file + tests | Medium |
| 3 | API client methods (frontend) | Modify existing | Small |
| 4 | Cron management page (frontend) | New page | Medium |
| 5 | Upgrade calendar with real cron data | Modify existing | Small |
| 6 | Enhance cost dashboard with gateway usage | Modify existing | Small |
| 7 | Navigation entry for cron | Modify existing | Trivial |
| 8 | E2E test for cron page | New test | Small |
| 9 | Full verification | Run tests | Trivial |
