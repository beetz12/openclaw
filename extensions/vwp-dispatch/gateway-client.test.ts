import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GatewayClient, type IWebSocket } from "./gateway-client.ts";

// ---------------------------------------------------------------------------
// MockWebSocket — simulates the subset of the WebSocket API that
// GatewayClient relies on.
// ---------------------------------------------------------------------------

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

class MockWebSocket implements IWebSocket {
  readyState: number = CONNECTING;
  url: string;

  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Automatically transition to OPEN on the next microtask,
    // allowing tests to configure handlers before onopen fires.
    queueMicrotask(() => {
      if (this.readyState === CONNECTING) {
        this.readyState = OPEN;
        this.onopen?.({});
      }
    });
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(_code?: number, _reason?: string) {
    this.readyState = CLOSED;
    this.onclose?.({ code: 1000, reason: "", wasClean: true });
  }

  // --- Test helpers ---

  /** Simulate server sending a message to the client. */
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  /** Simulate the connect.challenge event from the Gateway. */
  simulateChallenge() {
    this.simulateMessage({ type: "event", event: "connect.challenge" });
  }

  /** Simulate a successful auth response for the given request id. */
  simulateAuthSuccess(requestId: string) {
    this.simulateMessage({ type: "res", id: requestId, ok: true, payload: {} });
  }

  /** Simulate an auth failure response. */
  simulateAuthFailure(requestId: string, message = "Invalid token") {
    this.simulateMessage({
      type: "res",
      id: requestId,
      ok: false,
      payload: null,
      error: { message },
    });
  }

  /** Simulate an unexpected close (e.g. network failure). */
  simulateUnexpectedClose() {
    this.readyState = CLOSED;
    this.onclose?.({ code: 1006, reason: "abnormal closure", wasClean: false });
  }

  /** Simulate a WebSocket error. */
  simulateError(_message = "connection refused") {
    this.onerror?.({});
  }
}

// ---------------------------------------------------------------------------
// Factory + instance tracking
// ---------------------------------------------------------------------------

let wsInstances: MockWebSocket[] = [];

function createMockFactory() {
  wsInstances = [];
  return (url: string): IWebSocket => {
    const ws = new MockWebSocket(url);
    wsInstances.push(ws);
    return ws;
  };
}

/** Get the most-recently created MockWebSocket instance. */
function lastWS(): MockWebSocket {
  const ws = wsInstances[wsInstances.length - 1];
  if (!ws) throw new Error("No WebSocket instances created");
  return ws;
}

/**
 * Run through the full challenge-response handshake so the client
 * reaches the "connected & authenticated" state.
 */
async function connectSuccessfully(client: InstanceType<typeof GatewayClient>) {
  const p = client.connect();
  // Allow microtask for onopen
  await vi.advanceTimersByTimeAsync(0);
  const ws = lastWS();
  ws.simulateChallenge();
  // Extract the request id from the connect request the client sent
  const connectReq = JSON.parse(ws.sentMessages[0]!);
  ws.simulateAuthSuccess(connectReq.id);
  await p;
  return ws;
}

