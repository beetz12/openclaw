/**
 * Usage, sessions, health, config, and channels REST bridge routes.
 *
 * Bridges gateway WebSocket RPC methods to REST endpoints:
 *
 *   GET  /vwp/usage/cost         — gateway.call("usage.cost", { days?, startDate?, endDate? })
 *   GET  /vwp/usage/sessions     — gateway.call("sessions.usage", { startDate?, endDate?, key?, limit? })
 *   GET  /vwp/sessions           — gateway.call("sessions.list", { limit?, search?, activeMinutes?, includeDerivedTitles, includeLastMessage })
 *   GET  /vwp/health             — gateway.call("health", {})
 *   GET  /vwp/gateway/status     — gateway.call("status", {})
 *   GET  /vwp/gateway/config     — gateway.call("config.get", {})
 *   GET  /vwp/channels/status    — gateway.call("channels.status", { probe: boolean })
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";
import type { GatewayClient } from "./gateway-client.js";

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export type UsageRoutesDeps = {
  gatewayToken: string | undefined;
  gateway: GatewayClient | (() => GatewayClient);
};

export function createUsageHttpHandler(deps: UsageRoutesDeps) {
  const { gatewayToken } = deps;

  function resolveGateway(): GatewayClient {
    return typeof deps.gateway === "function" ? deps.gateway() : deps.gateway;
  }

  function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const token = getBearerToken(req);
    if (!gatewayToken || !safeEqualSecret(token, gatewayToken)) {
      jsonResponse(res, 401, { error: "Unauthorized" });
      return false;
    }
    return true;
  }

  function checkGateway(res: ServerResponse): GatewayClient | null {
    const gw = resolveGateway();
    if (!gw.isConnected()) {
      jsonResponse(res, 503, { error: "Gateway not connected" });
      return null;
    }
    return gw;
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    // Only handle routes we own
    if (
      !pathname.startsWith("/vwp/usage/") &&
      pathname !== "/vwp/sessions" &&
      !pathname.startsWith("/vwp/sessions/") &&
      pathname !== "/vwp/health" &&
      !pathname.startsWith("/vwp/gateway/") &&
      !pathname.startsWith("/vwp/channels/")
    ) {
      return false;
    }

    // All routes are GET-only
    if (req.method !== "GET") {
      return false;
    }

    // ---------- GET /vwp/usage/cost ----------
    if (pathname === "/vwp/usage/cost") {
      if (!checkAuth(req, res)) return true;
      const gw = checkGateway(res);
      if (!gw) return true;

      const params: Record<string, unknown> = {};
      const daysRaw = url.searchParams.get("days");
      if (daysRaw !== null) {
        const days = parseInt(daysRaw, 10);
        if (!isNaN(days)) params.days = days;
      }
      const startDate = url.searchParams.get("startDate");
      if (startDate !== null) params.startDate = startDate;
      const endDate = url.searchParams.get("endDate");
      if (endDate !== null) params.endDate = endDate;

      try {
        const result = await gw.call("usage.cost", params);
        jsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 502, { error: msg });
      }
      return true;
    }

    // ---------- GET /vwp/usage/sessions ----------
    if (pathname === "/vwp/usage/sessions") {
      if (!checkAuth(req, res)) return true;
      const gw = checkGateway(res);
      if (!gw) return true;

      const params: Record<string, unknown> = {};
      const startDate = url.searchParams.get("startDate");
      if (startDate !== null) params.startDate = startDate;
      const endDate = url.searchParams.get("endDate");
      if (endDate !== null) params.endDate = endDate;
      const key = url.searchParams.get("key");
      if (key !== null) params.key = key;
      const limitRaw = url.searchParams.get("limit");
      if (limitRaw !== null) {
        const limit = parseInt(limitRaw, 10);
        if (!isNaN(limit)) params.limit = limit;
      }

      try {
        const result = await gw.call("sessions.usage", params);
        jsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 502, { error: msg });
      }
      return true;
    }

    // ---------- GET /vwp/sessions ----------
    if (pathname === "/vwp/sessions") {
      if (!checkAuth(req, res)) return true;
      const gw = checkGateway(res);
      if (!gw) return true;

      const params: Record<string, unknown> = {
        includeDerivedTitles: true,
        includeLastMessage: true,
      };
      const limitRaw = url.searchParams.get("limit");
      if (limitRaw !== null) {
        const limit = parseInt(limitRaw, 10);
        if (!isNaN(limit)) params.limit = limit;
      }
      const search = url.searchParams.get("search");
      if (search !== null) params.search = search;
      const activeMinutesRaw = url.searchParams.get("activeMinutes");
      if (activeMinutesRaw !== null) {
        const activeMinutes = parseInt(activeMinutesRaw, 10);
        if (!isNaN(activeMinutes)) params.activeMinutes = activeMinutes;
      }

      try {
        const result = await gw.call("sessions.list", params);
        jsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 502, { error: msg });
      }
      return true;
    }

    // ---------- GET /vwp/sessions/:sessionKey/history ----------
    if (pathname.startsWith("/vwp/sessions/") && pathname.endsWith("/history")) {
      if (!checkAuth(req, res)) return true;
      const gw = checkGateway(res);
      if (!gw) return true;

      const match = pathname.match(/^\/vwp\/sessions\/(.+)\/history$/);
      const sessionKeyRaw = match?.[1] ?? "";
      const sessionKey = sessionKeyRaw ? decodeURIComponent(sessionKeyRaw) : "";
      if (!sessionKey) {
        jsonResponse(res, 400, { error: "Missing session key" });
        return true;
      }

      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw ? parseInt(limitRaw, 10) : 100;

      try {
        const result = await gw.call("chat.history", {
          sessionKey,
          limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 100,
        });
        jsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 502, { error: msg });
      }
      return true;
    }

    // ---------- GET /vwp/health ----------
    if (pathname === "/vwp/health") {
      if (!checkAuth(req, res)) return true;
      const gw = checkGateway(res);
      if (!gw) return true;

      try {
        const result = await gw.call("health", {});
        jsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 502, { error: msg });
      }
      return true;
    }

    // ---------- GET /vwp/gateway/status ----------
    if (pathname === "/vwp/gateway/status") {
      if (!checkAuth(req, res)) return true;
      const gw = checkGateway(res);
      if (!gw) return true;

      try {
        const result = await gw.call("status", {});
        jsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 502, { error: msg });
      }
      return true;
    }

    // ---------- GET /vwp/gateway/config ----------
    if (pathname === "/vwp/gateway/config") {
      if (!checkAuth(req, res)) return true;
      const gw = checkGateway(res);
      if (!gw) return true;

      try {
        const result = await gw.call("config.get", {});
        jsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 502, { error: msg });
      }
      return true;
    }

    // ---------- GET /vwp/channels/status ----------
    if (pathname === "/vwp/channels/status") {
      if (!checkAuth(req, res)) return true;
      const gw = checkGateway(res);
      if (!gw) return true;

      const probeRaw = url.searchParams.get("probe");
      const probe = probeRaw === "true";

      try {
        const result = await gw.call("channels.status", { probe });
        jsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 502, { error: msg });
      }
      return true;
    }

    // Not a route we handle — pass through
    return false;
  };
}
