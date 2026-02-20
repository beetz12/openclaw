import { EventEmitter } from "node:events";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const TEST_TOKEN = "test-token";

// Mock auth helpers before importing the module under test
vi.mock("../../src/gateway/http-utils.js", () => ({
  getBearerToken: (req: IncomingMessage) => {
    const auth = req.headers?.authorization ?? "";
    return auth.replace("Bearer ", "");
  },
}));

vi.mock("../../src/security/secret-equal.js", () => ({
  safeEqualSecret: (a: string, b: string) => a === b,
}));

// Mock atomic-write to use regular fs writes in tests
vi.mock("./atomic-write.js", () => ({
  atomicWriteFile: async (filePath: string, content: string) => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
  },
}));

const { createProjectHttpHandler, discoverMcpConfig } = await import("./project-registry.ts");

// -- Mock helpers ------------------------------------------------------------

function createMockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { authorization: `Bearer ${TEST_TOKEN}` };

  if (body !== undefined) {
    setTimeout(() => {
      const buf = Buffer.from(JSON.stringify(body));
      req.emit("data", buf);
      req.emit("end");
    }, 10);
  } else {
    setTimeout(() => req.emit("end"), 10);
  }

  return req;
}

function createMockRes(): ServerResponse & { _status: number; _body: unknown } {
  const res = {
    statusCode: 200,
    _status: 200,
    _body: null as unknown,
    setHeader() {},
    end(data?: string) {
      this._status = this.statusCode;
      if (data) {
        try {
          this._body = JSON.parse(data);
        } catch {
          this._body = data;
        }
      }
    },
  } as unknown as ServerResponse & { _status: number; _body: unknown };
  return res;
}

