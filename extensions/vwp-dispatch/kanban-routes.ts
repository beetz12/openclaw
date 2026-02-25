/**
 * Kanban HTTP routes — PATCH/GET endpoints for board state management.
 *
 * Follows the same pattern as routes.ts: raw Node.js http, bearer auth,
 * jsonResponse helper.
 */

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSharedSSE } from "../vwp-approval/sse.js";
import type { AgentStateManager } from "./agent-state.js";
import * as boardState from "./board-state.js";
import * as checkpoint from "./checkpoint.js";
import type { KanbanColumnId, ActivityEntry, KanbanSSEEvent } from "./kanban-types.js";
import { KANBAN_COLUMNS } from "./kanban-types.js";
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

function isValidColumn(value: unknown): value is KanbanColumnId {
  return typeof value === "string" && (KANBAN_COLUMNS as readonly string[]).includes(value);
}

function isHighImpactActivity(action: string, detail: string): boolean {
  const text = `${action} ${detail}`.toLowerCase();
  return (
    text.includes("blocked") ||
    text.includes("failed") ||
    text.includes("error") ||
    text.includes("critical")
  );
}

async function notifyTelegramHighImpact(
  taskId: string,
  action: string,
  detail: string,
): Promise<void> {
  const token = process.env.OPENCLAW_VWP_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OPENCLAW_VWP_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const text = `⚠️ High-impact activity\nTask: ${taskId}\nAction: ${action}\nDetail: ${detail}`;
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // Best-effort notification only
  }
}

export type KanbanRoutesDeps = {
  gatewayToken: string | undefined;
  onSSE?: (event: KanbanSSEEvent) => void;
  agentState?: AgentStateManager;
};

