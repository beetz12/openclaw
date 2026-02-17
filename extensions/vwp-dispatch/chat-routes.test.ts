import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ChatSSEEvent } from "./kanban-types.js";

// Mock auth helpers to always pass
vi.mock("../../src/gateway/http-utils.js", () => ({
  getBearerToken: () => "test-token",
}));

vi.mock("../../src/security/secret-equal.js", () => ({
  safeEqualSecret: (a: string, b: string) => a === b,
}));

const { createChatHttpHandler } = await import("./chat-routes.js");
const { ServerChatStore } = await import("./chat-store.js");

const TEST_TOKEN = "test-token";
const FIXTURE_DIR = join(import.meta.dirname!, ".test-chat-route-fixtures");

// Helper to create a mock GatewayClient
function createMockGateway(opts?: { connected?: boolean }) {
  const emitter = new EventEmitter();
  const gw = Object.assign(emitter, {
    isConnected: vi.fn().mockReturnValue(opts?.connected ?? true),
    call: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  });
  return gw;
}

function createMockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { authorization: `Bearer ${TEST_TOKEN}` };

  if (body !== undefined) {
    process.nextTick(() => {
      const buf = Buffer.from(JSON.stringify(body));
      req.emit("data", buf);
      req.emit("end");
    });
  } else {
    process.nextTick(() => req.emit("end"));
  }

  return req;
}

function createMockRes(): ServerResponse & {
  _status: number;
  _body: unknown;
  _headers: Record<string, string>;
} {
  const res = {
    statusCode: 200,
    _status: 200,
    _body: null as unknown,
    _headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this._headers[name.toLowerCase()] = value;
    },
    end(data?: string) {
      this._status = this.statusCode;
      if (data) {
        try {
          this._body = JSON.parse(data);
        } catch {
          this._body = data;
        }
      }
    },
  } as unknown as ServerResponse & {
    _status: number;
    _body: unknown;
    _headers: Record<string, string>;
  };
  return res;
}

