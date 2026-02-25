import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadWorkforceAgents, pickBestAgent } from "./assignment-engine.js";
import { getBoard, moveTask } from "./board-state.js";
import * as checkpoint from "./checkpoint.js";
import { hasDecomposition } from "./checkpoint.js";
import { sanitizeTaskText } from "./sanitize.js";
import type { TaskQueue } from "./task-queue.js";
import type { TaskRequest } from "./types.js";
import { getBearerToken, safeEqualSecret } from "./upstream-imports.js";

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
      let priority: "low" | "medium" | "high" | "urgent" = "medium";
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as {
          text?: string;
          priority?: "low" | "medium" | "high" | "urgent";
        };
        if (!body.text || typeof body.text !== "string" || !body.text.trim()) {
          jsonResponse(res, 400, { error: "Missing required field: text" });
          return true;
        }
        text = body.text.trim();
        if (body.priority && ["low", "medium", "high", "urgent"].includes(body.priority)) {
          priority = body.priority;
        }
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      // Sanitize the task text
      try {
        text = sanitizeTaskText(text);
      } catch {
        jsonResponse(res, 400, { error: "Task text is empty" });
        return true;
      }

      const task: TaskRequest = {
        id: randomUUID(),
        text,
        priority,
        createdAt: Date.now(),
      };

      await checkpoint.createTask(task.id, task);
      await moveTask(task.id, "todo");
      const preview = task.text.replace(/\s+/g, " ").trim().slice(0, 120);
      const truncated = task.text.length > 120 ? "…" : "";
      await checkpoint.saveActivity(task.id, {
        id: randomUUID(),
        taskId: task.id,
        timestamp: Date.now(),
        type: "status_change",
        action: "task_created",
        detail: `Task queued (${task.priority}) — ${preview}${truncated}`,
      });
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
            priority: status.request?.priority ?? "medium",
            assignment: {
              assignedAgentId: status.assignment.assignedAgentId,
              assignedRole: status.assignment.assignedRole,
              assignmentMode: status.assignment.assignmentMode,
            },
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
      const board = await getBoard();
      const position = board.positions[id];
      jsonResponse(res, 200, {
        id,
        request: data.request,
        decomposition: data.decomposition,
        subtaskResults: data.subtaskResults,
        final: data.final,
        assignment: data.assignment,
        column: position?.column ?? null,
        position: position?.position ?? 0,
      });
      return true;
    }

    // POST /vwp/dispatch/tasks/:id/assign — manual assignment (optionally lock)
    const assignMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/assign$/);
    if (assignMatch) {
      const id = assignMatch[1];
      const data = await checkpoint.getTaskStatus(id);
      if (!data.request) {
        jsonResponse(res, 404, { error: "Task not found" });
        return true;
      }

      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as {
          agentId?: string;
          role?: string;
          requiredSkills?: string[];
          mode?: "auto" | "manual-lock";
          reason?: string;
        };

        if (!body.agentId) {
          jsonResponse(res, 400, { error: "agentId is required" });
          return true;
        }

        await checkpoint.saveAssignmentProfile(id, {
          assignedAgentId: body.agentId,
          assignedRole: body.role ?? null,
          requiredSkills: Array.isArray(body.requiredSkills)
            ? body.requiredSkills
            : data.assignment.requiredSkills,
          assignmentMode: body.mode ?? "manual-lock",
          assignmentReason: body.reason ?? "Manual assignment",
        });
        await checkpoint.saveActivity(id, {
          id: randomUUID(),
          taskId: id,
          timestamp: Date.now(),
          type: "agent_action",
          action: "assignment_manual",
          detail: `Assigned to ${body.agentId} (${body.role ?? "role-unspecified"})`,
          agentName: "manager",
        });

        const updated = await checkpoint.getTaskStatus(id);
        jsonResponse(res, 200, { id, assignment: updated.assignment });
        return true;
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }
    }

    // POST /vwp/dispatch/tasks/:id/auto-assign — deterministic assignment
    const autoAssignMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/auto-assign$/);
    if (autoAssignMatch) {
      const id = autoAssignMatch[1];
      const data = await checkpoint.getTaskStatus(id);
      if (!data.request) {
        jsonResponse(res, 404, { error: "Task not found" });
        return true;
      }

      const agents = await loadWorkforceAgents();
      const roleHint = url.searchParams.get("role") ?? undefined;
      const requiredSkills = url.searchParams.get("skills")
        ? url.searchParams
            .get("skills")!
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : data.assignment.requiredSkills;

      const decision = pickBestAgent(agents, {
        roleHint,
        requiredSkills,
        manualLock: data.assignment.assignmentMode === "manual-lock",
        existing: data.assignment,
      });

      await checkpoint.saveAssignmentProfile(id, {
        assignedAgentId: decision.assignedAgentId,
        assignedRole: decision.assignedRole,
        requiredSkills: decision.requiredSkills,
        assignmentMode: decision.assignmentMode,
        assignmentReason: decision.assignmentReason,
      });
      await checkpoint.saveActivity(id, {
        id: randomUUID(),
        taskId: id,
        timestamp: Date.now(),
        type: "agent_action",
        action: "assignment_auto",
        detail: decision.assignmentReason,
        agentName: decision.assignedRole ?? "orchestrator",
      });

      const updated = await checkpoint.getTaskStatus(id);
      jsonResponse(res, 200, { id, assignment: updated.assignment, explain: decision });
      return true;
    }

    // POST /vwp/dispatch/tasks/:id/unlock-assignment — return to auto mode
    const unlockMatch =
      req.method === "POST" &&
      pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/unlock-assignment$/);
    if (unlockMatch) {
      const id = unlockMatch[1];
      const data = await checkpoint.getTaskStatus(id);
      if (!data.request) {
        jsonResponse(res, 404, { error: "Task not found" });
        return true;
      }

      await checkpoint.saveAssignmentProfile(id, {
        assignmentMode: "auto",
        assignmentReason: "Unlocked by user",
      });
      await checkpoint.saveActivity(id, {
        id: randomUUID(),
        taskId: id,
        timestamp: Date.now(),
        type: "agent_action",
        action: "assignment_unlocked",
        detail: "Assignment mode changed to auto",
        agentName: "manager",
      });
      const updated = await checkpoint.getTaskStatus(id);
      jsonResponse(res, 200, { id, assignment: updated.assignment });
      return true;
    }

    // GET /vwp/dispatch/tasks/:id/assignment-explain — preview scoring
    const explainMatch =
      req.method === "GET" &&
      pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/assignment-explain$/);
    if (explainMatch) {
      const id = explainMatch[1];
      const data = await checkpoint.getTaskStatus(id);
      if (!data.request) {
        jsonResponse(res, 404, { error: "Task not found" });
        return true;
      }

      const agents = await loadWorkforceAgents();
      const decision = pickBestAgent(agents, {
        roleHint: data.assignment.assignedRole ?? undefined,
        requiredSkills: data.assignment.requiredSkills,
        manualLock: data.assignment.assignmentMode === "manual-lock",
        existing: data.assignment,
      });
      jsonResponse(res, 200, { id, assignment: data.assignment, explain: decision });
      return true;
    }

    // POST /vwp/dispatch/tasks/:id/retry — reset failed task and requeue
    const retryMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/retry$/);
    if (retryMatch) {
      const id = retryMatch[1];
      const data = await checkpoint.getTaskStatus(id);
      if (!data.request) {
        jsonResponse(res, 404, { error: "Task not found" });
        return true;
      }

      await checkpoint.saveFinal(id, {
        taskId: id,
        status: "queued",
        subtasks: [],
      });
      await moveTask(id, "todo");
      const position = await queue.enqueue(data.request);
      await checkpoint.saveActivity(id, {
        id: randomUUID(),
        taskId: id,
        timestamp: Date.now(),
        type: "status_change",
        action: "task_retried",
        detail: "Task requeued for analysis",
      });

      jsonResponse(res, 200, { id, status: "queued", position });
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

      // Race guard: check if decomposition exists
      const analyzed = await hasDecomposition(id);
      if (!analyzed) {
        jsonResponse(res, 409, { error: "Task not yet analyzed — please wait" });
        return true;
      }

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
