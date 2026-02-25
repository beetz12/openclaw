import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanApiClient } from "../../apps/vwp-board/src/lib/api-client.ts";

const TOKEN_KEY = "vwp-dashboard-token";
const BASE_URL_KEY = "vwp-dashboard-base-url";

function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("KanbanApiClient route fallback behavior", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const localStorage = createStorage();
    localStorage.setItem(BASE_URL_KEY, "http://localhost:19001");
    localStorage.setItem(TOKEN_KEY, "test-token");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: localStorage,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
    });
  });

  it("uses canonical confirm endpoint and falls back on 404", async () => {
    const fetchMock = vi
      .fn<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "dispatching" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const client = new KanbanApiClient();
    await client.confirmExecution("task-123");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/vwp/dispatch/confirm/task-123");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/vwp/dispatch/tasks/task-123/confirm");
  });

  it("uses canonical cancel endpoint and falls back to legacy cancel route on 404", async () => {
    const fetchMock = vi
      .fn<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const client = new KanbanApiClient();
    await client.cancelTask("task-456");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/vwp/dispatch/tasks/task-456");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/vwp/dispatch/tasks/task-456/cancel");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
  });

  it("fetches queue state from canonical queue endpoint", async () => {
    const fetchMock = vi
      .fn<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ active: null, pending: [], length: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const client = new KanbanApiClient();
    const queue = await client.getQueueState();

    expect(queue.length).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/vwp/dispatch/queue");
  });

  it("falls back to legacy submit endpoint when primary submit route is unavailable", async () => {
    const fetchMock = vi
      .fn<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-789" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const client = new KanbanApiClient();
    const submitted = await client.submitGoal("Ship weekly report", "high");

    expect(submitted.id).toBe("task-789");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/vwp/dispatch/tasks");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/vwp/dispatch/submit");
    const firstBody = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
    expect(firstBody).toContain('"priority":"high"');
  });
});
