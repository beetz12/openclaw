/**
 * HTTP routes for project registry CRUD.
 *
 * Routes:
 *   POST   /vwp/projects              - register a project folder
 *   GET    /vwp/projects               - list registered projects
 *   GET    /vwp/projects/:id           - get project details
 *   DELETE /vwp/projects/:id           - unregister a project
 *   POST   /vwp/projects/:id/validate  - check path still exists + basic status
 *   POST   /vwp/projects/:id/mcp-servers - update per-project MCP server config
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { getBearerToken } from "../../src/gateway/http-utils.js";
import { safeEqualSecret } from "../../src/security/secret-equal.js";
import { atomicWriteFile } from "./atomic-write.js";

const MAX_BODY_BYTES = 64 * 1024; // 64 KB
const VWP_DIR = join(homedir(), ".openclaw", "vwp");
const PROJECTS_FILE = join(VWP_DIR, "projects.json");

// --- Zod schemas ---

const McpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

export const ProjectSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  rootPath: z.string().min(1),
  mcpServers: z.record(z.string(), McpServerSchema).default({}),
  createdAt: z.number(),
});

export type Project = z.infer<typeof ProjectSchema>;

const CreateProjectSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  rootPath: z.string().min(1),
  mcpServers: z.record(z.string(), McpServerSchema).default({}),
});

const UpdateMcpServersSchema = z.object({
  servers: z.record(z.string(), McpServerSchema),
});

// --- Path validation ---

/**
 * Check whether `requestedPath` is within `rootPath` after resolving symlinks.
 * Both paths are resolved via `fs.realpath()` before comparison.
 */
export async function isPathWithinRoot(rootPath: string, requestedPath: string): Promise<boolean> {
  try {
    const resolvedRoot = await realpath(rootPath);
    const resolvedRequested = await realpath(requestedPath);
    // Ensure the root ends with separator for proper prefix matching
    const rootPrefix = resolvedRoot.endsWith("/") ? resolvedRoot : resolvedRoot + "/";
    return resolvedRequested === resolvedRoot || resolvedRequested.startsWith(rootPrefix);
  } catch {
    return false;
  }
}

/**
 * Validate that a path exists, is a directory, and resolve it.
 * Returns the resolved real path or null if invalid.
 */
async function validateDirectoryPath(path: string): Promise<string | null> {
  try {
    const resolved = await realpath(resolve(path));
    const info = await stat(resolved);
    if (!info.isDirectory()) return null;
    return resolved;
  } catch {
    return null;
  }
}

// --- MCP auto-discovery ---

/**
 * Discover MCP server configuration from a `.mcp.json` file in the project root.
 * Returns discovered servers or an empty object if the file is missing or malformed.
 */
export async function discoverMcpConfig(
  rootPath: string,
): Promise<Record<string, { command: string; args: string[]; env: Record<string, string> }>> {
  try {
    const raw = await readFile(join(rootPath, ".mcp.json"), "utf-8");
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};

    const result: Record<string, { command: string; args: string[]; env: Record<string, string> }> =
      {};
    for (const [name, value] of Object.entries(data)) {
      if (typeof value !== "object" || value === null) continue;
      const entry = value as Record<string, unknown>;
      if (typeof entry.command !== "string") continue;
      result[name] = {
        command: entry.command,
        args: Array.isArray(entry.args)
          ? entry.args.filter((a): a is string => typeof a === "string")
          : [],
        env:
          typeof entry.env === "object" && entry.env !== null
            ? Object.fromEntries(
                Object.entries(entry.env as Record<string, unknown>).filter(
                  (kv): kv is [string, string] => typeof kv[1] === "string",
                ),
              )
            : {},
      };
    }
    return result;
  } catch {
    return {};
  }
}

// --- HTTP helpers ---

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

// --- Storage helpers ---

