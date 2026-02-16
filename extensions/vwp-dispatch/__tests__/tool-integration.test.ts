/**
 * Integration tests for workspace tools lifecycle.
 *
 * Tests the full flow: tool discovery → route handling → ToolRunner → SSE events.
 * Uses a real temp directory with a test manifest and a simple Node.js echo script.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { ToolSSEEvent } from "../kanban-types.js";
import { discoverTools, type LoadedTool } from "../tool-manifest.js";
import { createToolHttpHandler, type ToolRoutesDeps } from "../tool-routes.js";
import { ToolRunner } from "../tool-runner.js";

// ---------- Mock auth helpers ----------

vi.mock("../../src/gateway/http-utils.js", () => ({
  getBearerToken: (req: { headers: Record<string, string> }) => {
    const auth = req.headers["authorization"] ?? "";
    return auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
  },
}));

vi.mock("../../src/security/secret-equal.js", () => ({
  safeEqualSecret: (a: string | undefined, b: string | undefined) => a === b,
}));

// ---------- Helpers ----------

const FIXTURE_DIR = join(tmpdir(), `tool-integration-${Date.now()}`);
const TOOLS_ROOT = join(FIXTURE_DIR, "tools");
const SUITE_DIR = join(TOOLS_ROOT, "test-suite");
const TOKEN = "integration-test-token";

/**
 * Creates a mock request with optional body emission on nextTick.
 * Using process.nextTick ensures the handler registers its event listeners
 * before we emit body data.
 */
function mockReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: Record<string, unknown>,
): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  if (body !== undefined) {
    process.nextTick(() => {
      const raw = JSON.stringify(body);
      req.emit("data", Buffer.from(raw));
      req.emit("end");
    });
  }
  return req;
}

function mockRes(): ServerResponse & {
  _status: number;
  _body: string;
  _headers: Record<string, string>;
} {
  const res = {
    statusCode: 200,
    _status: 200,
    _body: "",
    _headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      res._headers[name.toLowerCase()] = value;
    },
    end(body?: string) {
      res._status = res.statusCode;
      res._body = body ?? "";
    },
  } as unknown as ServerResponse & {
    _status: number;
    _body: string;
    _headers: Record<string, string>;
  };
  return res;
}

