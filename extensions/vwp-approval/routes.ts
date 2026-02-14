import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApprovalDB, PendingMessage } from "./db.js";
import type { ApprovalSSE } from "./sse.js";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";

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

export type ApprovalRoutesDeps = {
  db: ApprovalDB;
  sse: ApprovalSSE;
  gatewayToken: string | undefined;
  onApproved?: (msg: PendingMessage, deliverContent: string) => void;
};

export function createApprovalHttpHandler(deps: ApprovalRoutesDeps) {
  const { db, sse, gatewayToken, onApproved } = deps;

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

    // Only handle /vwp/* routes
    if (!pathname.startsWith("/vwp/")) {
      return false;
    }

    // SSE endpoint - check auth before connection
    if (req.method === "GET" && pathname === "/vwp/events") {
      if (!checkAuth(req, res)) return true;
      const added = sse.addConnection(res);
      if (!added) {
        jsonResponse(res, 429, { error: "Too many SSE connections" });
      }
      return true;
    }

    // Auth check for all other /vwp/* routes
    if (!checkAuth(req, res)) return true;

    // GET /vwp/pending
    if (req.method === "GET" && pathname === "/vwp/pending") {
      const channel = url.searchParams.get("channel") ?? undefined;
      const limitParam = url.searchParams.get("limit");
      const offsetParam = url.searchParams.get("offset");
      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
      const result = db.getPending({
        channel,
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
      });
      jsonResponse(res, 200, {
        messages: result.items,
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        hasMore: result.offset + result.items.length < result.total,
      });
      return true;
    }

    // GET /vwp/stats
    if (req.method === "GET" && pathname === "/vwp/stats") {
      const stats = db.getStats();
      jsonResponse(res, 200, { stats });
      return true;
    }

    // POST /vwp/approve/:id
    const approveMatch = req.method === "POST" && pathname.match(/^\/vwp\/approve\/([^/]+)$/);
    if (approveMatch) {
      const id = approveMatch[1];
      const msg = db.getById(id);
      if (!msg) {
        jsonResponse(res, 404, { error: "Message not found" });
        return true;
      }
      if (msg.status !== "pending") {
        jsonResponse(res, 409, { error: `Message already ${msg.status}` });
        return true;
      }

      let editedContent: string | undefined;
      try {
        const raw = await readBody(req);
        if (raw.trim()) {
          const body = JSON.parse(raw) as { editedContent?: string };
          editedContent = body.editedContent;
        }
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        // Ignore other parse errors; approve with original content
      }

      db.approve(id, editedContent);
      const deliverContent = editedContent ?? msg.content;

      sse.emit({ type: "message_approved", id, content: deliverContent });
      onApproved?.(msg, deliverContent);

      jsonResponse(res, 200, {
        id,
        status: "approved",
        content: deliverContent,
        to: msg.to,
        channel: msg.channel,
      });
      return true;
    }

    // POST /vwp/reject/:id
    const rejectMatch = req.method === "POST" && pathname.match(/^\/vwp\/reject\/([^/]+)$/);
    if (rejectMatch) {
      const id = rejectMatch[1];
      const msg = db.getById(id);
      if (!msg) {
        jsonResponse(res, 404, { error: "Message not found" });
        return true;
      }
      if (msg.status !== "pending") {
        jsonResponse(res, 409, { error: `Message already ${msg.status}` });
        return true;
      }

      let reason: string | undefined;
      try {
        const raw = await readBody(req);
        if (raw.trim()) {
          const body = JSON.parse(raw) as { reason?: string };
          reason = body.reason;
        }
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        // Ignore parse errors
      }

      db.reject(id);
      sse.emit({ type: "message_rejected", id });
      jsonResponse(res, 200, { id, status: "rejected", reason });
      return true;
    }

    // GET /vwp/task-actions — list all pending task actions
    if (req.method === "GET" && pathname === "/vwp/task-actions") {
      const actions = db.getPendingTaskActions();
      jsonResponse(res, 200, { actions });
      return true;
    }

    // GET /vwp/task-actions/:taskId — actions for a specific task
    const taskActionsMatch =
      req.method === "GET" && pathname.match(/^\/vwp\/task-actions\/([^/]+)$/);
    if (taskActionsMatch) {
      const taskId = taskActionsMatch[1];
      const actions = db.getTaskActions(taskId);
      jsonResponse(res, 200, { actions });
      return true;
    }

    // POST /vwp/task-actions/:id/approve
    const taskActionApproveMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/task-actions\/([^/]+)\/approve$/);
    if (taskActionApproveMatch) {
      const id = taskActionApproveMatch[1];
      const action = db.getTaskActionById(id);
      if (!action) {
        jsonResponse(res, 404, { error: "Task action not found" });
        return true;
      }
      if (action.status !== "pending") {
        jsonResponse(res, 409, { error: `Task action already ${action.status}` });
        return true;
      }

      db.approveTaskAction(id);
      sse.emit({ type: "task_action_approved", id });
      jsonResponse(res, 200, {
        id,
        status: "approved",
        action_type: action.action_type,
        task_id: action.task_id,
      });
      return true;
    }

    // POST /vwp/task-actions/:id/reject
    const taskActionRejectMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/task-actions\/([^/]+)\/reject$/);
    if (taskActionRejectMatch) {
      const id = taskActionRejectMatch[1];
      const action = db.getTaskActionById(id);
      if (!action) {
        jsonResponse(res, 404, { error: "Task action not found" });
        return true;
      }
      if (action.status !== "pending") {
        jsonResponse(res, 409, { error: `Task action already ${action.status}` });
        return true;
      }

      let reason: string | undefined;
      try {
        const raw = await readBody(req);
        if (raw.trim()) {
          const body = JSON.parse(raw) as { reason?: string };
          reason = body.reason;
        }
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
      }

      db.rejectTaskAction(id);
      sse.emit({ type: "task_action_rejected", id });
      jsonResponse(res, 200, { id, status: "rejected", reason });
      return true;
    }

    return false;
  };
}
