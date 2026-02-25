import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import type { GatewayClient } from "./gateway-client.js";
import { createUsageHttpHandler, type UsageRoutesDeps } from "./usage-routes.js";

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

function parseBody(res: { _body: string }): unknown {
  return JSON.parse(res._body);
}

// ---------- Fixtures ----------

const VALID_TOKEN = "test-secret-token-abc123";

function makeGateway(overrides?: {
  isConnected?: boolean;
  callResult?: unknown;
  callError?: Error;
}): GatewayClient & { call: ReturnType<typeof vi.fn> } {
  const connected = overrides?.isConnected ?? true;
  const callResult = overrides?.callResult ?? { ok: true };
  const callError = overrides?.callError;

  return {
    isConnected: vi.fn().mockReturnValue(connected),
    call: callError
      ? vi.fn().mockRejectedValue(callError)
      : vi.fn().mockResolvedValue(callResult),
  } as unknown as GatewayClient & { call: ReturnType<typeof vi.fn> };
}

function makeDeps(overrides?: Partial<UsageRoutesDeps>): UsageRoutesDeps {
  return {
    gatewayToken: VALID_TOKEN,
    gateway: makeGateway(),
    ...overrides,
  };
}

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${VALID_TOKEN}` };
}

// ---------- Tests ----------

describe("createUsageHttpHandler — route matching", () => {
  it("returns false for non-matching routes", async () => {
    const handler = createUsageHttpHandler(makeDeps());
    const req = mockReq("GET", "/some/other/path");
    const res = mockRes();
    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });

  it("returns false for /vwp/dispatch routes", async () => {
    const handler = createUsageHttpHandler(makeDeps());
    const req = mockReq("GET", "/vwp/dispatch/board", authHeaders());
    const res = mockRes();
    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });

  it("returns false for non-GET methods on matching routes", async () => {
    const handler = createUsageHttpHandler(makeDeps());
    const req = mockReq("POST", "/vwp/health", authHeaders());
    const res = mockRes();
    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });

  it("returns false for DELETE on /vwp/usage/cost", async () => {
    const handler = createUsageHttpHandler(makeDeps());
    const req = mockReq("DELETE", "/vwp/usage/cost", authHeaders());
    const res = mockRes();
    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });
});

describe("auth", () => {
  it("returns 401 when no auth token provided", async () => {
    const handler = createUsageHttpHandler(makeDeps());
    const req = mockReq("GET", "/vwp/health");
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
    expect(parseBody(res)).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when wrong token provided", async () => {
    const handler = createUsageHttpHandler(makeDeps());
    const req = mockReq("GET", "/vwp/health", { authorization: "Bearer wrong-token" });
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 401 when gatewayToken is undefined (fail-closed)", async () => {
    const handler = createUsageHttpHandler(makeDeps({ gatewayToken: undefined }));
    const req = mockReq("GET", "/vwp/health", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 401 when gatewayToken is empty string (fail-closed)", async () => {
    const handler = createUsageHttpHandler(
      makeDeps({ gatewayToken: "" as unknown as undefined }),
    );
    const req = mockReq("GET", "/vwp/health", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });
});

describe("503 when gateway disconnected", () => {
  it("returns 503 on /vwp/health when gateway not connected", async () => {
    const gateway = makeGateway({ isConnected: false });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/health", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(503);
    expect(parseBody(res)).toEqual({ error: "Gateway not connected" });
  });

  it("returns 503 on /vwp/usage/cost when gateway not connected", async () => {
    const gateway = makeGateway({ isConnected: false });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/usage/cost", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(503);
  });

  it("returns 503 on /vwp/sessions when gateway not connected", async () => {
    const gateway = makeGateway({ isConnected: false });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/sessions", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(503);
  });
});

describe("gateway factory function support", () => {
  it("accepts gateway as a factory function", async () => {
    const gw = makeGateway({ callResult: { status: "ok" } });
    const handler = createUsageHttpHandler({
      gatewayToken: VALID_TOKEN,
      gateway: () => gw,
    });
    const req = mockReq("GET", "/vwp/health", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });
});

describe("GET /vwp/usage/cost", () => {
  it("returns cost summary", async () => {
    const costData = { totalUsd: 12.5, sessions: 42 };
    const gateway = makeGateway({ callResult: costData });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/usage/cost", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(costData);
    expect(gateway.call).toHaveBeenCalledWith("usage.cost", {});
  });

  it("passes days param as integer", async () => {
    const gateway = makeGateway({ callResult: {} });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/usage/cost?days=7", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(gateway.call).toHaveBeenCalledWith("usage.cost", { days: 7 });
  });

  it("passes startDate and endDate params", async () => {
    const gateway = makeGateway({ callResult: {} });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq(
      "GET",
      "/vwp/usage/cost?startDate=2026-01-01&endDate=2026-01-31",
      authHeaders(),
    );
    const res = mockRes();
    await handler(req, res);
    expect(gateway.call).toHaveBeenCalledWith("usage.cost", {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
  });

  it("returns 502 when gateway call throws", async () => {
    const gateway = makeGateway({ callError: new Error("RPC failed") });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/usage/cost", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(502);
    expect(parseBody(res)).toMatchObject({ error: "RPC failed" });
  });
});

describe("GET /vwp/usage/sessions", () => {
  it("returns usage with date range params", async () => {
    const usageData = { sessions: [{ id: "s1", cost: 0.5 }] };
    const gateway = makeGateway({ callResult: usageData });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq(
      "GET",
      "/vwp/usage/sessions?startDate=2026-01-01&endDate=2026-01-31",
      authHeaders(),
    );
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(usageData);
    expect(gateway.call).toHaveBeenCalledWith("sessions.usage", {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
  });

  it("passes key and limit params", async () => {
    const gateway = makeGateway({ callResult: {} });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq(
      "GET",
      "/vwp/usage/sessions?key=project-x&limit=20",
      authHeaders(),
    );
    const res = mockRes();
    await handler(req, res);
    expect(gateway.call).toHaveBeenCalledWith("sessions.usage", {
      key: "project-x",
      limit: 20,
    });
  });

  it("returns 502 when gateway call throws", async () => {
    const gateway = makeGateway({ callError: new Error("Usage error") });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/usage/sessions", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(502);
  });
});

describe("GET /vwp/sessions", () => {
  it("returns session list with defaults", async () => {
    const sessionsData = { sessions: [{ id: "s1", title: "Test Session" }] };
    const gateway = makeGateway({ callResult: sessionsData });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/sessions", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(sessionsData);
    expect(gateway.call).toHaveBeenCalledWith("sessions.list", {
      includeDerivedTitles: true,
      includeLastMessage: true,
    });
  });

  it("passes limit param as integer", async () => {
    const gateway = makeGateway({ callResult: {} });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/sessions?limit=50", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(gateway.call).toHaveBeenCalledWith("sessions.list", {
      limit: 50,
      includeDerivedTitles: true,
      includeLastMessage: true,
    });
  });

  it("passes search and activeMinutes params", async () => {
    const gateway = makeGateway({ callResult: {} });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq(
      "GET",
      "/vwp/sessions?search=project&activeMinutes=30",
      authHeaders(),
    );
    const res = mockRes();
    await handler(req, res);
    expect(gateway.call).toHaveBeenCalledWith("sessions.list", {
      search: "project",
      activeMinutes: 30,
      includeDerivedTitles: true,
      includeLastMessage: true,
    });
  });

  it("returns 502 when gateway call throws", async () => {
    const gateway = makeGateway({ callError: new Error("Sessions error") });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/sessions", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(502);
  });
});

describe("GET /vwp/health", () => {
  it("returns health summary", async () => {
    const healthData = { status: "healthy", uptime: 3600 };
    const gateway = makeGateway({ callResult: healthData });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/health", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(healthData);
    expect(gateway.call).toHaveBeenCalledWith("health", {});
  });

  it("returns 502 when gateway call throws", async () => {
    const gateway = makeGateway({ callError: new Error("Health check failed") });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/health", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(502);
    expect(parseBody(res)).toMatchObject({ error: "Health check failed" });
  });
});

describe("GET /vwp/gateway/status", () => {
  it("returns gateway status", async () => {
    const statusData = { connected: true, protocol: 3 };
    const gateway = makeGateway({ callResult: statusData });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/gateway/status", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(statusData);
    expect(gateway.call).toHaveBeenCalledWith("status", {});
  });

  it("returns 502 when gateway call throws", async () => {
    const gateway = makeGateway({ callError: new Error("Status error") });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/gateway/status", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(502);
  });
});

describe("GET /vwp/gateway/config", () => {
  it("returns config snapshot", async () => {
    const configData = { agents: { maxConcurrent: 4 }, version: "2.1" };
    const gateway = makeGateway({ callResult: configData });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/gateway/config", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(configData);
    expect(gateway.call).toHaveBeenCalledWith("config.get", {});
  });

  it("returns 502 when gateway call throws", async () => {
    const gateway = makeGateway({ callError: new Error("Config error") });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/gateway/config", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(502);
  });
});

describe("GET /vwp/channels/status", () => {
  it("returns channel status without probe flag", async () => {
    const channelData = { channels: [{ id: "main", active: true }] };
    const gateway = makeGateway({ callResult: channelData });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/channels/status", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(channelData);
    expect(gateway.call).toHaveBeenCalledWith("channels.status", { probe: false });
  });

  it("passes probe=true when set in query string", async () => {
    const gateway = makeGateway({ callResult: {} });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/channels/status?probe=true", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(gateway.call).toHaveBeenCalledWith("channels.status", { probe: true });
  });

  it("passes probe=false when set to other value in query string", async () => {
    const gateway = makeGateway({ callResult: {} });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/channels/status?probe=false", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(gateway.call).toHaveBeenCalledWith("channels.status", { probe: false });
  });

  it("returns 502 when gateway call throws", async () => {
    const gateway = makeGateway({ callError: new Error("Channels error") });
    const handler = createUsageHttpHandler(makeDeps({ gateway }));
    const req = mockReq("GET", "/vwp/channels/status", authHeaders());
    const res = mockRes();
    await handler(req, res);
    expect(res._status).toBe(502);
    expect(parseBody(res)).toMatchObject({ error: "Channels error" });
  });
});