export function createKanbanHttpHandler(deps: KanbanRoutesDeps) {
  const { gatewayToken, onSSE, agentState } = deps;

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

    // Only handle kanban-specific dispatch routes
    if (!pathname.startsWith("/vwp/dispatch/")) {
      return false;
    }

    // PATCH /vwp/dispatch/tasks/:id/column
    const columnMatch =
      req.method === "PATCH" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/column$/);
    if (columnMatch) {
      if (!checkAuth(req, res)) return true;
      const taskId = columnMatch[1];

      let column: KanbanColumnId;
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { column?: unknown };
        if (!isValidColumn(body.column)) {
          jsonResponse(res, 400, {
            error: `Invalid column. Must be one of: ${KANBAN_COLUMNS.join(", ")}`,
          });
          return true;
        }
        column = body.column;
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      const result = await boardState.moveTask(taskId, column);
      onSSE?.({
        type: "task_column_changed",
        taskId,
        from: result.from ?? column,
        to: result.to,
      });
      jsonResponse(res, 200, { id: taskId, column });
      return true;
    }

    // PATCH /vwp/dispatch/tasks/:id/position
    const positionMatch =
      req.method === "PATCH" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/position$/);
    if (positionMatch) {
      if (!checkAuth(req, res)) return true;
      const taskId = positionMatch[1];

      let position: number;
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { position?: unknown };
        if (
          typeof body.position !== "number" ||
          !Number.isInteger(body.position) ||
          body.position < 0
        ) {
          jsonResponse(res, 400, { error: "Invalid position. Must be a non-negative integer." });
          return true;
        }
        position = body.position;
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      const moved = await boardState.reorderTask(taskId, position);
      if (!moved) {
        jsonResponse(res, 404, { error: "Task not found on board" });
        return true;
      }
      jsonResponse(res, 200, { id: taskId, position });
      return true;
    }

    // PATCH /vwp/dispatch/tasks/:id/subtasks
    const subtasksMatch =
      req.method === "PATCH" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/subtasks$/);
    if (subtasksMatch) {
      if (!checkAuth(req, res)) return true;
      const taskId = subtasksMatch[1];

      let subtasks: Array<{ id?: string; description: string; domain: string }>;
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { subtasks?: unknown };
        if (!Array.isArray(body.subtasks) || body.subtasks.length === 0) {
          jsonResponse(res, 400, { error: "subtasks must be a non-empty array" });
          return true;
        }
        for (const st of body.subtasks) {
          if (!st || typeof st.description !== "string" || typeof st.domain !== "string") {
            jsonResponse(res, 400, {
              error: "Each subtask must have description and domain strings",
            });
            return true;
          }
        }
        subtasks = body.subtasks;
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      // Verify task exists
      const task = await checkpoint.getTaskStatus(taskId);
      if (!task.request) {
        jsonResponse(res, 404, { error: "Task not found" });
        return true;
      }

      // Save as decomposition
      const domains = [...new Set(subtasks.map((s) => s.domain))];
      await checkpoint.saveDecomposition(taskId, {
        subtasks: subtasks.map((s) => ({ description: s.description, domain: s.domain })),
        domains,
        estimatedComplexity:
          subtasks.length <= 2 ? "low" : subtasks.length <= 5 ? "medium" : "high",
      });

      jsonResponse(res, 200, { id: taskId, subtasks });
      return true;
    }

    // POST /vwp/dispatch/tasks/:id/activity
    const activityPostMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/activity$/);
    if (activityPostMatch) {
      if (!checkAuth(req, res)) return true;
      const taskId = activityPostMatch[1];

      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as {
          type?: ActivityEntry["type"];
          action?: string;
          detail?: string;
          agentName?: string;
        };
        if (!body.type || !body.action || !body.detail) {
          jsonResponse(res, 400, { error: "type, action, detail are required" });
          return true;
        }

        const entry: ActivityEntry = {
          id: crypto.randomUUID(),
          taskId,
          timestamp: Date.now(),
          type: body.type,
          action: body.action,
          detail: body.detail,
          agentName: body.agentName,
        };

        await checkpoint.saveActivity(taskId, entry);

        if (isHighImpactActivity(body.action, body.detail)) {
          void notifyTelegramHighImpact(taskId, body.action, body.detail);
        }

        onSSE?.({
          type: "agent_action",
          taskId,
          agentName: body.agentName ?? "orchestrator",
          action: body.action,
          detail: body.detail,
        });
        jsonResponse(res, 201, { entry });
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

    // GET /vwp/dispatch/tasks/:id/activity
    const activityMatch =
      req.method === "GET" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/activity$/);
    if (activityMatch) {
      if (!checkAuth(req, res)) return true;
      const taskId = activityMatch[1];

      const activityFile = join(homedir(), ".openclaw", "vwp", "tasks", taskId, "activity.json");

      let entries: ActivityEntry[] = [];
      try {
        const raw = await readFile(activityFile, "utf-8");
        entries = JSON.parse(raw) as ActivityEntry[];
      } catch {
        // No activity yet
      }

      jsonResponse(res, 200, { entries });
      return true;
    }

    // POST /vwp/dispatch/tasks/:id/deliverables
    const deliverablePostMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/deliverables$/);
    if (deliverablePostMatch) {
      if (!checkAuth(req, res)) return true;
      const taskId = deliverablePostMatch[1];

      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as {
          type?: "file" | "url" | "artifact";
          title?: string;
          path?: string;
          description?: string;
        };
        if (!body.type || !body.title) {
          jsonResponse(res, 400, { error: "type and title are required" });
          return true;
        }
        const entry = {
          id: crypto.randomUUID(),
          taskId,
          timestamp: Date.now(),
          type: body.type,
          title: body.title,
          path: body.path,
          description: body.description,
        };
        await checkpoint.saveDeliverable(taskId, entry);
        jsonResponse(res, 201, { entry });
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

    // GET /vwp/dispatch/tasks/:id/deliverables
    const deliverableGetMatch =
      req.method === "GET" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/deliverables$/);
    if (deliverableGetMatch) {
      if (!checkAuth(req, res)) return true;
      const taskId = deliverableGetMatch[1];
      const entries = await checkpoint.getDeliverables(taskId);
      jsonResponse(res, 200, { entries });
      return true;
    }

    // POST /vwp/dispatch/tasks/:id/subagent
    const subagentPostMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/subagent$/);
    if (subagentPostMatch) {
      if (!checkAuth(req, res)) return true;
      const taskId = subagentPostMatch[1];

      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as {
          sessionId?: string;
          agentName?: string;
          status?: "active" | "completed" | "failed";
          note?: string;
        };
        if (!body.sessionId || !body.agentName) {
          jsonResponse(res, 400, { error: "sessionId and agentName are required" });
          return true;
        }
        const entry = {
          id: crypto.randomUUID(),
          taskId,
          timestamp: Date.now(),
          sessionId: body.sessionId,
          agentName: body.agentName,
          status: body.status ?? "active",
          note: body.note,
        };
        await checkpoint.saveSubagent(taskId, entry);
        jsonResponse(res, 201, { entry });
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

    // GET /vwp/dispatch/tasks/:id/subagent
    const subagentGetMatch =
      req.method === "GET" && pathname.match(/^\/vwp\/dispatch\/tasks\/([^/]+)\/subagent$/);
    if (subagentGetMatch) {
      if (!checkAuth(req, res)) return true;
      const taskId = subagentGetMatch[1];
      const entries = await checkpoint.getSubagents(taskId);
      jsonResponse(res, 200, { entries });
      return true;
    }

    // GET /vwp/events (SSE stream)
    if (req.method === "GET" && pathname === "/vwp/events") {
      if (!checkAuth(req, res)) return true;
      const sse = getSharedSSE();
      const added = sse.addConnection(res, req);
      if (!added) {
        jsonResponse(res, 429, { error: "Too many SSE connections" });
      }
      return true;
    }

    // GET /vwp/dispatch/activity?limit=200
    if (req.method === "GET" && pathname === "/vwp/dispatch/activity") {
      if (!checkAuth(req, res)) return true;

      const limitParam = Number(url.searchParams.get("limit") ?? "200");
      const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(1000, limitParam)) : 200;

      const taskIds = await checkpoint.listTasks();
      const grouped = await Promise.all(
        taskIds.map(async (taskId) => ({ taskId, entries: await checkpoint.getActivity(taskId) })),
      );

      const entries = grouped
        .flatMap(({ taskId, entries }) => entries.map((entry) => ({ ...entry, taskId })))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      jsonResponse(res, 200, { entries });
      return true;
    }

    // GET /vwp/dispatch/board
    if (req.method === "GET" && pathname === "/vwp/dispatch/board") {
      if (!checkAuth(req, res)) return true;

      const board = await boardState.getBoard();
      const allTaskIds = new Set<string>();
      for (const col of KANBAN_COLUMNS) {
        for (const id of board.columns[col]) {
          allTaskIds.add(id);
        }
      }

      // Enrich with task data
      const taskData: Record<
        string,
        {
          id: string;
          text: string | null;
          status: string;
          subtaskCount: number;
          assignment: {
            assignedAgentId: string | null;
            assignedRole: string | null;
            assignmentMode: "auto" | "manual-lock";
          };
        }
      > = {};
      await Promise.all(
        [...allTaskIds].map(async (id) => {
          const status = await checkpoint.getTaskStatus(id);
          const decomposition = status.decomposition;

          let derivedStatus = status.final?.status ?? (decomposition ? "confirming" : "queued");
          const currentColumn = (Object.entries(board.columns).find(([, ids]) =>
            ids.includes(id),
          )?.[0] ?? "todo") as KanbanColumnId;
          if (
            (currentColumn === "backlog" || currentColumn === "todo") &&
            derivedStatus === "failed"
          ) {
            derivedStatus = decomposition ? "confirming" : "queued";
          }
          if (currentColumn === "done" && derivedStatus === "failed") {
            derivedStatus = "completed";
          }

          taskData[id] = {
            id,
            text: status.request?.text ?? null,
            priority: status.request?.priority ?? "medium",
            status: derivedStatus,
            subtaskCount: decomposition?.subtasks?.length ?? 0,
            assignment: {
              assignedAgentId: status.assignment.assignedAgentId,
              assignedRole: status.assignment.assignedRole,
              assignmentMode: status.assignment.assignmentMode,
            },
          };
        }),
      );

      // Build enriched columns
      const columns: Record<
        string,
        Array<{
          id: string;
          text: string | null;
          priority: "low" | "medium" | "high" | "urgent";
          status: string;
          subtaskCount: number;
          assignment: {
            assignedAgentId: string | null;
            assignedRole: string | null;
            assignmentMode: "auto" | "manual-lock";
          };
        }>
      > = {};
      for (const col of KANBAN_COLUMNS) {
        columns[col] = board.columns[col].map(
          (id) =>
            taskData[id] ?? {
              id,
              text: null,
              status: "unknown",
              subtaskCount: 0,
              assignment: { assignedAgentId: null, assignedRole: null, assignmentMode: "auto" },
            },
        );
      }

      jsonResponse(res, 200, { columns, updatedAt: board.updatedAt });
      return true;
    }

    // GET /vwp/dispatch/agents — list all tracked agents
    if (req.method === "GET" && pathname === "/vwp/dispatch/agents") {
      if (!checkAuth(req, res)) return true;
      const agents = agentState?.getAll() ?? [];
      jsonResponse(res, 200, agents);
      return true;
    }

    // GET /vwp/dispatch/agents/:agentId/logs — get agent logs
    const agentLogsMatch = pathname.match(/^\/vwp\/dispatch\/agents\/([^/]+)\/logs$/);
    if (req.method === "GET" && agentLogsMatch) {
      if (!checkAuth(req, res)) return true;
      const logs = agentState?.getLogs(agentLogsMatch[1]) ?? [];
      jsonResponse(res, 200, logs);
      return true;
    }

    // Not a kanban route — pass through
    return false;
  };
}