describe("chat-routes", () => {
  let chatStore: InstanceType<typeof ServerChatStore>;
  let gateway: ReturnType<typeof createMockGateway>;
  let sseEvents: ChatSSEEvent[];
  let handler: ReturnType<typeof createChatHttpHandler>;

  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });

    chatStore = new ServerChatStore(FIXTURE_DIR);
    gateway = createMockGateway();
    sseEvents = [];

    handler = createChatHttpHandler({
      gatewayToken: TEST_TOKEN,
      gateway: gateway as any,
      chatStore,
      onSSE: (event) => sseEvents.push(event),
    });
  });

  afterEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });

  describe("route matching", () => {
    it("returns false for non-chat routes", async () => {
      const req = createMockReq("GET", "/vwp/dispatch/tasks");
      const res = createMockRes();
      const handled = await handler(req, res);
      expect(handled).toBe(false);
    });

    it("returns false for /vwp/chat without trailing slash", async () => {
      const req = createMockReq("GET", "/vwp/chat");
      const res = createMockRes();
      const handled = await handler(req, res);
      expect(handled).toBe(false);
    });
  });

  describe("POST /vwp/chat/send", () => {
    it("accepts a message and returns 202 with messageId and conversationId", async () => {
      const req = createMockReq("POST", "/vwp/chat/send", {
        message: "Hello, assistant!",
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(202);
      const body = res._body as { messageId: string; conversationId: string };
      expect(body.messageId).toBeDefined();
      expect(body.conversationId).toBeDefined();
    });

    it("uses provided conversationId", async () => {
      const req = createMockReq("POST", "/vwp/chat/send", {
        message: "Hello",
        conversationId: "my-conv-123",
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(202);
      expect((res._body as { conversationId: string }).conversationId).toBe("my-conv-123");
    });

    it("saves user message to chat store", async () => {
      const req = createMockReq("POST", "/vwp/chat/send", {
        message: "Test message",
        conversationId: "conv-save",
      });
      const res = createMockRes();
      await handler(req, res);

      const history = await chatStore.getHistory("conv-save", { limit: 10 });
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("Test message");
    });

    it("calls gateway.call with correct params", async () => {
      const req = createMockReq("POST", "/vwp/chat/send", {
        message: "Build a dashboard",
        conversationId: "conv-gw",
      });
      const res = createMockRes();
      await handler(req, res);

      expect(gateway.call).toHaveBeenCalledWith("chat.send", {
        sessionKey: "conv-gw",
        message: "Build a dashboard",
        idempotencyKey: expect.any(String),
      });
    });

    it("returns 400 for missing message", async () => {
      const req = createMockReq("POST", "/vwp/chat/send", {});
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._body).toMatchObject({ error: "Missing required field: message" });
    });

    it("returns 400 for empty message", async () => {
      const req = createMockReq("POST", "/vwp/chat/send", { message: "   " });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });

    it("returns 400 for invalid JSON", async () => {
      const req = new EventEmitter() as IncomingMessage;
      req.method = "POST";
      req.url = "/vwp/chat/send";
      req.headers = { authorization: `Bearer ${TEST_TOKEN}` };
      process.nextTick(() => {
        req.emit("data", Buffer.from("not json"));
        req.emit("end");
      });

      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._body).toMatchObject({ error: "Invalid JSON body" });
    });

    it("returns 413 for oversized body", async () => {
      const req = new EventEmitter() as IncomingMessage;
      req.method = "POST";
      req.url = "/vwp/chat/send";
      req.headers = { authorization: `Bearer ${TEST_TOKEN}` };
      (req as any).destroy = vi.fn();

      process.nextTick(() => {
        // Emit a chunk larger than MAX_BODY_BYTES (64KB)
        const bigChunk = Buffer.alloc(65 * 1024, "x");
        req.emit("data", bigChunk);
        req.emit("end");
      });

      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(413);
    });

    it("returns 503 when gateway is not connected", async () => {
      gateway.isConnected.mockReturnValue(false);

      const req = createMockReq("POST", "/vwp/chat/send", { message: "Hello" });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(503);
      expect(res._body).toMatchObject({ error: "Gateway not connected" });
    });

    it("emits SSE events for streaming tokens", async () => {
      // Make gateway.call trigger a chat event after being called
      gateway.call.mockImplementation(async () => {
        process.nextTick(() => {
          gateway.emit("chat", {
            state: "delta",
            message: { content: [{ text: "Hello" }] },
          });
          process.nextTick(() => {
            gateway.emit("chat", {
              state: "delta",
              message: { content: [{ text: "Hello world" }] },
            });
            process.nextTick(() => {
              gateway.emit("chat", {
                state: "final",
                message: { content: [{ text: "Hello world!" }] },
              });
            });
          });
        });
      });

      const req = createMockReq("POST", "/vwp/chat/send", {
        message: "Hi",
        conversationId: "conv-stream",
      });
      const res = createMockRes();
      await handler(req, res);

      // Wait for nextTick events to fire
      await new Promise((r) => setTimeout(r, 50));

      expect(sseEvents).toHaveLength(3);
      expect(sseEvents[0]).toMatchObject({ type: "chat_stream_token", token: "Hello" });
      expect(sseEvents[1]).toMatchObject({ type: "chat_stream_token", token: " world" });
      expect(sseEvents[2]).toMatchObject({
        type: "chat_message",
        role: "assistant",
        content: "Hello world!",
        done: true,
      });
    });

    it("emits error SSE on gateway chat error state", async () => {
      gateway.call.mockImplementation(async () => {
        process.nextTick(() => {
          gateway.emit("chat", {
            state: "error",
            message: { content: [{ text: "Something went wrong" }] },
          });
        });
      });

      const req = createMockReq("POST", "/vwp/chat/send", { message: "Hi" });
      const res = createMockRes();
      await handler(req, res);

      await new Promise((r) => setTimeout(r, 50));

      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0]).toMatchObject({
        type: "chat_message",
        content: "Error: Something went wrong",
        done: true,
      });
    });

    it("emits error SSE when gateway.call throws", async () => {
      gateway.call.mockRejectedValue(new Error("RPC failed"));

      const req = createMockReq("POST", "/vwp/chat/send", { message: "Hi" });
      const res = createMockRes();
      await handler(req, res);

      // Still returns 202 because the user message was saved
      expect(res._status).toBe(202);
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0]).toMatchObject({
        type: "chat_message",
        content: "Error: RPC failed",
        done: true,
      });
    });

    it("saves assistant message to store on final", async () => {
      gateway.call.mockImplementation(async () => {
        process.nextTick(() => {
          gateway.emit("chat", {
            state: "final",
            message: { content: [{ text: "I can help!" }] },
          });
        });
      });

      const req = createMockReq("POST", "/vwp/chat/send", {
        message: "Help me",
        conversationId: "conv-persist",
      });
      const res = createMockRes();
      await handler(req, res);

      // Wait for async persistence
      await new Promise((r) => setTimeout(r, 100));

      const history = await chatStore.getHistory("conv-persist", { limit: 10 });
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe("user");
      expect(history[1].role).toBe("assistant");
      expect(history[1].content).toBe("I can help!");
    });
  });

  describe("GET /vwp/chat/history", () => {
    it("returns history for a conversation", async () => {
      await chatStore.appendMessage("conv-hist", {
        id: "msg-1",
        role: "user",
        content: "Hello",
        timestamp: Date.now(),
      });
      await chatStore.appendMessage("conv-hist", {
        id: "msg-2",
        role: "assistant",
        content: "Hi there",
        timestamp: Date.now(),
      });

      const req = createMockReq("GET", "/vwp/chat/history?conversationId=conv-hist");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      const body = res._body as { messages: unknown[] };
      expect(body.messages).toHaveLength(2);
    });

    it("returns 400 when conversationId is missing", async () => {
      const req = createMockReq("GET", "/vwp/chat/history");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._body).toMatchObject({
        error: "Missing required parameter: conversationId",
      });
    });

    it("applies limit param", async () => {
      for (let i = 0; i < 5; i++) {
        await chatStore.appendMessage("conv-lim", {
          id: `msg-${i}`,
          role: "user",
          content: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const req = createMockReq("GET", "/vwp/chat/history?conversationId=conv-lim&limit=2");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      const body = res._body as { messages: unknown[] };
      expect(body.messages).toHaveLength(2);
    });

    it("applies before cursor param", async () => {
      await chatStore.appendMessage("conv-before", {
        id: "m1",
        role: "user",
        content: "First",
        timestamp: Date.now(),
      });
      await chatStore.appendMessage("conv-before", {
        id: "m2",
        role: "user",
        content: "Second",
        timestamp: Date.now(),
      });

      const req = createMockReq("GET", "/vwp/chat/history?conversationId=conv-before&before=m2");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      const body = res._body as { messages: Array<{ id: string }> };
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].id).toBe("m1");
    });

    it("returns empty array for non-existent conversation", async () => {
      const req = createMockReq("GET", "/vwp/chat/history?conversationId=nonexistent");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ messages: [] });
    });
  });

  describe("auth", () => {
    it("returns 401 for missing token", async () => {
      // Create handler with a different token
      const strictHandler = createChatHttpHandler({
        gatewayToken: "different-token",
        gateway: gateway as any,
        chatStore,
      });

      const req = createMockReq("GET", "/vwp/chat/history?conversationId=x");
      const res = createMockRes();
      await strictHandler(req, res);

      expect(res._status).toBe(401);
    });
  });
});
