/**
 * HTTP routes for team configuration CRUD.
 *
 * Routes:
 *   GET    /vwp/team               - read team config
 *   POST   /vwp/team/members       - add a team member
 *   PUT    /vwp/team/members/:id   - update a team member
 *   DELETE /vwp/team/members/:id   - remove a team member
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import { TeamMemberSchema, TeamConfigSchema, type TeamConfig } from "./team-types.js";
import { getBearerToken, safeEqualSecret } from "./upstream-imports.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB
const TEAM_FILE = join(homedir(), ".openclaw", "vwp", "team.json");

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

async function loadTeamConfig(filePath: string): Promise<TeamConfig | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as TeamConfig;
  } catch {
    return null;
  }
}

async function saveTeamConfig(filePath: string, config: TeamConfig): Promise<void> {
  config.updatedAt = Date.now();
  await atomicWriteFile(filePath, JSON.stringify(config, null, 2));
}

export type TeamConfigDeps = {
  gatewayToken: string | undefined;
};

export function createTeamHttpHandler(deps: TeamConfigDeps, teamFilePath?: string) {
  const { gatewayToken } = deps;
  const filePath = teamFilePath ?? TEAM_FILE;

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

    // Only handle /vwp/team routes
    if (!pathname.startsWith("/vwp/team")) {
      return false;
    }

    // Auth check for all team routes
    if (!checkAuth(req, res)) return true;

    // GET /vwp/team — read team config
    if (req.method === "GET" && pathname === "/vwp/team") {
      const config = await loadTeamConfig(filePath);
      if (!config) {
        jsonResponse(res, 404, { error: "Team not configured" });
        return true;
      }
      jsonResponse(res, 200, { team: config });
      return true;
    }

    // POST /vwp/team/members — add member
    if (req.method === "POST" && pathname === "/vwp/team/members") {
      const config = await loadTeamConfig(filePath);
      if (!config) {
        jsonResponse(res, 404, { error: "Team not configured. Complete onboarding first." });
        return true;
      }

      let body: unknown;
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

      const parsed = TeamMemberSchema.safeParse(body);
      if (!parsed.success) {
        jsonResponse(res, 400, { error: "Invalid member data", details: parsed.error.issues });
        return true;
      }

      const member = parsed.data;

      // Check for duplicate ID
      if (config.members.some((m) => m.id === member.id)) {
        jsonResponse(res, 409, { error: `Member with id '${member.id}' already exists` });
        return true;
      }

      config.members.push(member);
      await saveTeamConfig(filePath, config);
      jsonResponse(res, 201, member);
      return true;
    }

    // PUT /vwp/team/members/:id — update member
    const updateMatch = req.method === "PUT" && pathname.match(/^\/vwp\/team\/members\/([^/]+)$/);
    if (updateMatch) {
      const memberId = decodeURIComponent(updateMatch[1]);
      const config = await loadTeamConfig(filePath);
      if (!config) {
        jsonResponse(res, 404, { error: "Team not configured" });
        return true;
      }

      const memberIdx = config.members.findIndex((m) => m.id === memberId);
      if (memberIdx === -1) {
        jsonResponse(res, 404, { error: `Member '${memberId}' not found` });
        return true;
      }

      let body: unknown;
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

      const parsed = TeamMemberSchema.partial().safeParse(body);
      if (!parsed.success) {
        jsonResponse(res, 400, { error: "Invalid member data", details: parsed.error.issues });
        return true;
      }

      config.members[memberIdx] = { ...config.members[memberIdx], ...parsed.data };
      await saveTeamConfig(filePath, config);
      jsonResponse(res, 200, config.members[memberIdx]);
      return true;
    }

    // DELETE /vwp/team/members/:id — remove member
    const deleteMatch =
      req.method === "DELETE" && pathname.match(/^\/vwp\/team\/members\/([^/]+)$/);
    if (deleteMatch) {
      const memberId = decodeURIComponent(deleteMatch[1]);
      const config = await loadTeamConfig(filePath);
      if (!config) {
        jsonResponse(res, 404, { error: "Team not configured" });
        return true;
      }

      const memberIdx = config.members.findIndex((m) => m.id === memberId);
      if (memberIdx === -1) {
        jsonResponse(res, 404, { error: `Member '${memberId}' not found` });
        return true;
      }

      const removed = config.members.splice(memberIdx, 1)[0];
      await saveTeamConfig(filePath, config);
      jsonResponse(res, 200, { removed });
      return true;
    }

    // Not a team route we handle
    return false;
  };
}
