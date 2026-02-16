/**
 * HTTP routes for workspace tool management.
 *
 * Routes:
 *   GET    /vwp/tools                  - list discovered tools
 *   POST   /vwp/tools/:name/run        - start a tool run
 *   GET    /vwp/tools/runs             - list active + recent runs
 *   GET    /vwp/tools/runs/:runId      - get run details
 *   DELETE /vwp/tools/runs/:runId      - cancel a run
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import type { ToolSSEEvent } from "./kanban-types.js";
import type { LoadedTool, ArgSchema } from "./tool-manifest.js";
import type { ToolRunner } from "./tool-runner.js";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

export type ToolRoutesDeps = {
  gatewayToken: string | undefined;
  runner: ToolRunner;
  getTools: () => LoadedTool[];
  onSSE?: (event: ToolSSEEvent) => void;
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

function validateArgs(
  body: Record<string, unknown>,
  schema: Record<string, ArgSchema>,
): { valid: true; args: Record<string, string> } | { valid: false; error: string } {
  const args: Record<string, string> = {};

  // Check required fields present
  for (const [key, s] of Object.entries(schema)) {
    if (s.required && (body[key] === undefined || body[key] === "")) {
      return { valid: false, error: `Missing required argument: ${key}` };
    }
  }

  // Validate and copy only known keys
  for (const [key, value] of Object.entries(body)) {
    // SECURITY: Strip __raw key - prevents arbitrary code injection
    if (key === "__raw") continue;

    const s = schema[key];
    if (!s) {
      return { valid: false, error: `Unknown argument: ${key}` };
    }

    const strValue = String(value);

    if (s.type === "enum" && s.values && !s.values.includes(strValue)) {
      return {
        valid: false,
        error: `Invalid value for ${key}. Must be one of: ${s.values.join(", ")}`,
      };
    }

    if (s.type === "boolean" && strValue !== "true" && strValue !== "false") {
      return { valid: false, error: `Invalid value for ${key}. Must be true or false` };
    }

    args[key] = strValue;
  }

  return { valid: true, args };
}

function isRuntimeAvailable(runtime: "python3" | "node"): boolean {
  try {
    execSync(`which ${runtime}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function createToolHttpHandler(deps: ToolRoutesDeps) {
  const { gatewayToken, runner, getTools, onSSE } = deps;

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

    // Only handle tool routes
    if (!pathname.startsWith("/vwp/tools")) {
      return false;
    }

    // GET /vwp/tools — list discovered tools
    if (req.method === "GET" && pathname === "/vwp/tools") {
      if (!checkAuth(req, res)) return true;
      const tools = getTools();
      const result: Record<string, unknown> = {
        tools: tools.map((t) => ({
          name: t.manifest.name,
          label: t.manifest.label,
          description: t.manifest.description,
          category: t.manifest.category,
          runtime: t.manifest.runtime,
          args_schema: t.manifest.args_schema,
          outputs: t.manifest.outputs,
          timeout_seconds: t.manifest.timeout_seconds,
        })),
      };
      if (tools.length === 0) {
        result.warning = "No workspace tools found. Add tool manifests to the tools/ directory.";
      }
      jsonResponse(res, 200, result);
      return true;
    }

    // POST /vwp/tools/:name/run — start a tool run
    const runMatch = req.method === "POST" && pathname.match(/^\/vwp\/tools\/([^/]+)\/run$/);
    if (runMatch) {
      if (!checkAuth(req, res)) return true;
      const toolName = runMatch[1];

      const tools = getTools();
      const tool = tools.find((t) => t.manifest.name === toolName);
      if (!tool) {
        jsonResponse(res, 404, { error: `Tool not found: ${toolName}` });
        return true;
      }

      // Parse body
      let body: Record<string, unknown>;
      try {
        const raw = await readBody(req);
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch (err) {
        if (err instanceof Error && err.message === "body_too_large") {
          jsonResponse(res, 413, { error: "Request body too large" });
          return true;
        }
        jsonResponse(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      // Validate args against manifest schema
      const validation = validateArgs(body, tool.manifest.args_schema);
      if (!validation.valid) {
        jsonResponse(res, 400, { error: validation.error });
        return true;
      }

      // Runtime pre-check before spawn
      if (!isRuntimeAvailable(tool.manifest.runtime)) {
        jsonResponse(res, 400, {
          error: `Runtime '${tool.manifest.runtime}' is not installed or not in PATH`,
          code: "RUNTIME_NOT_FOUND",
        });
        return true;
      }

      // Start the run
      try {
        const runId = await runner.start({
          toolName: tool.manifest.name,
          toolLabel: tool.manifest.label,
          toolDir: tool.toolDir,
          entrypoint: tool.manifest.entrypoint,
          runtime: tool.manifest.runtime,
          args: validation.args,
          envAllowlist: tool.manifest.env_allowlist,
          timeoutSeconds: tool.manifest.timeout_seconds,
          maxOutputBytes: tool.manifest.max_output_bytes,
          onEvent: (event) => onSSE?.(event),
        });
        jsonResponse(res, 202, { runId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Maximum concurrent tool runs")) {
          jsonResponse(res, 429, {
            error: msg,
            code: "CONCURRENCY_LIMIT",
          });
        } else {
          jsonResponse(res, 500, { error: msg });
        }
      }
      return true;
    }

    // GET /vwp/tools/runs — list active + completed runs
    if (req.method === "GET" && pathname === "/vwp/tools/runs") {
      if (!checkAuth(req, res)) return true;
      jsonResponse(res, 200, {
        active: runner.getActiveRuns(),
        completed: runner.getCompletedRuns(),
      });
      return true;
    }

    // GET /vwp/tools/runs/:runId — get run details
    const runDetailMatch = req.method === "GET" && pathname.match(/^\/vwp\/tools\/runs\/([^/]+)$/);
    if (runDetailMatch) {
      if (!checkAuth(req, res)) return true;
      const runId = runDetailMatch[1];
      const run = runner.getRun(runId);
      if (!run) {
        jsonResponse(res, 404, { error: `Run not found: ${runId}` });
        return true;
      }
      jsonResponse(res, 200, { run });
      return true;
    }

    // DELETE /vwp/tools/runs/:runId — cancel a run
    const cancelMatch = req.method === "DELETE" && pathname.match(/^\/vwp\/tools\/runs\/([^/]+)$/);
    if (cancelMatch) {
      if (!checkAuth(req, res)) return true;
      const runId = cancelMatch[1];
      const cancelled = await runner.cancel(runId);
      if (!cancelled) {
        jsonResponse(res, 404, { error: `Run not found or already completed: ${runId}` });
        return true;
      }
      jsonResponse(res, 200, { cancelled: true });
      return true;
    }

    // Not a tool route we handle — pass through
    return false;
  };
}
