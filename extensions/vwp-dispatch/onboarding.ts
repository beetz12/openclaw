/**
 * HTTP routes for onboarding flow.
 *
 * Routes:
 *   GET  /vwp/onboarding           - read onboarding status
 *   POST /vwp/onboarding/complete  - complete onboarding, save team config
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import { getDefaultTeam } from "./team-templates.js";
import { OnboardingPayloadSchema, TeamConfigSchema } from "./team-types.js";
import { getBearerToken, safeEqualSecret } from "./upstream-imports.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB
const VWP_DIR = join(homedir(), ".openclaw", "vwp");
const ONBOARDING_FILE = join(VWP_DIR, "onboarding.json");
const TEAM_FILE = join(VWP_DIR, "team.json");

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

export type OnboardingDeps = {
  gatewayToken: string | undefined;
};

export function createOnboardingHttpHandler(
  deps: OnboardingDeps,
  paths?: { onboardingFile?: string; teamFile?: string },
) {
  const { gatewayToken } = deps;
  const onboardingFile = paths?.onboardingFile ?? ONBOARDING_FILE;
  const teamFile = paths?.teamFile ?? TEAM_FILE;

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

    // Only handle /vwp/onboarding routes
    if (!pathname.startsWith("/vwp/onboarding")) {
      return false;
    }

    // Auth check for all onboarding routes
    if (!checkAuth(req, res)) return true;

    // GET /vwp/onboarding — read onboarding status
    if (req.method === "GET" && pathname === "/vwp/onboarding") {
      try {
        const raw = await readFile(onboardingFile, "utf-8");
        const data = JSON.parse(raw);
        jsonResponse(res, 200, data);
      } catch {
        jsonResponse(res, 200, { completed: false });
      }
      return true;
    }

    // POST /vwp/onboarding/complete — complete onboarding
    if (req.method === "POST" && pathname === "/vwp/onboarding/complete") {
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

      const parsed = OnboardingPayloadSchema.safeParse(body);
      if (!parsed.success) {
        jsonResponse(res, 400, { error: "Invalid onboarding data", details: parsed.error.issues });
        return true;
      }

      const { businessType, businessName, userName } = parsed.data;
      const team = parsed.data.team.length > 0 ? parsed.data.team : getDefaultTeam(businessType);

      // Save onboarding status
      const onboardingData = {
        completed: true,
        completedAt: Date.now(),
        businessType,
        businessName,
        userName,
      };
      await atomicWriteFile(onboardingFile, JSON.stringify(onboardingData, null, 2));

      // Save team config
      const teamConfig = {
        businessType,
        businessName,
        members: team,
        updatedAt: Date.now(),
      };

      // Validate team config before saving
      const teamParsed = TeamConfigSchema.safeParse(teamConfig);
      if (!teamParsed.success) {
        jsonResponse(res, 400, { error: "Invalid team config", details: teamParsed.error.issues });
        return true;
      }

      await atomicWriteFile(teamFile, JSON.stringify(teamParsed.data, null, 2));

      jsonResponse(res, 200, { ok: true });
      return true;
    }

    // DELETE /vwp/onboarding — reset onboarding
    if (req.method === "DELETE" && pathname === "/vwp/onboarding") {
      const deleteFile = async (path: string) => {
        try {
          await unlink(path);
        } catch (err: any) {
          if (err.code !== "ENOENT") throw err;
        }
      };
      await deleteFile(onboardingFile);
      await deleteFile(teamFile);
      jsonResponse(res, 200, { reset: true });
      return true;
    }

    // Not an onboarding route we handle
    return false;
  };
}
