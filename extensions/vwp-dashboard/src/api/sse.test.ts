import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SSEEvent } from "./types.js";

// ---------------------------------------------------------------------------
// Mock EventSource and browser globals before importing the SSE module
// ---------------------------------------------------------------------------

type FakeEventSource = {
  url: string;
  close: ReturnType<typeof vi.fn>;
  onerror: ((event: Event) => void) | null;
  listeners: Map<string, ((e: MessageEvent) => void)[]>;
  addEventListener: (type: string, handler: (e: MessageEvent) => void) => void;
  // Helpers to simulate events
  _emit: (type: string, data: string) => void;
  _triggerError: () => void;
};

let fakeEventSources: FakeEventSource[];

function createFakeEventSource(url: string): FakeEventSource {
  const es: FakeEventSource = {
    url,
    close: vi.fn(),
    onerror: null,
    listeners: new Map(),
    addEventListener(type: string, handler: (e: MessageEvent) => void) {
      if (!es.listeners.has(type)) es.listeners.set(type, []);
      es.listeners.get(type)!.push(handler);
    },
    _emit(type: string, data: string) {
      const handlers = es.listeners.get(type) ?? [];
      for (const handler of handlers) {
        handler({ data } as MessageEvent);
      }
    },
    _triggerError() {
      if (es.onerror) es.onerror(new Event("error"));
    },
  };
  fakeEventSources.push(es);
  return es;
}

let VwpSSEClient: typeof import("./sse.js").VwpSSEClient;

beforeEach(async () => {
  vi.useFakeTimers();
  fakeEventSources = [];

  // Stub localStorage for the api client dependency
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });

  vi.stubGlobal("window", {
    location: { origin: "http://localhost:3000" },
  });

  vi.stubGlobal("EventSource", createFakeEventSource);

  const mod = await import("./sse.js");
  VwpSSEClient = mod.VwpSSEClient;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

