import { EventEmitter } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock homedir
const FIXTURE_DIR = join(import.meta.dirname!, ".test-kanban-route-fixtures");

vi.mock("node:os", () => ({
  homedir: () => FIXTURE_DIR,
}));

// Mock auth helpers to always pass
vi.mock("../../src/gateway/http-utils.js", () => ({
  getBearerToken: () => "test-token",
}));

vi.mock("../../src/security/secret-equal.js", () => ({
  safeEqualSecret: (a: string, b: string) => a === b,
}));

const { createKanbanHttpHandler } = await import("./kanban-routes.ts");
const { initializeBoard, moveTask } = await import("./board-state.ts");

const TEST_TOKEN = "test-token";

// Helper to create mock req/res
function createMockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { authorization: `Bearer ${TEST_TOKEN}` };

  // Simulate body sending after the handler attaches listeners
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

describe("kanban-routes", () => {
  let handler: ReturnType<typeof createKanbanHttpHandler>;
  let sseEvents: unknown[];

  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });

    sseEvents = [];
    handler = createKanbanHttpHandler({
      gatewayToken: TEST_TOKEN,
      onSSE: (event) => sseEvents.push(event),
    });

    await initializeBoard();
  });

  describe("PATCH /vwp/dispatch/tasks/:id/column", () => {
    it("moves a task to a valid column", async () => {
      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/task-1/column", {
        column: "in_progress",
      });
      const res = createMockRes();
      const handled = await handler(req, res);

      expect(handled).toBe(true);
      expect(res._status).toBe(200);
      expect(res._body).toEqual({ id: "task-1", column: "in_progress" });
      expect(sseEvents).toHaveLength(1);
      expect(sseEvents[0]).toMatchObject({
        type: "task_column_changed",
        taskId: "task-1",
        to: "in_progress",
      });
    });

    it("rejects invalid column", async () => {
      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/task-1/column", {
        column: "invalid",
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._body).toMatchObject({ error: expect.stringContaining("Invalid column") });
    });

    it("rejects invalid JSON body", async () => {
      const req = new EventEmitter() as IncomingMessage;
      req.method = "PATCH";
      req.url = "/vwp/dispatch/tasks/task-1/column";
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
  });

  describe("PATCH /vwp/dispatch/tasks/:id/position", () => {
    it("reorders a task on the board", async () => {
      await moveTask("task-1", "todo");
      await moveTask("task-2", "todo");

      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/task-2/position", {
        position: 0,
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ id: "task-2", position: 0 });
    });

    it("returns 404 for task not on board", async () => {
      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/nonexistent/position", {
        position: 0,
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it("rejects non-integer position", async () => {
      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/task-1/position", {
        position: 1.5,
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });

    it("rejects negative position", async () => {
      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/task-1/position", {
        position: -1,
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });
  });

  describe("PATCH /vwp/dispatch/tasks/:id/subtasks", () => {
    it("saves subtasks to checkpoint", async () => {
      // Create a task in checkpoint first
      const taskDir = join(FIXTURE_DIR, ".openclaw", "vwp", "tasks", "task-1");
      await mkdir(taskDir, { recursive: true });
      await writeFile(
        join(taskDir, "request.json"),
        JSON.stringify({ id: "task-1", text: "Test", createdAt: Date.now() }),
      );

      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/task-1/subtasks", {
        subtasks: [
          { description: "Do thing A", domain: "finance" },
          { description: "Do thing B", domain: "ops" },
        ],
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toMatchObject({
        id: "task-1",
        subtasks: expect.arrayContaining([expect.objectContaining({ description: "Do thing A" })]),
      });
    });

    it("returns 404 for unknown task", async () => {
      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/nonexistent/subtasks", {
        subtasks: [{ description: "Do", domain: "ops" }],
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it("rejects empty subtask array", async () => {
      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/task-1/subtasks", {
        subtasks: [],
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });

    it("rejects subtasks missing required fields", async () => {
      const req = createMockReq("PATCH", "/vwp/dispatch/tasks/task-1/subtasks", {
        subtasks: [{ description: "Missing domain" }],
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });
  });

  describe("GET /vwp/dispatch/tasks/:id/activity", () => {
    it("returns empty entries when no activity exists", async () => {
      const req = createMockReq("GET", "/vwp/dispatch/tasks/task-1/activity");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ entries: [] });
    });

    it("returns activity entries from file", async () => {
      const taskDir = join(FIXTURE_DIR, ".openclaw", "vwp", "tasks", "task-1");
      await mkdir(taskDir, { recursive: true });
      const entries = [
        {
          id: "a1",
          taskId: "task-1",
          timestamp: Date.now(),
          type: "status_change",
          action: "move",
          detail: "Moved to in_progress",
        },
      ];
      await writeFile(join(taskDir, "activity.json"), JSON.stringify(entries));

      const req = createMockReq("GET", "/vwp/dispatch/tasks/task-1/activity");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect((res._body as { entries: unknown[] }).entries).toHaveLength(1);
    });
  });

  describe("GET /vwp/dispatch/board", () => {
    it("returns the full board state with enriched task data", async () => {
      // Create a task in checkpoint
      const taskDir = join(FIXTURE_DIR, ".openclaw", "vwp", "tasks", "task-1");
      await mkdir(taskDir, { recursive: true });
      await writeFile(
        join(taskDir, "request.json"),
        JSON.stringify({ id: "task-1", text: "Build dashboard", createdAt: Date.now() }),
      );

      // Add task to board
      await moveTask("task-1", "backlog");

      const req = createMockReq("GET", "/vwp/dispatch/board");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      const body = res._body as {
        columns: Record<string, unknown[]>;
        updatedAt: number;
      };
      expect(body.columns.backlog).toHaveLength(1);
      expect(body.columns.backlog[0]).toMatchObject({
        id: "task-1",
        text: "Build dashboard",
        status: "queued",
      });
      expect(body.columns.todo).toEqual([]);
    });
  });

  describe("unmatched routes", () => {
    it("returns false for non-dispatch routes", async () => {
      const req = createMockReq("GET", "/vwp/approval/something");
      const res = createMockRes();
      const handled = await handler(req, res);

      expect(handled).toBe(false);
    });
  });
});
