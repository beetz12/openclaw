/**
 * HTTP routes bridging gateway cron RPC methods to REST.
 *
 * Routes:
 *   GET    /vwp/cron/status          — cron scheduler status
 *   GET    /vwp/cron/jobs            — list all cron jobs
 *   POST   /vwp/cron/jobs            — create a cron job
 *   PATCH  /vwp/cron/jobs/:id        — update a cron job
 *   DELETE /vwp/cron/jobs/:id        — remove a cron job
 *   POST   /vwp/cron/jobs/:id/run    — trigger a cron job
 *   GET    /vwp/cron/jobs/:id/runs   — get run history
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayClient } from "./gateway-client.js";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

export type CronRoutesDeps = {
  gatewayToken: string | undefined;
  gateway: GatewayClient | (() => GatewayClient | undefined);
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
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

export function createCronHttpHandler(deps: CronRoutesDeps) {
  const { gatewayToken } = deps;

  const resolveGateway = (): GatewayClient | undefined =>
    typeof deps.gateway === "function" ? deps.gateway() : deps.gateway;

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const token = getBearerToken(req);
    if (!gatewayToken || !safeEqualSecret(token, gatewayToken)) {
      jsonResponse(res, 401, { error: "Unauthorized" });
      return false;
    }
    return true;
  }

  function requireGateway(res: ServerResponse): GatewayClient | null {
    const gw = resolveGateway();
    if (!gw || !gw.isConnected()) {
      jsonResponse(res, 503, { error: "Gateway not connected" });
      return null;
    }
    return gw;
  }

  // Extract :id from /vwp/cron/jobs/:id or /vwp/cron/jobs/:id/run etc.
  const JOB_ID_RE = /^\/vwp\/cron\/jobs\/([^/]+)/;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    // Only handle cron routes
    if (!pathname.startsWith("/vwp/cron/")) return false;
    if (!checkAuth(req, res)) return true;

    // GET /vwp/cron/status
    if (req.method === "GET" && pathname === "/vwp/cron/status") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("cron.status", {});
        jsonResponse(res, 200, result);
      } catch (err) {
        jsonResponse(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/cron/jobs — list all jobs
    if (req.method === "GET" && pathname === "/vwp/cron/jobs") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("cron.list", { includeDisabled: true });
        jsonResponse(res, 200, result);
      } catch (err) {
        jsonResponse(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // POST /vwp/cron/jobs — create job
    if (req.method === "POST" && pathname === "/vwp/cron/jobs") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const result = await gw.call("cron.add", body);
        jsonResponse(res, 201, result);
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
        } else {
          jsonResponse(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
      }
      return true;
    }

    // Match job-specific routes: /vwp/cron/jobs/:id[/action]
    const idMatch = pathname.match(JOB_ID_RE);
    if (!idMatch) return false;

    const jobId = decodeURIComponent(idMatch[1]);
    const suffix = pathname.slice(idMatch[0].length); // "" or "/run" or "/runs"

    // PATCH /vwp/cron/jobs/:id — update job
    if (req.method === "PATCH" && suffix === "") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const result = await gw.call("cron.update", { id: jobId, patch: body });
        jsonResponse(res, 200, result);
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
        } else {
          jsonResponse(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
      }
      return true;
    }

    // DELETE /vwp/cron/jobs/:id — remove job
    if (req.method === "DELETE" && suffix === "") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("cron.remove", { id: jobId });
        jsonResponse(res, 200, result);
      } catch (err) {
        jsonResponse(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // POST /vwp/cron/jobs/:id/run — trigger job
    if (req.method === "POST" && suffix === "/run") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const result = await gw.call("cron.run", { id: jobId, mode: "force" });
        jsonResponse(res, 200, result);
      } catch (err) {
        jsonResponse(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // GET /vwp/cron/jobs/:id/runs — run history
    if (req.method === "GET" && suffix === "/runs") {
      const gw = requireGateway(res);
      if (!gw) return true;
      try {
        const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
        const result = await gw.call("cron.runs", { id: jobId, limit: Math.min(limit, 200) });
        jsonResponse(res, 200, result);
      } catch (err) {
        jsonResponse(res, 502, { error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    return false;
  };
}
