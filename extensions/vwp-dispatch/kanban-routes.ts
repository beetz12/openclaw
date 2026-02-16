/**
 * Kanban HTTP routes — PATCH/GET endpoints for board state management.
 *
 * Follows the same pattern as routes.ts: raw Node.js http, bearer auth,
 * jsonResponse helper.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentStateManager } from "./agent-state.js";
import type { KanbanColumnId, ActivityEntry, KanbanSSEEvent } from "./kanban-types.js";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";
import * as boardState from "./board-state.js";
import * as checkpoint from "./checkpoint.js";
import { KANBAN_COLUMNS } from "./kanban-types.js";

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
        { id: string; text: string | null; status: string; subtaskCount: number }
      > = {};
      await Promise.all(
        [...allTaskIds].map(async (id) => {
          const status = await checkpoint.getTaskStatus(id);
          const decomposition = status.decomposition;
          taskData[id] = {
            id,
            text: status.request?.text ?? null,
            status: status.final?.status ?? (decomposition ? "confirming" : "queued"),
            subtaskCount: decomposition?.subtasks?.length ?? 0,
          };
        }),
      );

      // Build enriched columns
      const columns: Record<
        string,
        Array<{ id: string; text: string | null; status: string; subtaskCount: number }>
      > = {};
      for (const col of KANBAN_COLUMNS) {
        columns[col] = board.columns[col].map(
          (id) => taskData[id] ?? { id, text: null, status: "unknown", subtaskCount: 0 },
        );
      }

      jsonResponse(res, 200, { columns, updatedAt: board.updatedAt });
      return true;
    }

    // GET /vwp/dispatch/agents — list all tracked agents
    if (req.method === "GET" && pathname === "/vwp/dispatch/agents") {
      if (!checkAuth(req, res)) return true;
      const agents = agentState?.getAll() ?? [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(agents));
      return true;
    }

    // GET /vwp/dispatch/agents/:agentId/logs — get agent logs
    const agentLogsMatch = pathname.match(/^\/vwp\/dispatch\/agents\/([^/]+)\/logs$/);
    if (req.method === "GET" && agentLogsMatch) {
      if (!checkAuth(req, res)) return true;
      const logs = agentState?.getLogs(agentLogsMatch[1]) ?? [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(logs));
      return true;
    }

    // Not a kanban route — pass through
    return false;
  };
}
