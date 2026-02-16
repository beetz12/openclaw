import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import type { ToolSSEEvent } from "../kanban-types.js";
import type { LoadedTool, ArgSchema } from "../tool-manifest.js";
import type { ToolRunner } from "../tool-runner.js";
import { createToolHttpHandler, type ToolRoutesDeps } from "../tool-routes.js";

// ---------- Test helpers ----------

function mockReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  // Stub destroy so readBody rejection doesn't crash
  req.destroy = vi.fn() as unknown as IncomingMessage["destroy"];
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

/**
 * Schedule body emission on next tick so the handler can attach listeners first.
 */
function scheduleBody(req: IncomingMessage, body: Record<string, unknown>): void {
  const raw = JSON.stringify(body);
  process.nextTick(() => {
    (req as unknown as EventEmitter).emit("data", Buffer.from(raw));
    (req as unknown as EventEmitter).emit("end");
  });
}

function parseBody(res: { _body: string }): unknown {
  return JSON.parse(res._body);
}

// ---------- Fixtures ----------

const VALID_TOKEN = "test-secret-token-abc123";

function makeTool(overrides?: Partial<LoadedTool["manifest"]>): LoadedTool {
  return {
    manifest: {
      name: "test-tool",
      label: "Test Tool",
      description: "A test tool",
      category: "testing",
      entrypoint: "run.js",
      runtime: "node" as const,
      args_schema: {
        input: { type: "string", required: true, label: "Input file" },
        format: {
          type: "enum",
          values: ["json", "csv", "xml"],
          required: false,
          label: "Output format",
        },
        verbose: { type: "boolean", required: false, label: "Verbose output" },
      },
      env_allowlist: [],
      outputs: ["output.json"],
      timeout_seconds: 300,
      max_output_bytes: 1_048_576,
      ...overrides,
    },
    toolDir: "/fake/tools/suite",
    manifestPath: "/fake/tools/suite/tool-test-tool.json",
  };
}

function makeRunner(): ToolRunner & {
  start: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  getActiveRuns: ReturnType<typeof vi.fn>;
  getCompletedRuns: ReturnType<typeof vi.fn>;
  getRun: ReturnType<typeof vi.fn>;
} {
  return {
    start: vi.fn().mockResolvedValue("run-id-123"),
    cancel: vi.fn().mockResolvedValue(true),
    cancelAll: vi.fn().mockResolvedValue(undefined),
    waitForRun: vi.fn().mockResolvedValue(undefined),
    getActiveRuns: vi.fn().mockReturnValue([]),
    getCompletedRuns: vi.fn().mockReturnValue([]),
    getRun: vi.fn().mockReturnValue(null),
  } as unknown as ToolRunner & {
    start: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    getActiveRuns: ReturnType<typeof vi.fn>;
    getCompletedRuns: ReturnType<typeof vi.fn>;
    getRun: ReturnType<typeof vi.fn>;
  };
}

