import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { TaskQueue } from "./task-queue.js";
import type { TaskRequest } from "./types.js";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";
import * as checkpoint from "./checkpoint.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("body_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export type DispatchRoutesDeps = {
  queue: TaskQueue;
  gatewayToken: string | undefined;
  onConfirm?: (task: TaskRequest) => void;
};

export function createDispatchHttpHandler(deps: DispatchRoutesDeps) {
  const { queue, gatewayToken, onConfirm } = deps;

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const token = getBearerToken(req);
    if (!gatewayToken || !safeEqualSecret(token, gatewayToken)) {
      jsonResponse(res, 401, { error: "Unauthorized" });
      return false;
    }
    return true;
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    // Only handle /vwp/dispatch/* routes
    if (!pathname.startsWith("/vwp/dispatch/")) {
      return false;
    }

    // Auth check for all dispatch routes
    if (!checkAuth(req, res)) return true;

    // POST /vwp/dispatch/submit — submit new task
    if (req.method === "POST" && pathname === "/vwp/dispatch/submit") {
      let text: string;
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { text?: string };
        if (!body.text || typeof body.text !== "string" || !body.text.trim()) {
          jsonResponse(res, 400, { error: "Missing required field: text" });
          return true;
        }
        text = body.text.trim();
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      const task: TaskRequest = {
        id: randomUUID(),
        text,
        createdAt: Date.now(),
      };

      await checkpoint.createTask(task.id, task);
      const position = await queue.enqueue(task);

      jsonResponse(res, 201, {
        id: task.id,
        text: task.text,
        position,
        createdAt: task.createdAt,
      });
      return true;
    }

    // GET /vwp/dispatch/tasks — list all tasks
    if (req.method === "GET" && pathname === "/vwp/dispatch/tasks") {
      const taskIds = await checkpoint.listTasks();
      const tasks = await Promise.all(
        taskIds.map(async (id) => {
          const status = await checkpoint.getTaskStatus(id);
          return {
            id,
            text: status.request?.text ?? null,
            status: status.final?.status ?? (status.decomposition ? "confirming" : "queued"),
            createdAt: status.request?.createdAt ?? null,
          };
        }),
      );
      jsonResponse(res, 200, { tasks });
      return true;
    }

    // GET /vwp/dispatch/tasks/:id — get task status + results
    const taskDetailMatch =
      req.method === "GET" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)$/);
    if (taskDetailMatch) {
      const id = taskDetailMatch[1];
      const data = await checkpoint.getTask(id);
      if (!data.request) {
        jsonResponse(res, 404, { error: "Task not found" });
        return true;
      }
      jsonResponse(res, 200, {
        id,
        request: data.request,
        decomposition: data.decomposition,
        subtaskResults: data.subtaskResults,
        final: data.final,
      });
      return true;
    }

    // DELETE /vwp/dispatch/tasks/:id — cancel task
    const taskDeleteMatch =
      req.method === "DELETE" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)$/);
    if (taskDeleteMatch) {
      const id = taskDeleteMatch[1];
      const cancelled = await queue.cancel(id);
      if (!cancelled) {
        jsonResponse(res, 404, { error: "Task not found in queue" });
        return true;
      }
      jsonResponse(res, 200, { id, status: "cancelled" });
      return true;
    }

    // GET /vwp/dispatch/queue — get queue state
    if (req.method === "GET" && pathname === "/vwp/dispatch/queue") {
      const active = queue.getActive();
      const pending = queue.getQueue();
      jsonResponse(res, 200, {
        active: active ? { id: active.id, text: active.text } : null,
        pending: pending.map((t) => ({ id: t.id, text: t.text })),
        length: pending.length,
      });
      return true;
    }

    // POST /vwp/dispatch/confirm/:id — confirm task decomposition + cost
    const confirmMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/dispatch\/confirm\/([^/]+)$/);
    if (confirmMatch) {
      const id = confirmMatch[1];
      const data = await checkpoint.getTaskStatus(id);
      if (!data.request) {
        jsonResponse(res, 404, { error: "Task not found" });
        return true;
      }
      if (!data.decomposition) {
        jsonResponse(res, 409, { error: "Task has no decomposition to confirm" });
        return true;
      }

      onConfirm?.(data.request);
      jsonResponse(res, 200, { id, status: "dispatching" });
      return true;
    }

    return false;
  };
}
