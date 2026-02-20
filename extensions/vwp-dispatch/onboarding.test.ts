import { EventEmitter } from "node:events";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const FIXTURE_DIR = join(import.meta.dirname!, ".test-onboarding-fixtures");
const ONBOARDING_FILE = join(FIXTURE_DIR, "onboarding.json");
const TEAM_FILE = join(FIXTURE_DIR, "team.json");
const DB_PATH = join(FIXTURE_DIR, "state.sqlite");
const TEST_TOKEN = "test-token";

// Mock auth helpers
vi.mock("../../src/gateway/http-utils.js", () => ({
  getBearerToken: (req: IncomingMessage) => {
    const auth = req.headers?.authorization ?? "";
    return auth.replace("Bearer ", "");
  },
}));

vi.mock("../../src/security/secret-equal.js", () => ({
  safeEqualSecret: (a: string, b: string) => a === b,
}));

const { createOnboardingHttpHandler } = await import("./onboarding.ts");
const { VwpConfigStore } = await import("./config-store.ts");

// -- Mock helpers ------------------------------------------------------------

function createMockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { authorization: `Bearer ${TEST_TOKEN}` };

  if (body !== undefined) {
    process.nextTick(() => {
      const buf = Buffer.from(JSON.stringify(body));
      req.emit("data", buf);
      req.emit("end");
    });
  } else {
    process.nextTick(() => req.emit("end"));
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
      (this as any)._status = (this as any).statusCode;
      if (data) {
        try {
          (this as any)._body = JSON.parse(data);
        } catch {
          (this as any)._body = data;
        }
      }
    },
  } as unknown as ServerResponse & { _status: number; _body: unknown };
  return res;
}

const validPayload = {
  businessType: "consulting",
  businessName: "Acme Corp",
  userName: "Alice",
  team: [
    {
      id: "ceo",
      name: "CEO",
      role: "CEO / Strategy Lead",
      description: "Leads strategy",
      skills: ["strategy", "planning"],
      required: true,
      active: true,
    },
    {
      id: "pm",
      name: "Project Manager",
      role: "Project Manager",
      description: "Manages projects",
      skills: ["project-management"],
      required: true,
      active: true,
    },
  ],
};