function parseBody(res: { _body: string }): unknown {
  return JSON.parse(res._body);
}

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}` };
}

// ---------- Fixtures ----------

const ECHO_SCRIPT = `
// Simple echo script for integration testing
const args = process.argv.slice(2);
console.log(JSON.stringify({ args, pid: process.pid }));
process.exit(0);
`;

const SLOW_SCRIPT = `
// Script that runs for a while (for cancel testing)
setTimeout(() => {
  console.log("done");
  process.exit(0);
}, 30000);
`;

const TOOL_MANIFEST = {
  name: "echo-tool",
  label: "Echo Tool",
  description: "A simple echo tool for testing",
  category: "testing",
  entrypoint: "echo.js",
  runtime: "node",
  args_schema: {
    message: { type: "string", required: true, label: "Message to echo" },
    format: { type: "enum", values: ["json", "text"], required: false, label: "Output format" },
  },
  env_allowlist: [],
  outputs: [],
  timeout_seconds: 30,
  max_output_bytes: 65536,
};

const SLOW_TOOL_MANIFEST = {
  name: "slow-tool",
  label: "Slow Tool",
  description: "A slow tool for cancel testing",
  category: "testing",
  entrypoint: "slow.js",
  runtime: "node",
  args_schema: {
    delay: { type: "string", required: false, label: "Delay in ms" },
  },
  env_allowlist: [],
  outputs: [],
  timeout_seconds: 60,
  max_output_bytes: 65536,
};

// ---------- Setup ----------

let tools: LoadedTool[];

beforeAll(async () => {
  await mkdir(SUITE_DIR, { recursive: true });
  await writeFile(join(SUITE_DIR, "echo.js"), ECHO_SCRIPT);
  await writeFile(join(SUITE_DIR, "slow.js"), SLOW_SCRIPT);
  await writeFile(join(SUITE_DIR, "tool-echo.json"), JSON.stringify(TOOL_MANIFEST));
  await writeFile(join(SUITE_DIR, "tool-slow.json"), JSON.stringify(SLOW_TOOL_MANIFEST));

  tools = await discoverTools(TOOLS_ROOT);
});

afterAll(async () => {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
});

// ---------- Tests ----------

describe("tool discovery", () => {
  it("discovers test tools from temp directory", () => {
    expect(tools.length).toBe(2);
    const names = tools.map((t) => t.manifest.name).sort();
    expect(names).toEqual(["echo-tool", "slow-tool"]);
  });

  it("resolves tool directories to absolute paths", () => {
    for (const tool of tools) {
      expect(tool.toolDir).toMatch(/^\//);
      expect(tool.manifestPath).toMatch(/^\//);
    }
  });
});

describe("full lifecycle: discover → run → SSE → complete", () => {
  let runner: ToolRunner;
  let handler: ReturnType<typeof createToolHttpHandler>;
  let sseEvents: ToolSSEEvent[];

  beforeEach(() => {
    runner = new ToolRunner({ maxConcurrent: 3 });
    sseEvents = [];
    handler = createToolHttpHandler({
      gatewayToken: TOKEN,
      runner,
      getTools: () => tools,
      onSSE: (event) => sseEvents.push(event),
    });
  });

  it("GET /vwp/tools returns discovered tools", async () => {
    const req = mockReq("GET", "/vwp/tools", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const body = parseBody(res) as { tools: Array<{ name: string }> };
    expect(body.tools.length).toBe(2);
    expect(body.tools.map((t) => t.name).sort()).toEqual(["echo-tool", "slow-tool"]);
  });

  it("POST run → SSE events → GET run shows completed", async () => {
    // Start a run (body emitted via nextTick)
    const req = mockReq("POST", "/vwp/tools/echo-tool/run", authHeaders(), {
      message: "hello world",
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(202);
    const { runId } = parseBody(res) as { runId: string };
    expect(runId).toBeTruthy();

    // Wait for the run to complete
    await runner.waitForRun(runId);

    // Check SSE events were emitted
    const eventTypes = sseEvents.map((e) => e.type);
    expect(eventTypes).toContain("tool_run_started");
    expect(eventTypes).toContain("tool_run_completed");

    // The started event should contain run info
    const startEvent = sseEvents.find((e) => e.type === "tool_run_started") as Extract<
      ToolSSEEvent,
      { type: "tool_run_started" }
    >;
    expect(startEvent.run.toolName).toBe("echo-tool");
    expect(startEvent.run.status).toBe("running");

    // The completed event should have exit code 0
    const completeEvent = sseEvents.find((e) => e.type === "tool_run_completed") as Extract<
      ToolSSEEvent,
      { type: "tool_run_completed" }
    >;
    expect(completeEvent.exitCode).toBe(0);

    // GET /vwp/tools/runs/:runId should show completed
    const detailReq = mockReq("GET", `/vwp/tools/runs/${runId}`, authHeaders());
    const detailRes = mockRes();
    await handler(detailReq, detailRes);
    expect(detailRes._status).toBe(200);
    const detail = parseBody(detailRes) as { run: { runId: string; status: string } };
    expect(detail.run.status).toBe("completed");
  });

  it("SSE output events contain tool stdout", async () => {
    const req = mockReq("POST", "/vwp/tools/echo-tool/run", authHeaders(), {
      message: "test-output",
    });
    const res = mockRes();
    await handler(req, res);
    const { runId } = parseBody(res) as { runId: string };

    await runner.waitForRun(runId);

    // Check for stdout output events
    const outputEvents = sseEvents.filter(
      (e) => e.type === "tool_run_output" && (e as any).stream === "stdout",
    );
    expect(outputEvents.length).toBeGreaterThan(0);
    const fullOutput = outputEvents.map((e) => (e as any).chunk).join("");
    expect(fullOutput).toContain("test-output");
  });
});

describe("arg validation rejects bad input before spawning", () => {
  let runner: ToolRunner;
  let handler: ReturnType<typeof createToolHttpHandler>;

  beforeEach(() => {
    runner = new ToolRunner({ maxConcurrent: 3 });
    handler = createToolHttpHandler({
      gatewayToken: TOKEN,
      runner,
      getTools: () => tools,
    });
  });

  it("rejects missing required arg", async () => {
    const req = mockReq("POST", "/vwp/tools/echo-tool/run", authHeaders(), { format: "json" });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((parseBody(res) as { error: string }).error).toContain("message");
    expect(runner.getActiveRuns()).toHaveLength(0);
  });

  it("rejects invalid enum value", async () => {
    const req = mockReq("POST", "/vwp/tools/echo-tool/run", authHeaders(), {
      message: "hi",
      format: "yaml",
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((parseBody(res) as { error: string }).error).toContain("format");
  });

  it("rejects unknown args", async () => {
    const req = mockReq("POST", "/vwp/tools/echo-tool/run", authHeaders(), {
      message: "hi",
      hackerArg: "evil",
    });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect((parseBody(res) as { error: string }).error).toContain("hackerArg");
  });
});

describe("cancel run stops the subprocess", () => {
  it("cancels a running tool", async () => {
    const runner = new ToolRunner({ maxConcurrent: 3 });
    const sseEvents: ToolSSEEvent[] = [];
    const handler = createToolHttpHandler({
      gatewayToken: TOKEN,
      runner,
      getTools: () => tools,
      onSSE: (event) => sseEvents.push(event),
    });

    // Start slow tool (body emitted via nextTick)
    const runReq = mockReq("POST", "/vwp/tools/slow-tool/run", authHeaders(), {});
    const runRes = mockRes();
    await handler(runReq, runRes);
    expect(runRes._status).toBe(202);
    const { runId } = parseBody(runRes) as { runId: string };

    // Verify it's running
    expect(runner.getActiveRuns()).toHaveLength(1);

    // Cancel it
    const cancelReq = mockReq("DELETE", `/vwp/tools/runs/${runId}`, authHeaders());
    const cancelRes = mockRes();
    await handler(cancelReq, cancelRes);
    expect(cancelRes._status).toBe(200);
    expect(parseBody(cancelRes)).toEqual({ cancelled: true });

    // Wait for process to exit
    await runner.waitForRun(runId);

    // SSE should have cancel event
    const cancelEvent = sseEvents.find((e) => e.type === "tool_run_cancelled");
    expect(cancelEvent).toBeTruthy();

    // Run should no longer be active
    expect(runner.getActiveRuns()).toHaveLength(0);
  });
});

describe("concurrency limit enforced", () => {
  it("rejects 4th concurrent run with 429", async () => {
    const runner = new ToolRunner({ maxConcurrent: 3 });
    const handler = createToolHttpHandler({
      gatewayToken: TOKEN,
      runner,
      getTools: () => tools,
    });

    // Start 3 slow tools
    const runIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const req = mockReq("POST", "/vwp/tools/slow-tool/run", authHeaders(), {});
      const res = mockRes();
      await handler(req, res);
      expect(res._status).toBe(202);
      const body = parseBody(res) as { runId: string };
      runIds.push(body.runId);
    }

    expect(runner.getActiveRuns()).toHaveLength(3);

    // 4th should fail with 429 — this doesn't need a body since the concurrency check happens
    // before readBody in the handler. But the tool lookup happens first, so we need a known tool.
    // The 429 comes from ToolRunner.start() throwing, which happens after readBody.
    const req = mockReq("POST", "/vwp/tools/slow-tool/run", authHeaders(), {});
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(429);
    const body = parseBody(res) as { code: string };
    expect(body.code).toBe("CONCURRENCY_LIMIT");

    // Cleanup: cancel all
    await runner.cancelAll();
    for (const runId of runIds) {
      await runner.waitForRun(runId);
    }
  });
});

describe("unknown tool", () => {
  it("returns 404 for nonexistent tool", async () => {
    const runner = new ToolRunner({ maxConcurrent: 3 });
    const handler = createToolHttpHandler({
      gatewayToken: TOKEN,
      runner,
      getTools: () => tools,
    });

    const req = mockReq("POST", "/vwp/tools/nonexistent/run", authHeaders(), { message: "hi" });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });
});

describe("auth required on all endpoints", () => {
  let handler: ReturnType<typeof createToolHttpHandler>;

  beforeEach(() => {
    const runner = new ToolRunner({ maxConcurrent: 3 });
    handler = createToolHttpHandler({
      gatewayToken: TOKEN,
      runner,
      getTools: () => tools,
    });
  });

  const endpoints = [
    { method: "GET", url: "/vwp/tools" },
    { method: "GET", url: "/vwp/tools/runs" },
    { method: "GET", url: "/vwp/tools/runs/some-id" },
    { method: "DELETE", url: "/vwp/tools/runs/some-id" },
  ];

  for (const { method, url } of endpoints) {
    it(`${method} ${url} requires auth`, async () => {
      const req = mockReq(method, url); // no auth headers
      const res = mockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
    });
  }

  it("POST /vwp/tools/echo-tool/run requires auth", async () => {
    const req = mockReq("POST", "/vwp/tools/echo-tool/run", {}, { message: "test" });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });
});

describe("GET /vwp/tools/runs returns active + completed", () => {
  it("lists runs after a tool completes", async () => {
    const runner = new ToolRunner({ maxConcurrent: 3 });
    const handler = createToolHttpHandler({
      gatewayToken: TOKEN,
      runner,
      getTools: () => tools,
    });

    // Start and complete a run
    const runReq = mockReq("POST", "/vwp/tools/echo-tool/run", authHeaders(), {
      message: "listing-test",
    });
    const runRes = mockRes();
    await handler(runReq, runRes);
    const { runId } = parseBody(runRes) as { runId: string };
    await runner.waitForRun(runId);

    // List runs
    const listReq = mockReq("GET", "/vwp/tools/runs", authHeaders());
    const listRes = mockRes();
    await handler(listReq, listRes);
    expect(listRes._status).toBe(200);
    const body = parseBody(listRes) as { active: unknown[]; completed: unknown[] };
    expect(body.completed.length).toBeGreaterThanOrEqual(1);
  });
});
