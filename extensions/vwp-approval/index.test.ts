import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalDB } from "./db.js";
import { createMessageSendingHook, type ApprovalHookConfig } from "./hook.js";
import { createApprovalHttpHandler } from "./routes.js";
import { ApprovalSSE } from "./sse.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vwp-approval-test-"));
  return path.join(dir, "test.sqlite");
}

const TEST_TOKEN = "test-gateway-token-abc123";

function fakeReq(
  method: string,
  url: string,
  body?: string,
  headers?: Record<string, string>,
): http.IncomingMessage {
  const { Readable } = require("node:stream");
  const readable = new Readable();
  readable.push(body ?? null);
  readable.push(null);
  Object.assign(readable, {
    method,
    url,
    headers: {
      authorization: `Bearer ${TEST_TOKEN}`,
      ...headers,
    },
  });
  return readable as http.IncomingMessage;
}

function fakeReqNoAuth(method: string, url: string, body?: string): http.IncomingMessage {
  const { Readable } = require("node:stream");
  const readable = new Readable();
  readable.push(body ?? null);
  readable.push(null);
  Object.assign(readable, { method, url, headers: {} });
  return readable as http.IncomingMessage;
}

function fakeRes(): http.ServerResponse & { _body: string; _status: number } {
  const res = {
    statusCode: 200,
    _body: "",
    _status: 200,
    _headers: {} as Record<string, string>,
    headersSent: false,
    setHeader(name: string, value: string) {
      res._headers[name.toLowerCase()] = value;
    },
    end(data?: string) {
      res._body = data ?? "";
      res._status = res.statusCode;
    },
  };
  return res as unknown as http.ServerResponse & { _body: string; _status: number };
}

// ---------------------------------------------------------------------------
// DB tests
// ---------------------------------------------------------------------------