function makeClient(token = "tok") {
  return new GatewayClient({
    url: "ws://localhost:18789",
    token,
    createWebSocket: createMockFactory(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GatewayClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wsInstances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Connection basics
  // -------------------------------------------------------------------------

  describe("connect()", () => {
    it("creates a WebSocket with the token in the URL query param", async () => {
      const client = makeClient("my-secret");
      const p = client.connect();
      await vi.advanceTimersByTimeAsync(0);

      const ws = lastWS();
      expect(ws.url).toContain("token=my-secret");
      expect(ws.url).toMatch(/^ws:\/\/localhost:18789/);

      // Clean up
      ws.simulateChallenge();
      const req = JSON.parse(ws.sentMessages[0]!);
      ws.simulateAuthSuccess(req.id);
      await p;
    });

    it("responds to the challenge with a connect request", async () => {
      const client = makeClient("tok-123");
      const p = client.connect();
      await vi.advanceTimersByTimeAsync(0);

      const ws = lastWS();
      ws.simulateChallenge();

      expect(ws.sentMessages).toHaveLength(1);
      const msg = JSON.parse(ws.sentMessages[0]!);
      expect(msg.type).toBe("req");
      expect(msg.method).toBe("connect");
      expect(msg.id).toBeTypeOf("string");
      expect(msg.params).toMatchObject({
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "vwp-dispatch",
          version: "1.0.0",
          platform: "node",
          mode: "agent",
        },
        auth: { token: "tok-123" },
      });

      // Complete handshake
      ws.simulateAuthSuccess(msg.id);
      await p;
    });

    it("resolves after successful auth response", async () => {
      const client = makeClient();
      const ws = await connectSuccessfully(client);
      expect(client.isConnected()).toBe(true);
      // Only the connect request should have been sent
      expect(ws.sentMessages).toHaveLength(1);
    });

    it("rejects on connection timeout (10s)", async () => {
      const client = makeClient();
      const p = client.connect();
      await vi.advanceTimersByTimeAsync(0);

      // Attach rejection handler before advancing so the promise isn't
      // "unhandled" when the timer fires synchronously.
      const rejection = expect(p).rejects.toThrow(/timeout/i);

      // Don't send the challenge — let it time out
      await vi.advanceTimersByTimeAsync(10_000);

      await rejection;
    });

    it("rejects on auth failure", async () => {
      const client = makeClient("bad-tok");
      const p = client.connect();
      await vi.advanceTimersByTimeAsync(0);

      const ws = lastWS();
      ws.simulateChallenge();
      const req = JSON.parse(ws.sentMessages[0]!);
      ws.simulateAuthFailure(req.id, "Access denied");

      await expect(p).rejects.toThrow(/Access denied/i);
    });

    it("prevents simultaneous connections — returns the same promise", async () => {
      const client = makeClient();
      const p1 = client.connect();
      const p2 = client.connect();

      expect(p1).toBe(p2);

      // Only one WebSocket should have been created
      expect(wsInstances).toHaveLength(1);

      // Complete handshake
      await vi.advanceTimersByTimeAsync(0);
      const ws = lastWS();
      ws.simulateChallenge();
      const req = JSON.parse(ws.sentMessages[0]!);
      ws.simulateAuthSuccess(req.id);
      await p1;
    });

    it("rejects on WebSocket error before connection", async () => {
      const client = makeClient();
      const p = client.connect();
      await vi.advanceTimersByTimeAsync(0);

      const ws = lastWS();
      ws.simulateError("connection refused");

      await expect(p).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // RPC calls
  // -------------------------------------------------------------------------

  describe("call()", () => {
    it("sends an RPC request and returns the response payload", async () => {
      const client = makeClient();
      const ws = await connectSuccessfully(client);

      const callPromise = client.call("sessions.list", { limit: 10 });

      // A second message should have been sent (first was connect)
      expect(ws.sentMessages).toHaveLength(2);
      const rpcMsg = JSON.parse(ws.sentMessages[1]!);
      expect(rpcMsg.type).toBe("req");
      expect(rpcMsg.method).toBe("sessions.list");
      expect(rpcMsg.params).toEqual({ limit: 10 });

      // Simulate response
      ws.simulateMessage({
        type: "res",
        id: rpcMsg.id,
        ok: true,
        payload: [{ id: "s1" }, { id: "s2" }],
      });

      const result = await callPromise;
      expect(result).toEqual([{ id: "s1" }, { id: "s2" }]);
    });

    it("rejects on RPC error response", async () => {
      const client = makeClient();
      const ws = await connectSuccessfully(client);

      const callPromise = client.call("sessions.delete", { id: "s1" });
      const rpcMsg = JSON.parse(ws.sentMessages[1]!);

      ws.simulateMessage({
        type: "res",
        id: rpcMsg.id,
        ok: false,
        payload: null,
        error: { message: "Not found" },
      });

      await expect(callPromise).rejects.toThrow("Not found");
    });

    it("rejects on timeout (30s)", async () => {
      const client = makeClient();
      await connectSuccessfully(client);

      const callPromise = client.call("sessions.list");

      // Attach rejection handler before advancing so the promise isn't
      // "unhandled" when the timer fires synchronously.
      const rejection = expect(callPromise).rejects.toThrow(/timeout/i);

      // Advance past the 30s timeout
      await vi.advanceTimersByTimeAsync(30_000);

      await rejection;
    });

    it("throws when not connected", () => {
      const client = makeClient();
      expect(() => client.call("sessions.list")).toThrow(/not connected/i);
    });
  });

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------

  describe("disconnect()", () => {
    it("closes the WebSocket and marks as disconnected", async () => {
      const client = makeClient();
      await connectSuccessfully(client);

      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it("clears pending requests on disconnect", async () => {
      const client = makeClient();
      await connectSuccessfully(client);

      // Start a call but don't respond
      const callPromise = client.call("sessions.list");

      client.disconnect();

      // The pending call should reject
      await expect(callPromise).rejects.toThrow(/disconnect/i);
    });
  });

  // -------------------------------------------------------------------------
  // isConnected()
  // -------------------------------------------------------------------------

  describe("isConnected()", () => {
    it("returns false before connect", () => {
      const client = makeClient();
      expect(client.isConnected()).toBe(false);
    });

    it("returns true only when connected, authenticated, and WebSocket is OPEN", async () => {
      const client = makeClient();
      await connectSuccessfully(client);
      expect(client.isConnected()).toBe(true);
    });

    it("returns false after disconnect", async () => {
      const client = makeClient();
      await connectSuccessfully(client);
      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Auto-reconnect
  // -------------------------------------------------------------------------

  describe("auto-reconnect", () => {
    it("schedules reconnect after unexpected disconnect", async () => {
      const client = makeClient();
      const ws = await connectSuccessfully(client);

      // Simulate unexpected close
      ws.simulateUnexpectedClose();

      // No new WebSocket yet
      expect(wsInstances).toHaveLength(1);

      // Advance 10s for reconnect timer
      await vi.advanceTimersByTimeAsync(10_000);

      // A new WebSocket should have been created
      expect(wsInstances).toHaveLength(2);
    });

    it("does not reconnect after intentional disconnect", async () => {
      const client = makeClient();
      await connectSuccessfully(client);

      client.disconnect();

      // Advance well past the reconnect window
      await vi.advanceTimersByTimeAsync(30_000);

      // Only the original WebSocket should exist
      expect(wsInstances).toHaveLength(1);
    });

    it("does not reconnect on initial connection failure", async () => {
      const client = makeClient();
      const p = client.connect();
      await vi.advanceTimersByTimeAsync(0);

      const ws = lastWS();
      // Error before ever reaching connected state
      ws.simulateError("connection refused");

      await p.catch(() => {}); // swallow

      // Advance well past the reconnect window
      await vi.advanceTimersByTimeAsync(30_000);

      // Only the original WebSocket should exist
      expect(wsInstances).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  describe("events", () => {
    it('emits "connected" after successful auth', async () => {
      const client = makeClient();
      const connected = vi.fn();
      client.on("connected", connected);

      await connectSuccessfully(client);
      expect(connected).toHaveBeenCalledOnce();
    });

    it('emits "disconnected" when WebSocket closes', async () => {
      const client = makeClient();
      const disconnected = vi.fn();
      client.on("disconnected", disconnected);

      const ws = await connectSuccessfully(client);
      ws.simulateUnexpectedClose();

      expect(disconnected).toHaveBeenCalledOnce();
    });

    it("forwards gateway events (type: event messages)", async () => {
      const client = makeClient();
      const handler = vi.fn();
      client.on("session.updated", handler);

      const ws = await connectSuccessfully(client);

      ws.simulateMessage({
        type: "event",
        event: "session.updated",
        params: { sessionId: "s1", status: "active" },
      });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({
        sessionId: "s1",
        status: "active",
      });
    });
  });
});
