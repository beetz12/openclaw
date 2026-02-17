import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Stub browser globals before importing the module
// ---------------------------------------------------------------------------

let VwpTasksClient: typeof import("./tasks-client.js").VwpTasksClient;
const store: Record<string, string> = {};

beforeEach(async () => {
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

  const mod = await import("./tasks-client.js");
  VwpTasksClient = mod.VwpTasksClient;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

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
// Tests
// ---------------------------------------------------------------------------

describe("VwpTasksClient", () => {
  describe("constructor", () => {
    it("reads token and baseUrl from localStorage", async () => {
      store["vwp-dashboard-token"] = "tok-abc";
      store["vwp-dashboard-base-url"] = "http://api.test";

      vi.resetModules();
      const mod = await import("./tasks-client.js");
      const client = new mod.VwpTasksClient();

      expect(client.token).toBe("tok-abc");
      expect(client.baseUrl).toBe("http://api.test");
    });

    it("defaults to empty strings", () => {
      const client = new VwpTasksClient();
      expect(client.token).toBe("");
      expect(client.baseUrl).toBe("");
    });
  });

  describe("submitTask", () => {
    it("sends POST to /vwp/dispatch/tasks with text body", async () => {
      const client = new VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "test-tok";

      mockFetchOk({ taskId: "task-123" });

      const result = await client.submitTask("Write a report");

      expect(result.taskId).toBe("task-123");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("/vwp/dispatch/tasks");
      expect(fetchCall[1].method).toBe("POST");
      expect(fetchCall[1].body).toBe(JSON.stringify({ text: "Write a report" }));
      expect(fetchCall[1].headers["Content-Type"]).toBe("application/json");
      expect(fetchCall[1].headers["Authorization"]).toBe("Bearer test-tok");
    });
  });

  describe("getTaskStatus", () => {
    it("fetches task by id", async () => {
      const client = new VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "tok";

      const task = {
        id: "task-1",
        text: "Do thing",
        status: "running",
        subTasks: [],
        createdAt: 1000,
        updatedAt: 2000,
      };
      mockFetchOk(task);

      const result = await client.getTaskStatus("task-1");

      expect(result.id).toBe("task-1");
      expect(result.status).toBe("running");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("/vwp/dispatch/tasks/task-1");
    });

    it("encodes task ID in URL", async () => {
      const client = new VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "tok";

      mockFetchOk({
        id: "a/b",
        text: "x",
        status: "running",
        subTasks: [],
        createdAt: 0,
        updatedAt: 0,
      });

      await client.getTaskStatus("a/b");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("/vwp/dispatch/tasks/a%2Fb");
    });
  });

  describe("listTasks", () => {
    it("fetches all tasks", async () => {
      const client = new VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "tok";

      const response = {
        tasks: [
          {
            id: "t1",
            text: "A",
            status: "running",
            subTasks: [],
            createdAt: 1000,
            updatedAt: 2000,
          },
          {
            id: "t2",
            text: "B",
            status: "completed",
            subTasks: [],
            createdAt: 900,
            updatedAt: 1800,
          },
        ],
        total: 2,
      };
      mockFetchOk(response);

      const result = await client.listTasks();

      expect(result.tasks).toHaveLength(2);
      expect(result.total).toBe(2);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("/vwp/dispatch/tasks");
    });
  });

  describe("cancelTask", () => {
    it("sends POST to cancel endpoint", async () => {
      const client = new VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "tok";

      mockFetchOk({ ok: true });

      await client.cancelTask("task-1");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("/vwp/dispatch/tasks/task-1/cancel");
      expect(fetchCall[1].method).toBe("POST");
    });
  });

  describe("confirmTask", () => {
    it("sends POST to confirm endpoint", async () => {
      const client = new VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "tok";

      mockFetchOk({ ok: true });

      await client.confirmTask("task-1");

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain("/vwp/dispatch/tasks/task-1/confirm");
      expect(fetchCall[1].method).toBe("POST");
    });
  });

  describe("error handling", () => {
    it("throws ApiError on non-ok response", async () => {
      const client = new VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "tok";

      mockFetchError(404, { error: "Task not found" });

      await expect(client.getTaskStatus("bad-id")).rejects.toEqual({
        error: "Task not found",
        status: 404,
      });
    });

    it("falls back to HTTP status when body is not JSON", async () => {
      const client = new VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "tok";

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      });

      await expect(client.listTasks()).rejects.toEqual({
        error: "HTTP 500",
        status: 500,
      });
    });

    it("sends no auth header when token is empty", async () => {
      const client = new VwpTasksClient();

      mockFetchOk({ tasks: [], total: 0 });

      await client.listTasks();

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].headers["Authorization"]).toBeUndefined();
    });
  });

  describe("URL construction", () => {
    it("uses baseUrl when set", async () => {
      store["vwp-dashboard-base-url"] = "http://custom:9000";

      vi.resetModules();
      const mod = await import("./tasks-client.js");
      const client = new mod.VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "tok";

      mockFetchOk({ tasks: [], total: 0 });
      await client.listTasks();

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toMatch(/^http:\/\/custom:9000\/vwp\/dispatch\/tasks/);
    });

    it("falls back to window.location.origin", async () => {
      const client = new VwpTasksClient();
      // biome-ignore lint: setting private property for testing
      (client as any)._token = "tok";

      mockFetchOk({ tasks: [], total: 0 });
      await client.listTasks();

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toMatch(/^http:\/\/localhost:3000\/vwp\/dispatch\/tasks/);
    });
  });
});