describe("ApprovalDB", () => {
  let dbPath: string;
  let db: ApprovalDB;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = new ApprovalDB(dbPath);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("stores and retrieves pending messages", () => {
    const msg = db.addPending({
      to: "+1234567890",
      content: "Hello!",
      channel: "whatsapp",
      sessionKey: "session-1",
      agentId: "agent-1",
    });

    expect(msg.status).toBe("pending");
    expect(msg.to).toBe("+1234567890");
    expect(msg.edited_content).toBeNull();

    const result = db.getPending();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(msg.id);
    expect(result.items[0].content).toBe("Hello!");
    expect(result.total).toBe(1);
  });

  it("filters pending by channel", () => {
    db.addPending({ to: "a", content: "wa msg", channel: "whatsapp" });
    db.addPending({ to: "b", content: "tg msg", channel: "telegram" });

    const waResult = db.getPending({ channel: "whatsapp" });
    expect(waResult.items).toHaveLength(1);
    expect(waResult.items[0].content).toBe("wa msg");
    expect(waResult.total).toBe(1);

    const tgResult = db.getPending({ channel: "telegram" });
    expect(tgResult.items).toHaveLength(1);
    expect(tgResult.items[0].content).toBe("tg msg");
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      db.addPending({ to: "user", content: `msg-${i}` });
    }

    const result = db.getPending({ limit: 3 });
    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(10);
  });

  it("supports pagination with offset", () => {
    for (let i = 0; i < 10; i++) {
      db.addPending({ to: "user", content: `msg-${i}` });
    }

    const page1 = db.getPending({ limit: 3, offset: 0 });
    expect(page1.items).toHaveLength(3);
    expect(page1.items[0].content).toBe("msg-0");
    expect(page1.total).toBe(10);
    expect(page1.offset).toBe(0);

    const page2 = db.getPending({ limit: 3, offset: 3 });
    expect(page2.items).toHaveLength(3);
    expect(page2.items[0].content).toBe("msg-3");
    expect(page2.offset).toBe(3);

    const lastPage = db.getPending({ limit: 3, offset: 9 });
    expect(lastPage.items).toHaveLength(1);
    expect(lastPage.items[0].content).toBe("msg-9");
  });

  it("approves a pending message", () => {
    const msg = db.addPending({ to: "user", content: "test" });

    const result = db.approve(msg.id);
    expect(result).toBe(true);

    const fetched = db.getById(msg.id);
    expect(fetched?.status).toBe("approved");

    // Should no longer appear in pending list
    const pending = db.getPending();
    expect(pending.items).toHaveLength(0);
    expect(pending.total).toBe(0);
  });

  it("approves with editedContent and persists it to DB", () => {
    const msg = db.addPending({ to: "user", content: "original" });

    const result = db.approve(msg.id, "edited version");
    expect(result).toBe(true);

    const fetched = db.getById(msg.id);
    expect(fetched?.status).toBe("approved");
    expect(fetched?.edited_content).toBe("edited version");
    expect(fetched?.content).toBe("original"); // original preserved
  });

  it("rejects a pending message", () => {
    const msg = db.addPending({ to: "user", content: "test" });

    const result = db.reject(msg.id);
    expect(result).toBe(true);

    const fetched = db.getById(msg.id);
    expect(fetched?.status).toBe("rejected");
  });

  it("returns false when approving non-pending message", () => {
    const msg = db.addPending({ to: "user", content: "test" });
    db.approve(msg.id);

    // Second approve should return false
    expect(db.approve(msg.id)).toBe(false);
  });

  it("stores auto_approved messages", () => {
    const msg = db.addPending({
      to: "user",
      content: "auto-msg",
      channel: "whatsapp",
      status: "auto_approved",
    });

    expect(msg.status).toBe("auto_approved");

    const fetched = db.getById(msg.id);
    expect(fetched?.status).toBe("auto_approved");

    // auto_approved should NOT appear in pending list
    const pending = db.getPending();
    expect(pending.items).toHaveLength(0);
  });

  it("returns correct stats including auto_approved", () => {
    db.addPending({ to: "a", content: "m1", channel: "whatsapp" });
    db.addPending({ to: "b", content: "m2", channel: "whatsapp" });
    db.addPending({ to: "c", content: "m3", channel: "telegram" });
    db.addPending({ to: "d", content: "m4", channel: "whatsapp", status: "auto_approved" });

    const pending = db.getPending({ channel: "whatsapp" });
    db.approve(pending.items[0].id);

    const stats = db.getStats();
    expect(stats).toHaveLength(2);

    const waStats = stats.find((s) => s.channel === "whatsapp");
    expect(waStats?.total).toBe(3);
    expect(waStats?.approved).toBe(1);
    expect(waStats?.pending).toBe(1);
    expect(waStats?.auto_approved).toBe(1);

    const tgStats = stats.find((s) => s.channel === "telegram");
    expect(tgStats?.total).toBe(1);
    expect(tgStats?.pending).toBe(1);
  });

  it("getById returns undefined for non-existent id", () => {
    expect(db.getById("non-existent")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Hook tests
// ---------------------------------------------------------------------------

describe("message_sending hook", () => {
  let dbPath: string;
  let db: ApprovalDB;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = new ApprovalDB(dbPath);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("cancels and queues messages when enabled", () => {
    const hook = createMessageSendingHook({
      db,
      getConfig: () => ({ enabled: true, autoApprovePatterns: [] }),
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    const result = hook(
      { to: "+1234567890", content: "Hello customer" },
      { channelId: "whatsapp" },
    );

    expect(result).toEqual({ cancel: true });
    expect(db.getPending().items).toHaveLength(1);
  });

  it("passes through when disabled", () => {
    const hook = createMessageSendingHook({
      db,
      getConfig: () => ({ enabled: false, autoApprovePatterns: [] }),
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    const result = hook({ to: "+1234567890", content: "Hello" }, { channelId: "whatsapp" });

    expect(result).toBeUndefined();
    expect(db.getPending().items).toHaveLength(0);
  });

  it("auto-approves messages matching patterns and logs to DB", () => {
    const hook = createMessageSendingHook({
      db,
      getConfig: () => ({
        enabled: true,
        autoApprovePatterns: [/^Thanks for your order/, /Your order .* has shipped/],
      }),
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    const result1 = hook(
      { to: "user", content: "Thanks for your order #123" },
      { channelId: "whatsapp" },
    );
    expect(result1).toBeUndefined();
    // Auto-approved messages are now stored in DB
    const all = db.getPending(); // getPending only returns status='pending'
    expect(all.items).toHaveLength(0);

    // But they should be retrievable by ID
    const stats = db.getStats();
    const waStats = stats.find((s) => s.channel === "whatsapp");
    expect(waStats?.auto_approved).toBe(1);

    const result2 = hook(
      { to: "user", content: "Your order ABC has shipped" },
      { channelId: "whatsapp" },
    );
    expect(result2).toBeUndefined();

    const stats2 = db.getStats();
    const waStats2 = stats2.find((s) => s.channel === "whatsapp");
    expect(waStats2?.auto_approved).toBe(2);
  });

  it("queues messages that don't match auto-approve patterns", () => {
    const hook = createMessageSendingHook({
      db,
      getConfig: () => ({
        enabled: true,
        autoApprovePatterns: [/^Thanks for your order/],
      }),
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    const result = hook(
      { to: "user", content: "Custom message that needs review" },
      { channelId: "whatsapp" },
    );

    expect(result).toEqual({ cancel: true });
    expect(db.getPending().items).toHaveLength(1);
    expect(db.getPending().items[0].content).toBe("Custom message that needs review");
  });

  it("stores channel and context metadata", () => {
    const hook = createMessageSendingHook({
      db,
      getConfig: () => ({ enabled: true, autoApprovePatterns: [] }),
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    hook(
      { to: "+1234567890", content: "msg" },
      { channelId: "telegram", conversationId: "conv-1", accountId: "acct-1" },
    );

    const pending = db.getPending();
    expect(pending.items[0].channel).toBe("telegram");
    expect(pending.items[0].session_key).toBe("conv-1");
    expect(pending.items[0].agent_id).toBe("acct-1");
  });
});

// ---------------------------------------------------------------------------
// HTTP route tests
// ---------------------------------------------------------------------------

describe("HTTP routes", () => {
  let dbPath: string;
  let db: ApprovalDB;
  let sse: ApprovalSSE;
  let onApproved: ReturnType<typeof vi.fn>;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean>;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = new ApprovalDB(dbPath);
    sse = new ApprovalSSE();
    onApproved = vi.fn();
    handler = createApprovalHttpHandler({
      db,
      sse,
      gatewayToken: TEST_TOKEN,
      onApproved,
    });
  });

  afterEach(() => {
    sse.closeAll();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  // Auth tests
  it("returns 401 for requests without auth token", async () => {
    db.addPending({ to: "user1", content: "msg1", channel: "whatsapp" });

    const req = fakeReqNoAuth("GET", "/vwp/pending");
    const res = fakeRes();
    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res._status).toBe(401);
    const body = JSON.parse(res._body);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 for requests with wrong token", async () => {
    const req = fakeReq("GET", "/vwp/pending", undefined, {
      authorization: "Bearer wrong-token",
    });
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(401);
  });

  it("GET /vwp/pending returns pending messages with pagination", async () => {
    for (let i = 0; i < 5; i++) {
      db.addPending({ to: `user${i}`, content: `msg${i}`, channel: "whatsapp" });
    }

    const req = fakeReq("GET", "/vwp/pending?limit=2&offset=0");
    const res = fakeRes();
    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(res._status).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.messages).toHaveLength(2);
    expect(body.total).toBe(5);
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(2);
    expect(body.hasMore).toBe(true);
  });

  it("GET /vwp/pending returns hasMore=false for last page", async () => {
    for (let i = 0; i < 3; i++) {
      db.addPending({ to: `user${i}`, content: `msg${i}` });
    }

    const req = fakeReq("GET", "/vwp/pending?limit=10");
    const res = fakeRes();
    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.messages).toHaveLength(3);
    expect(body.hasMore).toBe(false);
  });

  it("GET /vwp/pending filters by channel", async () => {
    db.addPending({ to: "user1", content: "msg1", channel: "whatsapp" });
    db.addPending({ to: "user2", content: "msg2", channel: "telegram" });

    const req = fakeReq("GET", "/vwp/pending?channel=whatsapp");
    const res = fakeRes();
    await handler(req, res);

    const body = JSON.parse(res._body);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].channel).toBe("whatsapp");
  });

  it("POST /vwp/approve/:id approves a message", async () => {
    const msg = db.addPending({ to: "user", content: "original", channel: "whatsapp" });

    const req = fakeReq("POST", `/vwp/approve/${msg.id}`, "{}");
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.status).toBe("approved");
    expect(body.content).toBe("original");

    expect(db.getById(msg.id)?.status).toBe("approved");
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it("POST /vwp/approve/:id with edited content persists to DB", async () => {
    const msg = db.addPending({ to: "user", content: "original", channel: "whatsapp" });

    const req = fakeReq(
      "POST",
      `/vwp/approve/${msg.id}`,
      JSON.stringify({ editedContent: "edited version" }),
    );
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.content).toBe("edited version");

    // editedContent should be persisted in DB
    const fetched = db.getById(msg.id);
    expect(fetched?.edited_content).toBe("edited version");
    expect(fetched?.content).toBe("original");

    // onApproved should be called with edited content
    expect(onApproved).toHaveBeenCalledWith(
      expect.objectContaining({ id: msg.id }),
      "edited version",
    );
  });

  it("POST /vwp/approve/:id returns 404 for unknown id", async () => {
    const req = fakeReq("POST", "/vwp/approve/unknown-id", "{}");
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(404);
  });

  it("POST /vwp/approve/:id returns 409 for already approved", async () => {
    const msg = db.addPending({ to: "user", content: "test" });
    db.approve(msg.id);

    const req = fakeReq("POST", `/vwp/approve/${msg.id}`, "{}");
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(409);
  });

  it("POST /vwp/reject/:id rejects a message", async () => {
    const msg = db.addPending({ to: "user", content: "test" });

    const req = fakeReq(
      "POST",
      `/vwp/reject/${msg.id}`,
      JSON.stringify({ reason: "inappropriate" }),
    );
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.status).toBe("rejected");
    expect(body.reason).toBe("inappropriate");

    expect(db.getById(msg.id)?.status).toBe("rejected");
  });

  it("POST /vwp/reject/:id returns 404 for unknown id", async () => {
    const req = fakeReq("POST", "/vwp/reject/unknown-id", "{}");
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(404);
  });

  it("GET /vwp/stats returns stats by channel", async () => {
    db.addPending({ to: "a", content: "m1", channel: "whatsapp" });
    db.addPending({ to: "b", content: "m2", channel: "whatsapp" });
    const msg = db.addPending({ to: "c", content: "m3", channel: "telegram" });
    db.approve(msg.id);

    const req = fakeReq("GET", "/vwp/stats");
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.stats).toHaveLength(2);

    const waStats = body.stats.find((s: { channel: string }) => s.channel === "whatsapp");
    expect(waStats.total).toBe(2);
    expect(waStats.pending).toBe(2);

    const tgStats = body.stats.find((s: { channel: string }) => s.channel === "telegram");
    expect(tgStats.total).toBe(1);
    expect(tgStats.approved).toBe(1);
  });

  it("returns false for unmatched routes", async () => {
    const req = fakeReq("GET", "/other/path");
    const res = fakeRes();
    const handled = await handler(req, res);

    expect(handled).toBe(false);
  });

  it("rejects oversized request body with 413", async () => {
    const msg = db.addPending({ to: "user", content: "test" });

    // Create a body larger than 64KB
    const largeBody = "x".repeat(65 * 1024);
    const { Readable } = require("node:stream");
    const readable = new Readable({
      read() {
        this.push(Buffer.from(largeBody));
        this.push(null);
      },
    });
    Object.assign(readable, {
      method: "POST",
      url: `/vwp/approve/${msg.id}`,
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
      destroy: vi.fn(),
    });

    const res = fakeRes();
    await handler(readable as http.IncomingMessage, res);

    expect(res._status).toBe(413);
    const body = JSON.parse(res._body);
    expect(body.error).toBe("Request body too large");
  });
});

// ---------------------------------------------------------------------------
// SSE tests
// ---------------------------------------------------------------------------

describe("ApprovalSSE", () => {
  it("tracks connections and emits events", () => {
    const sse = new ApprovalSSE();

    const writes: string[] = [];
    const fakeConn = {
      writeHead: vi.fn(),
      write: vi.fn((data: string) => writes.push(data)),
      on: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const added = sse.addConnection(fakeConn);
    expect(added).toBe(true);
    expect(sse.connectionCount).toBe(1);

    // Should have sent connected event
    expect(writes.some((w) => w.includes("event: connected"))).toBe(true);

    // Emit an event
    sse.emit({ type: "message_approved", id: "test-id", content: "hello" });

    // Should have received the event
    expect(writes.some((w) => w.includes("event: message_approved"))).toBe(true);
    expect(writes.some((w) => w.includes("test-id"))).toBe(true);

    sse.closeAll();
    expect(sse.connectionCount).toBe(0);
  });

  it("limits concurrent SSE connections", () => {
    const sse = new ApprovalSSE();

    // Add 5 connections (the max)
    for (let i = 0; i < 5; i++) {
      const conn = {
        writeHead: vi.fn(),
        write: vi.fn(),
        on: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;
      expect(sse.addConnection(conn)).toBe(true);
    }

    // 6th should fail
    const conn6 = {
      writeHead: vi.fn(),
      write: vi.fn(),
      on: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;
    expect(sse.addConnection(conn6)).toBe(false);
    expect(sse.connectionCount).toBe(5);

    sse.closeAll();
  });
});
