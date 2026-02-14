import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingListResponse, StatsResponse, ApproveResult, RejectResult } from "./types.js";

// ---------------------------------------------------------------------------
// Stub browser globals before importing the module
// ---------------------------------------------------------------------------

let VwpApiClient: typeof import("./client.js").VwpApiClient;
let api: typeof import("./client.js").api;
const store: Record<string, string> = {};

beforeEach(async () => {
  // Clear store
  for (const key of Object.keys(store)) delete store[key];

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });

  vi.stubGlobal("fetch", vi.fn());

  vi.stubGlobal("window", {
    location: { origin: "http://localhost:3000" },
  });

  const mod = await import("./client.js");
  VwpApiClient = mod.VwpApiClient;
  api = mod.api;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk<T>(data: T): void {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  });
}

function mockFetchError(status: number, body?: { error: string }): void {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body ?? { error: `HTTP ${status}` },
  });
}

// ---------------------------------------------------------------------------
// Constructor & persistence
// ---------------------------------------------------------------------------

describe("VwpApiClient", () => {
  describe("constructor and persistence", () => {
    it("reads token and baseUrl from localStorage", async () => {
      store["vwp-dashboard-token"] = "tok-123";
      store["vwp-dashboard-base-url"] = "http://api.test";

      // Re-import to pick up localStorage values
      vi.resetModules();
      const mod = await import("./client.js");
      const client = new mod.VwpApiClient();

      expect(client.token).toBe("tok-123");
      expect(client.baseUrl).toBe("http://api.test");
    });

    it("defaults to empty strings when localStorage is empty", () => {
      const client = new VwpApiClient();
      expect(client.token).toBe("");
      expect(client.baseUrl).toBe("");
    });

    it("persists token to localStorage on set", () => {
      const client = new VwpApiClient();
      client.token = "new-token";

      expect(store["vwp-dashboard-token"]).toBe("new-token");
      expect(client.token).toBe("new-token");
    });

    it("persists baseUrl to localStorage on set", () => {
      const client = new VwpApiClient();
      client.baseUrl = "http://new-api.test";

      expect(store["vwp-dashboard-base-url"]).toBe("http://new-api.test");
      expect(client.baseUrl).toBe("http://new-api.test");
    });

    it("isConfigured returns true when token is set", () => {
      const client = new VwpApiClient();
      expect(client.isConfigured).toBe(false);

      client.token = "some-token";
      expect(client.isConfigured).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getPending
  // ---------------------------------------------------------------------------

  describe("getPending", () => {
    it("fetches pending messages with default params", async () => {
      const client = new VwpApiClient();
      client.token = "test-tok";

      const response: PendingListResponse = {
        messages: [
          {
            id: "msg-1",
            to: "+123",
            content: "Hello",
            edited_content: null,
            channel: "whatsapp",
            session_key: "s1",
            agent_id: "a1",
            created_at: 1000,
            status: "pending",
          },
        ],
        total: 1,
        offset: 0,
        limit: 20,
        hasMore: false,
      };
      mockFetchOk(response);

      const result = await client.getPending();

      expect(result.messages).toHaveLength(1);
      expect(result.total).toBe(1);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toContain("/vwp/pending");
      expect(fetchCall[1].headers.Authorization).toBe("Bearer test-tok");
    });

    it("passes channel filter as query param", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      mockFetchOk({ messages: [], total: 0, offset: 0, limit: 20, hasMore: false });

      await client.getPending({ channel: "telegram" });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("channel=telegram");
    });

    it("passes limit and offset as query params", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      mockFetchOk({ messages: [], total: 0, offset: 5, limit: 10, hasMore: false });

      await client.getPending({ limit: 10, offset: 5 });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=5");
    });

    it("omits undefined params from URL", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      mockFetchOk({ messages: [], total: 0, offset: 0, limit: 20, hasMore: false });

      await client.getPending({ channel: undefined });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).not.toContain("channel=");
    });
  });

  // ---------------------------------------------------------------------------
  // getStats
  // ---------------------------------------------------------------------------

  describe("getStats", () => {
    it("fetches stats", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      const response: StatsResponse = {
        stats: [
          {
            channel: "whatsapp",
            total: 10,
            pending: 3,
            approved: 5,
            rejected: 1,
            auto_approved: 1,
          },
        ],
      };
      mockFetchOk(response);

      const result = await client.getStats();

      expect(result.stats).toHaveLength(1);
      expect(result.stats[0].channel).toBe("whatsapp");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toContain("/vwp/stats");
    });
  });

  // ---------------------------------------------------------------------------
  // getHistory
  // ---------------------------------------------------------------------------

  describe("getHistory", () => {
    it("fetches history with pagination params", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      mockFetchOk({ messages: [], total: 0, offset: 0, limit: 5, hasMore: false });

      await client.getHistory({ limit: 5, offset: 10 });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("/vwp/history");
      expect(url).toContain("limit=5");
      expect(url).toContain("offset=10");
    });
  });

  // ---------------------------------------------------------------------------
  // approve
  // ---------------------------------------------------------------------------

  describe("approve", () => {
    it("approves without editedContent", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      const response: ApproveResult = {
        id: "msg-1",
        status: "approved",
        content: "original",
        to: "+123",
        channel: "whatsapp",
      };
      mockFetchOk(response);

      const result = await client.approve("msg-1");

      expect(result.status).toBe("approved");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("/vwp/approve/msg-1");
      expect(fetchCall[1].method).toBe("POST");
      expect(fetchCall[1].body).toBeUndefined();
    });

    it("approves with editedContent", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      const response: ApproveResult = {
        id: "msg-1",
        status: "approved",
        content: "edited",
        to: "+123",
        channel: "whatsapp",
      };
      mockFetchOk(response);

      const result = await client.approve("msg-1", "edited");

      expect(result.content).toBe("edited");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].body).toBe(JSON.stringify({ editedContent: "edited" }));
      expect(fetchCall[1].headers["Content-Type"]).toBe("application/json");
    });

    it("encodes message ID in URL", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      mockFetchOk({ id: "a/b", status: "approved", content: "x", to: "y", channel: "z" });

      await client.approve("a/b");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("/vwp/approve/a%2Fb");
    });
  });

  // ---------------------------------------------------------------------------
  // reject
  // ---------------------------------------------------------------------------

  describe("reject", () => {
    it("rejects without reason", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      const response: RejectResult = { id: "msg-1", status: "rejected" };
      mockFetchOk(response);

      const result = await client.reject("msg-1");

      expect(result.status).toBe("rejected");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].method).toBe("POST");
      expect(fetchCall[1].body).toBeUndefined();
    });

    it("rejects with reason", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      const response: RejectResult = { id: "msg-1", status: "rejected", reason: "bad" };
      mockFetchOk(response);

      await client.reject("msg-1", "bad");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].body).toBe(JSON.stringify({ reason: "bad" }));
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it("throws ApiError with server error message", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      mockFetchError(401, { error: "Unauthorized" });

      await expect(client.getPending()).rejects.toEqual({
        error: "Unauthorized",
        status: 401,
      });
    });

    it("falls back to HTTP status when body is not JSON", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      });

      await expect(client.getPending()).rejects.toEqual({
        error: "HTTP 500",
        status: 500,
      });
    });

    it("sends no Authorization header when token is empty", async () => {
      const client = new VwpApiClient();
      // Don't set token

      mockFetchOk({ messages: [], total: 0, offset: 0, limit: 20, hasMore: false });

      await client.getPending();

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].headers.Authorization).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // URL construction
  // ---------------------------------------------------------------------------

  describe("URL construction", () => {
    it("uses baseUrl when set", async () => {
      const client = new VwpApiClient();
      client.token = "tok";
      client.baseUrl = "http://custom-host:9000";

      mockFetchOk({ messages: [], total: 0, offset: 0, limit: 20, hasMore: false });

      await client.getPending();

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toMatch(/^http:\/\/custom-host:9000\/vwp\/pending/);
    });

    it("falls back to window.location.origin when baseUrl is empty", async () => {
      const client = new VwpApiClient();
      client.token = "tok";

      mockFetchOk({ stats: [] });

      await client.getStats();

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toMatch(/^http:\/\/localhost:3000\/vwp\/stats/);
    });
  });
});