export async function loadProjects(filePath?: string): Promise<Project[]> {
  const target = filePath ?? PROJECTS_FILE;
  try {
    const raw = await readFile(target, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

async function saveProjects(filePath: string, projects: Project[]): Promise<void> {
  await atomicWriteFile(filePath, JSON.stringify(projects, null, 2));
}

// --- Handler ---

export type ProjectRegistryDeps = {
  gatewayToken: string | undefined;
};

export function createProjectHttpHandler(deps: ProjectRegistryDeps, projectsFilePath?: string) {
  const { gatewayToken } = deps;
  const filePath = projectsFilePath ?? PROJECTS_FILE;

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

    // Only handle /vwp/projects routes
    if (!pathname.startsWith("/vwp/projects")) {
      return false;
    }

    // Auth check for all project routes
    if (!checkAuth(req, res)) return true;

    // POST /vwp/projects — register a project
    if (req.method === "POST" && pathname === "/vwp/projects") {
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

      const parsed = CreateProjectSchema.safeParse(body);
      if (!parsed.success) {
        jsonResponse(res, 400, { error: "Invalid project data", details: parsed.error.issues });
        return true;
      }

      // Validate the root path
      const resolvedPath = await validateDirectoryPath(parsed.data.rootPath);
      if (!resolvedPath) {
        jsonResponse(res, 400, {
          error: "Invalid rootPath: path does not exist or is not a directory",
        });
        return true;
      }

      const projects = await loadProjects(filePath);

      // Check for duplicate ID
      if (projects.some((p) => p.id === parsed.data.id)) {
        jsonResponse(res, 409, { error: `Project with id '${parsed.data.id}' already exists` });
        return true;
      }

      // Auto-discover MCP servers from .mcp.json; user-configured servers take priority
      const discovered = await discoverMcpConfig(resolvedPath);
      const mergedServers = { ...discovered, ...parsed.data.mcpServers };

      const project: Project = {
        ...parsed.data,
        rootPath: resolvedPath,
        mcpServers: mergedServers,
        createdAt: Date.now(),
      };

      projects.push(project);
      await saveProjects(filePath, projects);
      jsonResponse(res, 201, project);
      return true;
    }

    // GET /vwp/projects — list all projects
    if (req.method === "GET" && pathname === "/vwp/projects") {
      const projects = await loadProjects(filePath);
      jsonResponse(res, 200, { projects });
      return true;
    }

    // GET /vwp/projects/:id — get a single project
    const getMatch = req.method === "GET" && pathname.match(/^\/vwp\/projects\/([^/]+)$/);
    if (getMatch) {
      const projectId = decodeURIComponent(getMatch[1]);
      const projects = await loadProjects(filePath);
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        jsonResponse(res, 404, { error: `Project '${projectId}' not found` });
        return true;
      }
      jsonResponse(res, 200, project);
      return true;
    }

    // DELETE /vwp/projects/:id — unregister a project
    const deleteMatch = req.method === "DELETE" && pathname.match(/^\/vwp\/projects\/([^/]+)$/);
    if (deleteMatch) {
      const projectId = decodeURIComponent(deleteMatch[1]);
      const projects = await loadProjects(filePath);
      const idx = projects.findIndex((p) => p.id === projectId);
      if (idx === -1) {
        jsonResponse(res, 404, { error: `Project '${projectId}' not found` });
        return true;
      }
      const removed = projects.splice(idx, 1)[0];
      await saveProjects(filePath, projects);
      jsonResponse(res, 200, { removed });
      return true;
    }

    // POST /vwp/projects/:id/mcp-servers — update per-project MCP server config
    const mcpMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/projects\/([^/]+)\/mcp-servers$/);
    if (mcpMatch) {
      const projectId = decodeURIComponent(mcpMatch[1]);

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

      const parsed = UpdateMcpServersSchema.safeParse(body);
      if (!parsed.success) {
        jsonResponse(res, 400, { error: "Invalid MCP server data", details: parsed.error.issues });
        return true;
      }

      const projects = await loadProjects(filePath);
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        jsonResponse(res, 404, { error: `Project '${projectId}' not found` });
        return true;
      }

      project.mcpServers = parsed.data.servers;
      await saveProjects(filePath, projects);
      jsonResponse(res, 200, project);
      return true;
    }

    // POST /vwp/projects/:id/validate — check path still exists
    const validateMatch =
      req.method === "POST" && pathname.match(/^\/vwp\/projects\/([^/]+)\/validate$/);
    if (validateMatch) {
      const projectId = decodeURIComponent(validateMatch[1]);
      const projects = await loadProjects(filePath);
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        jsonResponse(res, 404, { error: `Project '${projectId}' not found` });
        return true;
      }

      const resolvedPath = await validateDirectoryPath(project.rootPath);
      const valid = resolvedPath !== null;

      // Auto-discover MCP servers if path is valid
      const discoveredMcpServers = valid ? await discoverMcpConfig(project.rootPath) : {};

      jsonResponse(res, 200, {
        projectId: project.id,
        rootPath: project.rootPath,
        valid,
        discoveredMcpServers,
        ...(valid ? { resolvedPath } : { error: "Path does not exist or is not a directory" }),
      });
      return true;
    }

    // Not a project route we handle
    return false;
  };
}
