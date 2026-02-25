import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCronHttpHandler } from "./cron-routes.js";
import type { IncomingMessage, ServerResponse } from "node:http";

function mockReq(
  method: string,
  url: string,
  body?: string,
): IncomingMessage {
  const req = {
    method,
    url,
    headers: { authorization: "Bearer test-token" },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "data" && body) {
        cb(Buffer.from(body));
      }
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

  // 1. Returns false for non-cron routes
  it("returns false for non-cron routes", async () => {
    const req = mockReq("GET", "/vwp/chat/status");
    const res = mockRes();
    expect(await handler(req, res)).toBe(false);
  });

  // 2. GET /vwp/cron/jobs returns job list from gateway.call("cron.list")
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

  // 3. GET /vwp/cron/status returns status
  it("GET /vwp/cron/status returns cron status", async () => {
    const status = { enabled: true, jobs: 3, nextWakeAtMs: 1234 };
    mockGateway.call.mockResolvedValue(status);

    const req = mockReq("GET", "/vwp/cron/status");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("cron.status", {});
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual(status);
  });

  // 4. Returns 503 when gateway disconnected
  it("returns 503 when gateway disconnected", async () => {
    mockGateway.isConnected.mockReturnValue(false);

    const req = mockReq("GET", "/vwp/cron/jobs");
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(503);
    expect(JSON.parse(res._body)).toEqual({ error: "Gateway not connected" });
  });

  // 5. Returns 401 without valid token
  it("returns 401 without valid token", async () => {
    const req = mockReq("GET", "/vwp/cron/jobs");
    (req.headers as Record<string, string>).authorization = "Bearer wrong-token";
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(401);
    expect(JSON.parse(res._body)).toEqual({ error: "Unauthorized" });
  });

  // 6. POST /vwp/cron/jobs calls gateway.call("cron.add") with body
  it("POST /vwp/cron/jobs calls cron.add with body", async () => {
    const newJob = { name: "Daily report", schedule: "0 9 * * *" };
    const created = { id: "job-abc", ...newJob };
    mockGateway.call.mockResolvedValue(created);

    const req = mockReq("POST", "/vwp/cron/jobs", JSON.stringify(newJob));
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("cron.add", newJob);
    expect(res._status).toBe(201);
    expect(JSON.parse(res._body)).toEqual(created);
  });

  // 7. PATCH /vwp/cron/jobs/:id calls gateway.call("cron.update") with { id, patch }
  it("PATCH /vwp/cron/jobs/:id calls cron.update with id and patch", async () => {
    const patch = { enabled: false };
    const updated = { id: "job-123", enabled: false };
    mockGateway.call.mockResolvedValue(updated);

    const req = mockReq("PATCH", "/vwp/cron/jobs/job-123", JSON.stringify(patch));
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("cron.update", {
      id: "job-123",
      patch,
    });
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual(updated);
  });

  // 8. DELETE /vwp/cron/jobs/:id calls gateway.call("cron.remove")
  it("DELETE /vwp/cron/jobs/:id calls cron.remove", async () => {
    const result = { removed: true };
    mockGateway.call.mockResolvedValue(result);

    const req = mockReq("DELETE", "/vwp/cron/jobs/job-456");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("cron.remove", { id: "job-456" });
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual(result);
  });

  // 9. POST /vwp/cron/jobs/:id/run calls gateway.call("cron.run")
  it("POST /vwp/cron/jobs/:id/run calls cron.run with force mode", async () => {
    const result = { runId: "run-xyz", started: true };
    mockGateway.call.mockResolvedValue(result);

    const req = mockReq("POST", "/vwp/cron/jobs/job-789/run");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("cron.run", {
      id: "job-789",
      mode: "force",
    });
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual(result);
  });

  // 10. GET /vwp/cron/jobs/:id/runs calls gateway.call("cron.runs")
  it("GET /vwp/cron/jobs/:id/runs calls cron.runs", async () => {
    const runs = [{ runId: "r1", status: "success", startedAt: 1000 }];
    mockGateway.call.mockResolvedValue({ runs });

    const req = mockReq("GET", "/vwp/cron/jobs/job-abc/runs?limit=10");
    const res = mockRes();
    await handler(req, res);

    expect(mockGateway.call).toHaveBeenCalledWith("cron.runs", { id: "job-abc", limit: 10 });
    expect(res._status).toBe(200);
    expect(JSON.parse(res._body)).toEqual({ runs });
  });
});