describe("onboarding routes", () => {
  let handler: ReturnType<typeof createOnboardingHttpHandler>;
  let store: InstanceType<typeof VwpConfigStore>;

  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
    store = new VwpConfigStore(DB_PATH, { onboardingFile: ONBOARDING_FILE, teamFile: TEAM_FILE });
    handler = createOnboardingHttpHandler(
      { gatewayToken: TEST_TOKEN, store },
      { onboardingFile: ONBOARDING_FILE, teamFile: TEAM_FILE, dbPath: DB_PATH },
    );
  });

  it("returns false for non-onboarding routes", async () => {
    const req = createMockReq("GET", "/vwp/team");
    const res = createMockRes();
    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });

  it("returns 401 for unauthorized requests", async () => {
    const req = createMockReq("GET", "/vwp/onboarding");
    req.headers = { authorization: "Bearer wrong" };
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  describe("GET /vwp/onboarding", () => {
    it("returns completed:false when no onboarding data exists", async () => {
      const req = createMockReq("GET", "/vwp/onboarding");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ completed: false });
    });

    it("returns onboarding data when it exists", async () => {
      store.saveOnboarding({
        completed: true,
        completedAt: 12345,
        businessType: "consulting",
        businessName: "Test",
        userName: "Alice",
      });

      const req = createMockReq("GET", "/vwp/onboarding");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toMatchObject({ completed: true });
    });
  });

  describe("POST /vwp/onboarding/complete", () => {
    it("saves onboarding and team config", async () => {
      const req = createMockReq("POST", "/vwp/onboarding/complete", validPayload);
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ ok: true });

      // Verify via store
      const onboarding = store.getOnboarding()!;
      expect(onboarding.completed).toBe(true);
      expect(onboarding.businessType).toBe("consulting");
      expect(onboarding.userName).toBe("Alice");
      expect(onboarding.completedAt).toBeGreaterThan(0);

      const team = store.getTeam()!;
      expect(team.businessType).toBe("consulting");
      expect(team.businessName).toBe("Acme Corp");
      expect(team.members).toHaveLength(2);
      expect(team.members[0].id).toBe("ceo");
    });

    it("derives team from businessType when team array is empty", async () => {
      const { team, ...payloadWithoutTeam } = validPayload;
      const req = createMockReq("POST", "/vwp/onboarding/complete", {
        ...payloadWithoutTeam,
        team: [],
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);

      // Should have derived the consulting default team (6 members), not the empty array
      const savedTeam = store.getTeam()!;
      expect(savedTeam.members.length).toBeGreaterThan(0);
      expect(savedTeam.members.find((m: { id: string }) => m.id === "ceo")).toBeDefined();
    });

    it("derives team from businessType when team field is omitted", async () => {
      const { team, ...payloadWithoutTeam } = validPayload;
      const req = createMockReq("POST", "/vwp/onboarding/complete", payloadWithoutTeam);
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);

      // Should have derived the consulting default team
      const savedTeam = store.getTeam()!;
      expect(savedTeam.members.length).toBeGreaterThan(0);
    });

    it("uses CEO-only team for custom businessType when no team is provided", async () => {
      const req = createMockReq("POST", "/vwp/onboarding/complete", {
        ...validPayload,
        businessType: "custom",
        team: [],
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);

      const savedTeam = store.getTeam()!;
      expect(savedTeam.businessType).toBe("custom");
      expect(savedTeam.members).toHaveLength(1);
      expect(savedTeam.members[0].id).toBe("ceo");
    });

    it("rejects invalid payload (missing userName)", async () => {
      const { userName, ...noUser } = validPayload;
      const req = createMockReq("POST", "/vwp/onboarding/complete", noUser);
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });

    it("rejects invalid payload (bad businessType)", async () => {
      const req = createMockReq("POST", "/vwp/onboarding/complete", {
        ...validPayload,
        businessType: "agency",
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });

    it("rejects invalid payload (bad team member)", async () => {
      const req = createMockReq("POST", "/vwp/onboarding/complete", {
        ...validPayload,
        team: [{ id: "bad" }], // Missing required fields
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });

    it("rejects invalid JSON body", async () => {
      const req = new EventEmitter() as IncomingMessage;
      req.method = "POST";
      req.url = "/vwp/onboarding/complete";
      req.headers = { authorization: `Bearer ${TEST_TOKEN}` };
      process.nextTick(() => {
        req.emit("data", Buffer.from("not json"));
        req.emit("end");
      });

      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
    });

    it("accepts ecommerce business type", async () => {
      const req = createMockReq("POST", "/vwp/onboarding/complete", {
        ...validPayload,
        businessType: "ecommerce",
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);

      const team = store.getTeam()!;
      expect(team.businessType).toBe("ecommerce");
    });
  });

  describe("DELETE /vwp/onboarding", () => {
    it("returns { reset: true } and clears store data", async () => {
      // Seed data first
      store.saveOnboarding({
        completed: true,
        completedAt: Date.now(),
        businessType: "consulting",
        businessName: "Test",
        userName: "Alice",
      });
      store.saveTeam({
        businessType: "consulting",
        businessName: "Test",
        members: [],
        updatedAt: Date.now(),
      });

      const req = createMockReq("DELETE", "/vwp/onboarding");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ reset: true });

      // Store should be empty
      expect(store.getOnboarding()).toBeNull();
      expect(store.getTeam()).toBeNull();
    });

    it("succeeds even when no data exists", async () => {
      const req = createMockReq("DELETE", "/vwp/onboarding");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ reset: true });
    });

    it("succeeds when only onboarding data exists (no team)", async () => {
      store.saveOnboarding({
        completed: true,
        completedAt: Date.now(),
        businessType: "consulting",
        businessName: "Test",
        userName: "Alice",
      });

      const req = createMockReq("DELETE", "/vwp/onboarding");
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ reset: true });
      expect(store.getOnboarding()).toBeNull();
    });
  });
});
