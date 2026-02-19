import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TeamConfig } from "./team-types.ts";

const FIXTURE_DIR = join(import.meta.dirname!, ".test-team-config-fixtures");
const TEAM_FILE = join(FIXTURE_DIR, "team.json");
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

const { createTeamHttpHandler } = await import("./team-config.ts");

// -- Mock helpers ------------------------------------------------------------

function createMockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { authorization: `Bearer ${TEST_TOKEN}` };

  // Use setTimeout instead of process.nextTick to give the handler time
  // to perform async operations (like loadTeamConfig) before readBody attaches listeners
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

const sampleConfig: TeamConfig = {
  businessType: "consulting",
  businessName: "Acme Corp",
  members: [
    {
      id: "ceo",
      name: "CEO",
      role: "CEO",
      description: "Leads strategy",
      skills: ["strategy"],
      required: true,
      active: true,
    },
  ],
  updatedAt: Date.now(),
};

describe("team-config routes", () => {
  let handler: ReturnType<typeof createTeamHttpHandler>;

  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
    handler = createTeamHttpHandler({ gatewayToken: TEST_TOKEN }, TEAM_FILE);
  });

  it("returns false for non-team routes", async () => {
    const req = createMockReq("GET", "/vwp/dispatch/tasks");
    const res = createMockRes();
    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });

  it("returns 401 for unauthorized requests", async () => {
    const req = createMockReq("GET", "/vwp/team");
    req.headers = { authorization: "Bearer wrong-token" };
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  describe("GET /vwp/team", () => {
    it("returns 404 when no team config exists", async () => {
      const req = createMockReq("GET", "/vwp/team");
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(404);
    });

    it("returns team config wrapped in { team: config } when it exists", async () => {
      await writeFile(TEAM_FILE, JSON.stringify(sampleConfig));

      const req = createMockReq("GET", "/vwp/team");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      // Response must be wrapped: { team: { businessType, businessName, members, ... } }
      expect(res._body).toMatchObject({
        team: {
          businessType: "consulting",
          businessName: "Acme Corp",
          members: expect.arrayContaining([expect.objectContaining({ id: "ceo" })]),
        },
      });
    });

    it("response does not expose team fields at the top level", async () => {
      await writeFile(TEAM_FILE, JSON.stringify(sampleConfig));

      const req = createMockReq("GET", "/vwp/team");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      // Top-level keys should only be { team }
      const body = res._body as Record<string, unknown>;
      expect(Object.keys(body)).toEqual(["team"]);
    });
  });

  describe("POST /vwp/team/members", () => {
    it("returns 404 when team not configured", async () => {
      const req = createMockReq("POST", "/vwp/team/members", {
        id: "dev",
        name: "Developer",
        role: "Developer",
        description: "Builds things",
        skills: ["development"],
        required: false,
        active: true,
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(404);
    });

    it("adds a new member", async () => {
      await writeFile(TEAM_FILE, JSON.stringify(sampleConfig));

      const newMember = {
        id: "dev",
        name: "Developer",
        role: "Developer",
        description: "Builds things",
        skills: ["development"],
        required: false,
        active: true,
      };

      const req = createMockReq("POST", "/vwp/team/members", newMember);
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(201);
      expect(res._body).toMatchObject({ id: "dev" });

      // Verify persistence
      const saved = JSON.parse(await readFile(TEAM_FILE, "utf-8")) as TeamConfig;
      expect(saved.members).toHaveLength(2);
      expect(saved.members.find((m) => m.id === "dev")).toBeDefined();
    });

    it("rejects duplicate member id", async () => {
      await writeFile(TEAM_FILE, JSON.stringify(sampleConfig));

      const req = createMockReq("POST", "/vwp/team/members", {
        id: "ceo",
        name: "Duplicate CEO",
        role: "CEO",
        description: "Another CEO",
        skills: ["strategy"],
        required: true,
        active: true,
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(409);
    });

    it("rejects invalid member data", async () => {
      await writeFile(TEAM_FILE, JSON.stringify(sampleConfig));

      const req = createMockReq("POST", "/vwp/team/members", {
        id: "bad",
        // Missing required fields
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });
  });

  describe("PUT /vwp/team/members/:id", () => {
    it("updates an existing member", async () => {
      await writeFile(TEAM_FILE, JSON.stringify(sampleConfig));

      const req = createMockReq("PUT", "/vwp/team/members/ceo", {
        name: "Chief Executive Officer",
        active: false,
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toMatchObject({
        id: "ceo",
        name: "Chief Executive Officer",
        active: false,
      });

      // Verify persistence
      const saved = JSON.parse(await readFile(TEAM_FILE, "utf-8")) as TeamConfig;
      expect(saved.members[0].name).toBe("Chief Executive Officer");
      expect(saved.members[0].active).toBe(false);
    });

    it("returns 404 for nonexistent member", async () => {
      await writeFile(TEAM_FILE, JSON.stringify(sampleConfig));

      const req = createMockReq("PUT", "/vwp/team/members/nonexistent", {
        name: "Ghost",
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it("returns 404 when team not configured", async () => {
      const req = createMockReq("PUT", "/vwp/team/members/ceo", {
        name: "Updated",
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });
  });

  describe("DELETE /vwp/team/members/:id", () => {
    it("removes an existing member", async () => {
      await writeFile(TEAM_FILE, JSON.stringify(sampleConfig));

      const req = createMockReq("DELETE", "/vwp/team/members/ceo");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toMatchObject({ removed: { id: "ceo" } });

      // Verify persistence
      const saved = JSON.parse(await readFile(TEAM_FILE, "utf-8")) as TeamConfig;
      expect(saved.members).toHaveLength(0);
    });

    it("returns 404 for nonexistent member", async () => {
      await writeFile(TEAM_FILE, JSON.stringify(sampleConfig));

      const req = createMockReq("DELETE", "/vwp/team/members/nobody");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it("returns 404 when team not configured", async () => {
      const req = createMockReq("DELETE", "/vwp/team/members/ceo");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(404);
    });
  });
});
