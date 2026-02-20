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
import { homedir } from "node:os";
import { join } from "node:path";
import { VwpConfigStore } from "./config-store.js";
import { TeamMemberSchema, TeamConfigSchema, type TeamConfig } from "./team-types.js";
import { getBearerToken, safeEqualSecret } from "./upstream-imports.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB
const VWP_DIR = join(homedir(), ".openclaw", "vwp");
const TEAM_FILE = join(VWP_DIR, "team.json");
const ONBOARDING_FILE = join(VWP_DIR, "onboarding.json");
const STATE_DB = join(VWP_DIR, "state.sqlite");

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

export type TeamConfigDeps = {
  gatewayToken: string | undefined;
  store?: VwpConfigStore;
};

export function createTeamHttpHandler(
  deps: TeamConfigDeps,
  paths?: { teamFilePath?: string; onboardingFilePath?: string; dbPath?: string },
) {
  const { gatewayToken } = deps;
  const teamFilePath = paths?.teamFilePath ?? TEAM_FILE;
  const onboardingFilePath = paths?.onboardingFilePath ?? ONBOARDING_FILE;
  const dbPath = paths?.dbPath ?? STATE_DB;
  const store =
    deps.store ??
    new VwpConfigStore(dbPath, { onboardingFile: onboardingFilePath, teamFile: teamFilePath });

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
      const config = store.getTeam();
      if (!config) {
        jsonResponse(res, 404, { error: "Team not configured" });
        return true;
      }
      jsonResponse(res, 200, { team: config });
      return true;
    }

    // POST /vwp/team/members — add member
    if (req.method === "POST" && pathname === "/vwp/team/members") {
      const config = store.getTeam();
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
      config.updatedAt = Date.now();
      const teamParsed = TeamConfigSchema.safeParse(config);
      if (!teamParsed.success) {
        jsonResponse(res, 400, { error: "Invalid team config", details: teamParsed.error.issues });
        return true;
      }
      store.saveTeam(teamParsed.data as TeamConfig);
      jsonResponse(res, 201, member);
      return true;
    }

    // PUT /vwp/team/members/:id — update member
    const updateMatch = req.method === "PUT" && pathname.match(/^\/vwp\/team\/members\/([^/]+)$/);
    if (updateMatch) {
      const memberId = decodeURIComponent(updateMatch[1]);
      const config = store.getTeam();
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
      config.updatedAt = Date.now();
      const teamParsed = TeamConfigSchema.safeParse(config);
      if (!teamParsed.success) {
        jsonResponse(res, 400, { error: "Invalid team config", details: teamParsed.error.issues });
        return true;
      }
      store.saveTeam(teamParsed.data as TeamConfig);
      jsonResponse(res, 200, config.members[memberIdx]);
      return true;
    }

    // DELETE /vwp/team/members/:id — remove member
    const deleteMatch =
      req.method === "DELETE" && pathname.match(/^\/vwp\/team\/members\/([^/]+)$/);
    if (deleteMatch) {
      const memberId = decodeURIComponent(deleteMatch[1]);
      const config = store.getTeam();
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
      config.updatedAt = Date.now();
      const teamParsed = TeamConfigSchema.safeParse(config);
      if (!teamParsed.success) {
        jsonResponse(res, 400, { error: "Invalid team config", details: teamParsed.error.issues });
        return true;
      }
      store.saveTeam(teamParsed.data as TeamConfig);
      jsonResponse(res, 200, { removed });
      return true;
    }

    // Not a team route we handle
    return false;
  };
}
