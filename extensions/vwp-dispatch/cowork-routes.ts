/**
 * HTTP routes for CoWork agent sessions.
 *
 * Routes:
 *   POST /vwp/cowork/start     — start a cowork session on a project
 *   POST /vwp/cowork/send      — send follow-up message to active session
 *   POST /vwp/cowork/cancel    — cancel active session
 *   GET  /vwp/cowork/status    — get active session info
 *   GET  /vwp/cowork/sessions  — list recent sessions
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { CoworkSSEEvent } from "./kanban-types.js";
import type { Project } from "./project-registry.js";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";
import {
  startCoworkSession,
  cancelCoworkSession,
  sendToCoworkSession,
  getActiveSession,
  getRecentSessions,
} from "./cowork-agent.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

export type CoworkRoutesDeps = {
  gatewayToken: string | undefined;
  onSSE?: (event: CoworkSSEEvent) => void;
  getProjects: () => Promise<Project[]>;
  getProject: (id: string) => Promise<Project | null>;
};

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

export function createCoworkHttpHandler(deps: CoworkRoutesDeps) {
  const { gatewayToken, onSSE } = deps;

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

    // Only handle /vwp/cowork/ routes
    if (!pathname.startsWith("/vwp/cowork/")) {
      return false;
    }

    // Auth check for all cowork routes
    if (!checkAuth(req, res)) return true;

    // POST /vwp/cowork/start — start a cowork session
    if (req.method === "POST" && pathname === "/vwp/cowork/start") {
      let body: {
        projectId?: string;
        prompt?: string;
        model?: string;
        permissionMode?: string;
        maxBudgetUsd?: number;
        maxTurns?: number;
      };
      try {
        const raw = await readBody(req);
        body = JSON.parse(raw);
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      if (!body.projectId || typeof body.projectId !== "string") {
        jsonResponse(res, 400, { error: "Missing required field: projectId" });
        return true;
      }
      if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
        jsonResponse(res, 400, { error: "Missing required field: prompt" });
        return true;
      }

      // Look up project
      const project = await deps.getProject(body.projectId);
      if (!project) {
        jsonResponse(res, 404, { error: `Project '${body.projectId}' not found` });
        return true;
      }

      // Check if a session is already running
      const active = getActiveSession();
      if (active && active.status === "running") {
        jsonResponse(res, 409, {
          error: "A cowork session is already running",
          sessionId: active.id,
        });
        return true;
      }

      // Validate permissionMode
      const permissionMode =
        body.permissionMode === "bypassPermissions" ? "bypassPermissions" : "acceptEdits";

      try {
        const session = await startCoworkSession({
          projectId: body.projectId,
          rootPath: project.rootPath,
          prompt: body.prompt.trim(),
          model: body.model,
          mcpServers: project.mcpServers,
          onEvent: (event) => onSSE?.(event),
          maxBudgetUsd: body.maxBudgetUsd,
          maxTurns: body.maxTurns,
          permissionMode,
        });

        jsonResponse(res, 202, { sessionId: session.id });
      } catch (err) {
        jsonResponse(res, 500, {
          error: err instanceof Error ? err.message : "Failed to start session",
        });
      }
      return true;
    }

    // POST /vwp/cowork/send — send follow-up message to active session
    if (req.method === "POST" && pathname === "/vwp/cowork/send") {
      let body: { message?: string };
      try {
        const raw = await readBody(req);
        body = JSON.parse(raw);
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
        jsonResponse(res, 400, { error: "Missing required field: message" });
        return true;
      }

      const active = getActiveSession();
      if (!active || active.status !== "running") {
        jsonResponse(res, 404, { error: "No active cowork session" });
        return true;
      }

      const sent = await sendToCoworkSession(body.message.trim());
      if (!sent) {
        jsonResponse(res, 501, {
          error: "Follow-up messages not yet supported (requires Agent SDK V2)",
        });
        return true;
      }

      jsonResponse(res, 200, { sent: true });
      return true;
    }

    // POST /vwp/cowork/cancel — cancel active session
    if (req.method === "POST" && pathname === "/vwp/cowork/cancel") {
      const cancelled = await cancelCoworkSession();
      if (!cancelled) {
        jsonResponse(res, 404, { error: "No active cowork session to cancel" });
        return true;
      }
      jsonResponse(res, 200, { cancelled: true });
      return true;
    }

    // GET /vwp/cowork/status — get active session info
    if (req.method === "GET" && pathname === "/vwp/cowork/status") {
      const active = getActiveSession();
      if (!active) {
        jsonResponse(res, 200, { active: false });
        return true;
      }
      jsonResponse(res, 200, {
        active: true,
        session: {
          id: active.id,
          projectId: active.projectId,
          status: active.status,
          startedAt: active.startedAt,
          completedAt: active.completedAt,
          costUsd: active.costUsd,
          error: active.error,
        },
      });
      return true;
    }

    // GET /vwp/cowork/sessions — list recent sessions
    if (req.method === "GET" && pathname === "/vwp/cowork/sessions") {
      const recent = getRecentSessions().map((s) => ({
        id: s.id,
        projectId: s.projectId,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        costUsd: s.costUsd,
        error: s.error,
      }));
      jsonResponse(res, 200, { sessions: recent });
      return true;
    }

    // Not a cowork route we handle
    return false;
  };
}