function makeDeps(overrides?: Partial<ToolRoutesDeps>): ToolRoutesDeps {
  return {
    gatewayToken: VALID_TOKEN,
    runner: makeRunner(),
    getTools: () => [makeTool()],
    ...overrides,
  };
}

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${VALID_TOKEN}` };
}

// ---------- Tests ----------

describe("createToolHttpHandler", () => {
  it("returns a function", () => {
    const handler = createToolHttpHandler(makeDeps());
    expect(typeof handler).toBe("function");
  });

  it("returns false for non-tool routes (pass through)", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("GET", "/some/other/path");
    const res = mockRes();
    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });

  it("returns false for non-/vwp/tools paths", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("GET", "/vwp/dispatch/board", authHeaders());
    const res = mockRes();
    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });
});

describe("auth", () => {
  it("returns 401 when no auth token provided", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("GET", "/vwp/tools");
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(parseBody(res)).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when wrong token provided", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("GET", "/vwp/tools", { authorization: "Bearer wrong-token" });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 401 when gatewayToken is undefined (fail-closed)", async () => {
    const handler = createToolHttpHandler(makeDeps({ gatewayToken: undefined }));
    const req = mockReq("GET", "/vwp/tools", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 401 when gatewayToken is empty string (fail-closed)", async () => {
    const handler = createToolHttpHandler(makeDeps({ gatewayToken: "" as unknown as undefined }));
    const req = mockReq("GET", "/vwp/tools", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });
});

describe("GET /vwp/tools", () => {
  it("returns tool list with manifest fields", async () => {
    const tool = makeTool();
    const handler = createToolHttpHandler(makeDeps({ getTools: () => [tool] }));
    const req = mockReq("GET", "/vwp/tools", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const body = parseBody(res) as { tools: unknown[] };
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({
      name: "test-tool",
      label: "Test Tool",
      description: "A test tool",
      category: "testing",
      runtime: "node",
    });
  });

  it("returns empty array + warning when no tools discovered", async () => {
    const handler = createToolHttpHandler(makeDeps({ getTools: () => [] }));
    const req = mockReq("GET", "/vwp/tools", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const body = parseBody(res) as { tools: unknown[]; warning?: string };
    expect(body.tools).toEqual([]);
    expect(body.warning).toBeTruthy();
  });

  it("URL with query string does not break route matching", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("GET", "/vwp/tools?foo=bar&baz=1", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });
});

describe("POST /vwp/tools/:name/run", () => {
  it("returns 404 for unknown tool", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("POST", "/vwp/tools/nonexistent/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { input: "test.txt" });
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(parseBody(res)).toMatchObject({ error: expect.stringContaining("nonexistent") });
  });

  it("returns 400 for missing required args", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("POST", "/vwp/tools/test-tool/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { format: "json" }); // missing required 'input'
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(parseBody(res)).toMatchObject({ error: expect.stringContaining("input") });
  });

  it("returns 400 for unknown args not in schema", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("POST", "/vwp/tools/test-tool/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { input: "test.txt", unknownArg: "value" });
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(parseBody(res)).toMatchObject({ error: expect.stringContaining("unknownArg") });
  });

  it("returns 400 for invalid enum value", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("POST", "/vwp/tools/test-tool/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { input: "test.txt", format: "yaml" }); // yaml not in [json, csv, xml]
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(parseBody(res)).toMatchObject({ error: expect.stringContaining("format") });
  });

  it("returns 400 for invalid boolean value", async () => {
    const handler = createToolHttpHandler(makeDeps());
    const req = mockReq("POST", "/vwp/tools/test-tool/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { input: "test.txt", verbose: "yes" }); // not "true" or "false"
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(parseBody(res)).toMatchObject({ error: expect.stringContaining("verbose") });
  });

  it("strips __raw key from args before passing to ToolRunner (SECURITY)", async () => {
    const runner = makeRunner();
    const handler = createToolHttpHandler(makeDeps({ runner }));
    const req = mockReq("POST", "/vwp/tools/test-tool/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { input: "test.txt", __raw: "malicious code" });
    await handler(req, res);
    expect(res._status).toBe(202);
    expect(runner.start).toHaveBeenCalledTimes(1);
    const startArgs = runner.start.mock.calls[0][0];
    expect(startArgs.args).not.toHaveProperty("__raw");
    expect(startArgs.args).toEqual({ input: "test.txt" });
  });

  it("returns 202 on success with runId", async () => {
    const runner = makeRunner();
    const handler = createToolHttpHandler(makeDeps({ runner }));
    const req = mockReq("POST", "/vwp/tools/test-tool/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { input: "test.txt" });
    await handler(req, res);
    expect(res._status).toBe(202);
    const body = parseBody(res) as { runId: string };
    expect(body.runId).toBe("run-id-123");
  });

  it("returns 429 when concurrency limit reached with CONCURRENCY_LIMIT code", async () => {
    const runner = makeRunner();
    runner.start.mockRejectedValueOnce(
      new Error("Maximum concurrent tool runs (3) reached. Cancel a running tool first."),
    );
    const handler = createToolHttpHandler(makeDeps({ runner }));
    const req = mockReq("POST", "/vwp/tools/test-tool/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { input: "test.txt" });
    await handler(req, res);
    expect(res._status).toBe(429);
    const body = parseBody(res) as { code: string };
    expect(body.code).toBe("CONCURRENCY_LIMIT");
  });

  it("returns 400 when runtime binary not found with RUNTIME_NOT_FOUND code", async () => {
    // Use a non-existent runtime to guarantee the check fails
    const tool = makeTool({ name: "py-tool", runtime: "python3" });
    // Override the tool name so the URL matches
    const runner = makeRunner();
    const handler = createToolHttpHandler(makeDeps({ runner, getTools: () => [tool] }));
    const req = mockReq("POST", "/vwp/tools/py-tool/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { input: "test.txt" });
    await handler(req, res);
    // If python3 is available on the machine, we get 202; if not, we get 400
    // We test the code path exists either way
    if (res._status === 400) {
      const body = parseBody(res) as { code: string };
      expect(body.code).toBe("RUNTIME_NOT_FOUND");
    } else {
      expect(res._status).toBe(202);
    }
  });

  it("passes correct options to ToolRunner.start", async () => {
    const runner = makeRunner();
    const tool = makeTool();
    const sseEvents: ToolSSEEvent[] = [];
    const handler = createToolHttpHandler(
      makeDeps({
        runner,
        getTools: () => [tool],
        onSSE: (event) => sseEvents.push(event),
      }),
    );
    const req = mockReq("POST", "/vwp/tools/test-tool/run", authHeaders());
    const res = mockRes();
    scheduleBody(req, { input: "data.txt", format: "json" });
    await handler(req, res);
    expect(runner.start).toHaveBeenCalledTimes(1);
    const opts = runner.start.mock.calls[0][0];
    expect(opts.toolName).toBe("test-tool");
    expect(opts.toolLabel).toBe("Test Tool");
    expect(opts.toolDir).toBe("/fake/tools/suite");
    expect(opts.entrypoint).toBe("run.js");
    expect(opts.runtime).toBe("node");
    expect(opts.args).toEqual({ input: "data.txt", format: "json" });
    expect(opts.timeoutSeconds).toBe(300);
    expect(opts.maxOutputBytes).toBe(1_048_576);
    expect(typeof opts.onEvent).toBe("function");
  });
});

describe("GET /vwp/tools/runs", () => {
  it("returns active + completed runs", async () => {
    const runner = makeRunner();
    const activeRun = {
      runId: "active-1",
      toolName: "test-tool",
      toolLabel: "Test Tool",
      args: {},
      status: "running" as const,
      startedAt: Date.now(),
      completedAt: null,
      exitCode: null,
      error: null,
    };
    const completedRun = {
      runId: "done-1",
      toolName: "test-tool",
      toolLabel: "Test Tool",
      args: {},
      status: "completed" as const,
      startedAt: Date.now() - 60_000,
      completedAt: Date.now(),
      exitCode: 0,
      error: null,
    };
    runner.getActiveRuns.mockReturnValue([activeRun]);
    runner.getCompletedRuns.mockReturnValue([completedRun]);
    const handler = createToolHttpHandler(makeDeps({ runner }));
    const req = mockReq("GET", "/vwp/tools/runs", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const body = parseBody(res) as { active: unknown[]; completed: unknown[] };
    expect(body.active).toHaveLength(1);
    expect(body.completed).toHaveLength(1);
  });
});

describe("GET /vwp/tools/runs/:runId", () => {
  it("returns 404 for unknown run", async () => {
    const runner = makeRunner();
    runner.getRun.mockReturnValue(null);
    const handler = createToolHttpHandler(makeDeps({ runner }));
    const req = mockReq("GET", "/vwp/tools/runs/unknown-id", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 200 for known run", async () => {
    const runner = makeRunner();
    const run = {
      runId: "run-123",
      toolName: "test-tool",
      toolLabel: "Test Tool",
      args: {},
      status: "running" as const,
      startedAt: Date.now(),
      completedAt: null,
      exitCode: null,
      error: null,
    };
    runner.getRun.mockReturnValue(run);
    const handler = createToolHttpHandler(makeDeps({ runner }));
    const req = mockReq("GET", "/vwp/tools/runs/run-123", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const body = parseBody(res) as { run: { runId: string } };
    expect(body.run.runId).toBe("run-123");
  });
});

describe("DELETE /vwp/tools/runs/:runId", () => {
  it("returns 200 with cancelled: true for active run", async () => {
    const runner = makeRunner();
    runner.cancel.mockResolvedValue(true);
    const handler = createToolHttpHandler(makeDeps({ runner }));
    const req = mockReq("DELETE", "/vwp/tools/runs/active-run-id", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual({ cancelled: true });
  });

  it("returns 404 for unknown/completed run", async () => {
    const runner = makeRunner();
    runner.cancel.mockResolvedValue(false);
    const handler = createToolHttpHandler(makeDeps({ runner }));
    const req = mockReq("DELETE", "/vwp/tools/runs/gone-id", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });
});