describe("project-registry routes", () => {
  let tmpDir: string;
  let projectsFile: string;
  let handler: ReturnType<typeof createProjectHttpHandler>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vwp-projects-test-"));
    projectsFile = join(tmpDir, "projects.json");
    handler = createProjectHttpHandler({ gatewayToken: TEST_TOKEN }, projectsFile);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns false for non-project routes", async () => {
    const req = createMockReq("GET", "/vwp/team");
    const res = createMockRes();
    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });

  describe("Auth", () => {
    it("returns 401 without token", async () => {
      const req = createMockReq("GET", "/vwp/projects");
      req.headers = { authorization: "" };
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
    });

    it("returns 401 with wrong token", async () => {
      const req = createMockReq("GET", "/vwp/projects");
      req.headers = { authorization: "Bearer wrong-token" };
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
    });
  });

  describe("GET /vwp/projects", () => {
    it("returns empty list when no projects registered", async () => {
      const req = createMockReq("GET", "/vwp/projects");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ projects: [] });
    });

    it("returns list with registered projects", async () => {
      // Register a project first
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        const postReq = createMockReq("POST", "/vwp/projects", {
          id: "proj-1",
          name: "Test Project",
          rootPath: projectDir,
        });
        const postRes = createMockRes();
        await handler(postReq, postRes);
        expect(postRes._status).toBe(201);

        const req = createMockReq("GET", "/vwp/projects");
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(200);
        const body = res._body as { projects: unknown[] };
        expect(body.projects).toHaveLength(1);
        expect(body.projects[0]).toMatchObject({ id: "proj-1", name: "Test Project" });
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });
  });

  describe("POST /vwp/projects", () => {
    it("registers a project with a valid path", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        const req = createMockReq("POST", "/vwp/projects", {
          id: "my-proj",
          name: "My Project",
          rootPath: projectDir,
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(201);
        const body = res._body as Record<string, unknown>;
        expect(body.id).toBe("my-proj");
        expect(body.name).toBe("My Project");
        expect(body.createdAt).toBeTypeOf("number");
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("rejects a nonexistent path", async () => {
      const req = createMockReq("POST", "/vwp/projects", {
        id: "bad-proj",
        name: "Bad Project",
        rootPath: "/this/path/does/not/exist/at/all",
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      const body = res._body as Record<string, unknown>;
      expect(body.error).toMatch(/invalid rootpath/i);
    });

    it("rejects a path traversal attempt (../../..)", async () => {
      const req = createMockReq("POST", "/vwp/projects", {
        id: "traversal-proj",
        name: "Traversal Project",
        rootPath: "../../etc/passwd",
      });
      const res = createMockRes();
      await handler(req, res);

      // Path either does not exist or is not a directory
      expect(res._status).toBe(400);
    });

    it("rejects a file path (not a directory)", async () => {
      const { writeFile } = await import("node:fs/promises");
      const filePath = join(tmpDir, "notadir.txt");
      await writeFile(filePath, "content");

      const req = createMockReq("POST", "/vwp/projects", {
        id: "file-proj",
        name: "File Project",
        rootPath: filePath,
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });

    it("rejects duplicate project id", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        const payload = { id: "dup-proj", name: "Dup", rootPath: projectDir };

        const req1 = createMockReq("POST", "/vwp/projects", payload);
        const res1 = createMockRes();
        await handler(req1, res1);
        expect(res1._status).toBe(201);

        const req2 = createMockReq("POST", "/vwp/projects", payload);
        const res2 = createMockRes();
        await handler(req2, res2);
        expect(res2._status).toBe(409);
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("rejects invalid JSON body", async () => {
      const req = new EventEmitter() as IncomingMessage;
      req.method = "POST";
      req.url = "/vwp/projects";
      req.headers = { authorization: `Bearer ${TEST_TOKEN}` };
      setTimeout(() => {
        req.emit("data", Buffer.from("not json {{"));
        req.emit("end");
      }, 10);

      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });

    it("rejects missing required fields (no id)", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        const req = createMockReq("POST", "/vwp/projects", {
          name: "No ID Project",
          rootPath: projectDir,
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(400);
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("rejects missing required fields (no name)", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        const req = createMockReq("POST", "/vwp/projects", {
          id: "no-name-proj",
          rootPath: projectDir,
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(400);
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });
  });

  describe("GET /vwp/projects/:id", () => {
    it("returns a specific project by id", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        const postReq = createMockReq("POST", "/vwp/projects", {
          id: "get-me",
          name: "Get Me",
          rootPath: projectDir,
        });
        await handler(postReq, createMockRes());

        const req = createMockReq("GET", "/vwp/projects/get-me");
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(200);
        const body = res._body as Record<string, unknown>;
        expect(body.id).toBe("get-me");
        expect(body.name).toBe("Get Me");
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("returns 404 for nonexistent project", async () => {
      const req = createMockReq("GET", "/vwp/projects/nonexistent");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });
  });

  describe("DELETE /vwp/projects/:id", () => {
    it("unregisters an existing project", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        const postReq = createMockReq("POST", "/vwp/projects", {
          id: "del-me",
          name: "Delete Me",
          rootPath: projectDir,
        });
        await handler(postReq, createMockRes());

        const req = createMockReq("DELETE", "/vwp/projects/del-me");
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(200);
        const body = res._body as Record<string, unknown>;
        expect(body.removed).toMatchObject({ id: "del-me" });

        // Should be gone now
        const getReq = createMockReq("GET", "/vwp/projects/del-me");
        const getRes = createMockRes();
        await handler(getReq, getRes);
        expect(getRes._status).toBe(404);
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("returns 404 for nonexistent project", async () => {
      const req = createMockReq("DELETE", "/vwp/projects/nobody");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });
  });

  describe("POST /vwp/projects/:id/validate", () => {
    it("returns valid:true for a project whose path still exists", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        const postReq = createMockReq("POST", "/vwp/projects", {
          id: "validate-me",
          name: "Validate Me",
          rootPath: projectDir,
        });
        await handler(postReq, createMockRes());

        const req = createMockReq("POST", "/vwp/projects/validate-me/validate");
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(200);
        const body = res._body as Record<string, unknown>;
        expect(body.valid).toBe(true);
        expect(body.projectId).toBe("validate-me");
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("returns valid:false when path has been deleted", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));

      const postReq = createMockReq("POST", "/vwp/projects", {
        id: "deleted-path",
        name: "Deleted Path",
        rootPath: projectDir,
      });
      await handler(postReq, createMockRes());

      // Delete the directory
      await rm(projectDir, { recursive: true, force: true });

      const req = createMockReq("POST", "/vwp/projects/deleted-path/validate");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      const body = res._body as Record<string, unknown>;
      expect(body.valid).toBe(false);
    });

    it("returns 404 for nonexistent project", async () => {
      const req = createMockReq("POST", "/vwp/projects/no-such-project/validate");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it("includes discoveredMcpServers from .mcp.json", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        // Write .mcp.json into the project dir
        await writeFile(
          join(projectDir, ".mcp.json"),
          JSON.stringify({
            "my-server": { command: "node", args: ["server.js"] },
          }),
        );

        // Register the project
        const postReq = createMockReq("POST", "/vwp/projects", {
          id: "discover-validate",
          name: "Discover Validate",
          rootPath: projectDir,
        });
        await handler(postReq, createMockRes());

        // Validate
        const req = createMockReq("POST", "/vwp/projects/discover-validate/validate");
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(200);
        const body = res._body as Record<string, unknown>;
        expect(body.valid).toBe(true);
        const discovered = body.discoveredMcpServers as Record<string, unknown>;
        expect(discovered).toHaveProperty("my-server");
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });
  });

  describe("POST /vwp/projects/:id/mcp-servers", () => {
    it("updates MCP servers for an existing project", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        // Register a project first
        const postReq = createMockReq("POST", "/vwp/projects", {
          id: "mcp-proj",
          name: "MCP Project",
          rootPath: projectDir,
        });
        const postRes = createMockRes();
        await handler(postReq, postRes);
        expect(postRes._status).toBe(201);

        // Update MCP servers
        const req = createMockReq("POST", "/vwp/projects/mcp-proj/mcp-servers", {
          servers: {
            "my-server": { command: "node", args: ["server.js"], env: { PORT: "3000" } },
            "another-server": { command: "python", args: ["-m", "mcp_server"] },
          },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(200);
        const body = res._body as Record<string, unknown>;
        expect(body.id).toBe("mcp-proj");
        const servers = body.mcpServers as Record<string, unknown>;
        expect(servers).toHaveProperty("my-server");
        expect(servers).toHaveProperty("another-server");
        const myServer = servers["my-server"] as Record<string, unknown>;
        expect(myServer.command).toBe("node");
        expect(myServer.args).toEqual(["server.js"]);
        expect(myServer.env).toEqual({ PORT: "3000" });
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("returns 404 for nonexistent project", async () => {
      const req = createMockReq("POST", "/vwp/projects/nonexistent/mcp-servers", {
        servers: { s: { command: "node", args: [] } },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it("returns 400 for invalid body", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        // Register a project first
        const postReq = createMockReq("POST", "/vwp/projects", {
          id: "mcp-bad",
          name: "MCP Bad",
          rootPath: projectDir,
        });
        await handler(postReq, createMockRes());

        // Send invalid body (missing 'servers' key)
        const req = createMockReq("POST", "/vwp/projects/mcp-bad/mcp-servers", {
          notServers: { x: 1 },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(400);
        const body = res._body as Record<string, unknown>;
        expect(body.error).toMatch(/invalid mcp server data/i);
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("returns 401 without auth token", async () => {
      const req = createMockReq("POST", "/vwp/projects/some-proj/mcp-servers", {
        servers: {},
      });
      req.headers = { authorization: "" };
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
    });

    it("replaces all MCP servers (not merges)", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        // Register with initial servers
        const postReq = createMockReq("POST", "/vwp/projects", {
          id: "mcp-replace",
          name: "MCP Replace",
          rootPath: projectDir,
          mcpServers: {
            "old-server": { command: "old", args: [] },
          },
        });
        await handler(postReq, createMockRes());

        // Replace with new servers
        const req = createMockReq("POST", "/vwp/projects/mcp-replace/mcp-servers", {
          servers: {
            "new-server": { command: "new", args: ["--flag"] },
          },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(200);
        const body = res._body as Record<string, unknown>;
        const servers = body.mcpServers as Record<string, unknown>;
        expect(servers).not.toHaveProperty("old-server");
        expect(servers).toHaveProperty("new-server");
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });
  });

  describe("discoverMcpConfig", () => {
    it("discovers servers from a valid .mcp.json", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-mcp-"));
      try {
        await writeFile(
          join(projectDir, ".mcp.json"),
          JSON.stringify({
            "file-server": { command: "npx", args: ["@mcp/server-fs"], env: { ROOT: "/tmp" } },
            "code-search": { command: "node", args: ["search.js"] },
          }),
        );

        const result = await discoverMcpConfig(projectDir);
        expect(Object.keys(result)).toHaveLength(2);
        expect(result["file-server"]).toEqual({
          command: "npx",
          args: ["@mcp/server-fs"],
          env: { ROOT: "/tmp" },
        });
        expect(result["code-search"]).toEqual({
          command: "node",
          args: ["search.js"],
          env: {},
        });
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("returns empty object when .mcp.json is missing", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-mcp-"));
      try {
        const result = await discoverMcpConfig(projectDir);
        expect(result).toEqual({});
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("returns empty object when .mcp.json is malformed", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-mcp-"));
      try {
        await writeFile(join(projectDir, ".mcp.json"), "not valid json {{{{");

        const result = await discoverMcpConfig(projectDir);
        expect(result).toEqual({});
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("skips entries without a command field", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-mcp-"));
      try {
        await writeFile(
          join(projectDir, ".mcp.json"),
          JSON.stringify({
            "valid-server": { command: "node", args: ["s.js"] },
            "no-command": { args: ["something"] },
            "not-object": "just a string",
          }),
        );

        const result = await discoverMcpConfig(projectDir);
        expect(Object.keys(result)).toHaveLength(1);
        expect(result).toHaveProperty("valid-server");
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });
  });

  describe("MCP auto-discovery merge behavior", () => {
    it("merges discovered servers during project registration", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        // Write .mcp.json with a discovered server
        await writeFile(
          join(projectDir, ".mcp.json"),
          JSON.stringify({
            "discovered-server": { command: "node", args: ["discovered.js"] },
          }),
        );

        // Register without user-configured MCP servers
        const req = createMockReq("POST", "/vwp/projects", {
          id: "merge-proj",
          name: "Merge Project",
          rootPath: projectDir,
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(201);
        const body = res._body as Record<string, unknown>;
        const servers = body.mcpServers as Record<string, unknown>;
        expect(servers).toHaveProperty("discovered-server");
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });

    it("user-configured servers take priority over discovered servers", async () => {
      const projectDir = await mkdtemp(join(tmpdir(), "vwp-proj-"));
      try {
        // Write .mcp.json with a server that will be overridden
        await writeFile(
          join(projectDir, ".mcp.json"),
          JSON.stringify({
            "shared-name": { command: "discovered-cmd", args: ["--discovered"] },
            "only-discovered": { command: "disc-only", args: [] },
          }),
        );

        // Register with a user server that has the same name as a discovered one
        const req = createMockReq("POST", "/vwp/projects", {
          id: "priority-proj",
          name: "Priority Project",
          rootPath: projectDir,
          mcpServers: {
            "shared-name": { command: "user-cmd", args: ["--user"] },
          },
        });
        const res = createMockRes();
        await handler(req, res);

        expect(res._status).toBe(201);
        const body = res._body as Record<string, unknown>;
        const servers = body.mcpServers as Record<string, { command: string; args: string[] }>;

        // User config wins for shared name
        expect(servers["shared-name"].command).toBe("user-cmd");
        expect(servers["shared-name"].args).toEqual(["--user"]);

        // Discovered-only server is still included
        expect(servers["only-discovered"].command).toBe("disc-only");
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    });
  });
});