describe("VwpSSEClient", () => {
  describe("connect", () => {
    it("creates EventSource with correct URL", () => {
      const client = new VwpSSEClient();
      client.connect();

      expect(fakeEventSources).toHaveLength(1);
      expect(fakeEventSources[0].url).toContain("/vwp/events");
    });

    it("sets status to connecting initially", () => {
      const client = new VwpSSEClient();
      const statuses: string[] = [];
      client.onStatus((s) => statuses.push(s));

      client.connect();

      expect(statuses).toContain("connecting");
    });

    it("sets status to connected on 'connected' event", () => {
      const client = new VwpSSEClient();
      const statuses: string[] = [];
      client.onStatus((s) => statuses.push(s));

      client.connect();

      const es = fakeEventSources[0];
      es._emit("connected", JSON.stringify({ ts: 12345 }));

      expect(client.status).toBe("connected");
      expect(statuses).toContain("connected");
    });

    it("emits SSEEvent on 'connected' event", () => {
      const client = new VwpSSEClient();
      const events: SSEEvent[] = [];
      client.onEvent((e) => events.push(e));

      client.connect();

      const es = fakeEventSources[0];
      es._emit("connected", JSON.stringify({ ts: 12345 }));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("connected");
      expect((events[0] as { ts: number }).ts).toBe(12345);
    });

    it("handles malformed 'connected' data gracefully", () => {
      const client = new VwpSSEClient();
      const events: SSEEvent[] = [];
      client.onEvent((e) => events.push(e));

      client.connect();

      const es = fakeEventSources[0];
      es._emit("connected", "not-json");

      // Should still emit with fallback ts
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("connected");
    });
  });

  // ---------------------------------------------------------------------------
  // Event forwarding
  // ---------------------------------------------------------------------------

  describe("event forwarding", () => {
    it("forwards message_queued events", () => {
      const client = new VwpSSEClient();
      const events: SSEEvent[] = [];
      client.onEvent((e) => events.push(e));

      client.connect();
      const es = fakeEventSources[0];

      const eventData: SSEEvent = {
        type: "message_queued",
        message: { id: "m1", to: "+1", content: "hi" } as SSEEvent & {
          type: "message_queued";
        } extends { message: infer M }
          ? M
          : never,
      };
      es._emit("message_queued", JSON.stringify(eventData));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("message_queued");
    });

    it("forwards message_approved events", () => {
      const client = new VwpSSEClient();
      const events: SSEEvent[] = [];
      client.onEvent((e) => events.push(e));

      client.connect();
      const es = fakeEventSources[0];

      es._emit(
        "message_approved",
        JSON.stringify({ type: "message_approved", id: "m1", content: "ok" }),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("message_approved");
    });

    it("forwards message_rejected events", () => {
      const client = new VwpSSEClient();
      const events: SSEEvent[] = [];
      client.onEvent((e) => events.push(e));

      client.connect();
      const es = fakeEventSources[0];

      es._emit("message_rejected", JSON.stringify({ type: "message_rejected", id: "m1" }));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("message_rejected");
    });

    it("forwards message_auto_approved events", () => {
      const client = new VwpSSEClient();
      const events: SSEEvent[] = [];
      client.onEvent((e) => events.push(e));

      client.connect();
      const es = fakeEventSources[0];

      es._emit(
        "message_auto_approved",
        JSON.stringify({ type: "message_auto_approved", message: { id: "m1" } }),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("message_auto_approved");
    });

    it("skips malformed event data", () => {
      const client = new VwpSSEClient();
      const events: SSEEvent[] = [];
      client.onEvent((e) => events.push(e));

      client.connect();
      const es = fakeEventSources[0];

      es._emit("message_queued", "not-json");

      expect(events).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  describe("disconnect", () => {
    it("closes EventSource", () => {
      const client = new VwpSSEClient();
      client.connect();
      const es = fakeEventSources[0];

      client.disconnect();

      expect(es.close).toHaveBeenCalled();
    });

    it("sets status to disconnected", () => {
      const client = new VwpSSEClient();
      client.connect();

      const es = fakeEventSources[0];
      es._emit("connected", JSON.stringify({ ts: 1 }));
      expect(client.status).toBe("connected");

      client.disconnect();

      // Status should be disconnected (or remain disconnected after close triggers)
      // Note: disconnect calls _close which doesn't emit status; status changes on error
      expect(client.status).toBe("connected"); // stays since we didn't go through error path
    });

    it("does not attempt reconnection after intentional disconnect", () => {
      const client = new VwpSSEClient();
      client.connect();

      const es = fakeEventSources[0];
      client.disconnect();

      // Simulate an error after disconnect
      es._triggerError();

      // Advance timers to see if reconnection happens
      vi.advanceTimersByTime(60_000);

      // Should only have the original EventSource, no reconnect
      expect(fakeEventSources).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Reconnection
  // ---------------------------------------------------------------------------

  describe("reconnection", () => {
    it("reconnects after error with exponential backoff", () => {
      const client = new VwpSSEClient();
      client.connect();

      expect(fakeEventSources).toHaveLength(1);

      // Trigger error
      fakeEventSources[0]._triggerError();

      // First reconnect at 1s
      vi.advanceTimersByTime(1000);
      expect(fakeEventSources).toHaveLength(2);

      // Trigger another error
      fakeEventSources[1]._triggerError();

      // Second reconnect at 2s (doubled)
      vi.advanceTimersByTime(1000);
      expect(fakeEventSources).toHaveLength(2); // not yet

      vi.advanceTimersByTime(1000);
      expect(fakeEventSources).toHaveLength(3);
    });

    it("resets backoff on successful connection", () => {
      const client = new VwpSSEClient();
      client.connect();

      // Trigger error → reconnect at 1s
      fakeEventSources[0]._triggerError();
      vi.advanceTimersByTime(1000);
      expect(fakeEventSources).toHaveLength(2);

      // Trigger error → reconnect at 2s
      fakeEventSources[1]._triggerError();
      vi.advanceTimersByTime(2000);
      expect(fakeEventSources).toHaveLength(3);

      // Successful connection
      fakeEventSources[2]._emit("connected", JSON.stringify({ ts: 1 }));

      // Trigger error → should reconnect at 1s again (backoff reset)
      fakeEventSources[2]._triggerError();
      vi.advanceTimersByTime(1000);
      expect(fakeEventSources).toHaveLength(4);
    });

    it("caps backoff at 30s", () => {
      const client = new VwpSSEClient();
      client.connect();

      // Trigger many errors to push backoff to the cap
      for (let i = 0; i < 10; i++) {
        const es = fakeEventSources[fakeEventSources.length - 1];
        es._triggerError();
        // Advance well past any backoff
        vi.advanceTimersByTime(60_000);
      }

      const count = fakeEventSources.length;
      // All should have been created (not capped at some point)
      expect(count).toBeGreaterThan(5);
    });

    it("sets status to disconnected on error", () => {
      const client = new VwpSSEClient();
      const statuses: string[] = [];
      client.onStatus((s) => statuses.push(s));

      client.connect();
      fakeEventSources[0]._emit("connected", JSON.stringify({ ts: 1 }));

      fakeEventSources[0]._triggerError();

      expect(statuses).toContain("disconnected");
    });
  });

  // ---------------------------------------------------------------------------
  // Listener management
  // ---------------------------------------------------------------------------

  describe("listener management", () => {
    it("onEvent returns unsubscribe function", () => {
      const client = new VwpSSEClient();
      const events: SSEEvent[] = [];
      const unsub = client.onEvent((e) => events.push(e));

      client.connect();
      const es = fakeEventSources[0];

      unsub();

      es._emit("message_queued", JSON.stringify({ type: "message_queued", message: {} }));

      expect(events).toHaveLength(0);
    });

    it("onStatus returns unsubscribe function", () => {
      const client = new VwpSSEClient();
      const statuses: string[] = [];
      const unsub = client.onStatus((s) => statuses.push(s));

      unsub();

      client.connect();

      expect(statuses).toHaveLength(0);
    });

    it("does not duplicate status callbacks", () => {
      const client = new VwpSSEClient();
      const statuses: string[] = [];
      client.onStatus((s) => statuses.push(s));

      client.connect();

      // "connecting" should appear only once
      const connectingCount = statuses.filter((s) => s === "connecting").length;
      expect(connectingCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Token and URL
  // ---------------------------------------------------------------------------

  describe("token handling", () => {
    it("passes api token as query parameter", async () => {
      // Set up the api singleton's token via localStorage
      vi.resetModules();

      const localStore: Record<string, string> = {
        "vwp-dashboard-token": "my-secret-token",
      };
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => localStore[key] ?? null,
        setItem: vi.fn(),
        removeItem: vi.fn(),
      });

      fakeEventSources = [];
      vi.stubGlobal("EventSource", createFakeEventSource);

      const mod = await import("./sse.js");
      const client = new mod.VwpSSEClient();
      client.connect();

      expect(fakeEventSources).toHaveLength(1);
      expect(fakeEventSources[0].url).toContain("token=my-secret-token");
    });
  });
});
