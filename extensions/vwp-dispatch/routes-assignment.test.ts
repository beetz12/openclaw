import { EventEmitter } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIXTURE_DIR = join(import.meta.dirname!, ".test-routes-assignment-fixtures");
const TEST_TOKEN = "test-token";

vi.mock("node:os", () => ({ homedir: () => FIXTURE_DIR }));

vi.mock("./upstream-imports.js", () => ({
  getBearerToken: (req: IncomingMessage) => {
    const auth = req.headers?.authorization ?? "";
    return auth.replace("Bearer ", "");
  },
  safeEqualSecret: (a: string, b: string) => a === b,
}));

const { createDispatchHttpHandler } = await import("./routes.ts");

function createMockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { authorization: `Bearer ${TEST_TOKEN}` };

  if (body !== undefined) {
    setTimeout(() => {
      req.emit("data", Buffer.from(JSON.stringify(body)));
      req.emit("end");
    }, 5);
  } else {
    setTimeout(() => req.emit("end"), 5);
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

const queueStub = {
  enqueue: vi.fn(async () => 0),
  cancel: vi.fn(async () => true),
  getActive: vi.fn(() => null),
  getQueue: vi.fn(() => []),
};

describe("dispatch assignment routes", () => {
  const handler = createDispatchHttpHandler({
    queue: queueStub as any,
    gatewayToken: TEST_TOKEN,
  });

  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(join(FIXTURE_DIR, ".openclaw", "vwp", "tasks"), { recursive: true });
    await mkdir(join(FIXTURE_DIR, ".openclaw", "vwp"), { recursive: true });

    await writeFile(
      join(FIXTURE_DIR, ".openclaw", "vwp", "team.json"),
      JSON.stringify(
        {
          businessType: "consulting",
          businessName: "Test",
          members: [
            {
              id: "mkt-1",
              name: "Marketing",
              role: "Marketing",
              skills: ["seo", "linkedin"],
              required: false,
              active: true,
            },
            {
              id: "eng-1",
              name: "Engineering",
              role: "Engineering",
              skills: ["typescript"],
              required: false,
              active: true,
            },
          ],
          updatedAt: Date.now(),
        },
        null,
        2,
      ),
    );

    const submitReq = createMockReq("POST", "/vwp/dispatch/submit", {
      text: "Create marketing SEO plan",
    });
    const submitRes = createMockRes();
    await handler(submitReq, submitRes);
    expect(submitRes._status).toBe(201);
  });

  it("supports auto-assign + explain", async () => {
    const listReq = createMockReq("GET", "/vwp/dispatch/tasks");
    const listRes = createMockRes();
    await handler(listReq, listRes);
    const firstTask = (listRes._body as any).tasks?.[0];
    const taskId = (firstTask?.id ?? "") as string;
    expect(taskId).not.toBe("");
    expect(firstTask.assignment).toBeDefined();
    expect(firstTask.assignment.assignmentMode).toBe("auto");

    const autoReq = createMockReq("POST", `/vwp/dispatch/tasks/${taskId}/auto-assign`);
    const autoRes = createMockRes();
    await handler(autoReq, autoRes);
    expect(autoRes._status).toBe(200);
    expect((autoRes._body as any).assignment).toBeDefined();
    expect((autoRes._body as any).explain).toBeDefined();
  });

  it("supports manual assign + unlock", async () => {
    const listReq = createMockReq("GET", "/vwp/dispatch/tasks");
    const listRes = createMockRes();
    await handler(listReq, listRes);
    const taskId = ((listRes._body as any).tasks?.[0]?.id ?? "") as string;

    const assignReq = createMockReq("POST", `/vwp/dispatch/tasks/${taskId}/assign`, {
      agentId: "eng-1",
      role: "Engineering",
      mode: "manual-lock",
      requiredSkills: ["typescript"],
    });
    const assignRes = createMockRes();
    await handler(assignReq, assignRes);
    expect(assignRes._status).toBe(200);
    expect((assignRes._body as any).assignment.assignmentMode).toBe("manual-lock");

    const unlockReq = createMockReq("POST", `/vwp/dispatch/tasks/${taskId}/unlock-assignment`);
    const unlockRes = createMockRes();
    await handler(unlockReq, unlockRes);
    expect(unlockRes._status).toBe(200);
    expect((unlockRes._body as any).assignment.assignmentMode).toBe("auto");
  });

  it("returns 400 on assign when agentId missing", async () => {
    const listReq = createMockReq("GET", "/vwp/dispatch/tasks");
    const listRes = createMockRes();
    await handler(listReq, listRes);
    const taskId = ((listRes._body as any).tasks?.[0]?.id ?? "") as string;

    const assignReq = createMockReq("POST", `/vwp/dispatch/tasks/${taskId}/assign`, {
      role: "Engineering",
    });
    const assignRes = createMockRes();
    await handler(assignReq, assignRes);
    expect(assignRes._status).toBe(400);
  });

  it("returns 400 on assign with invalid JSON", async () => {
    const listReq = createMockReq("GET", "/vwp/dispatch/tasks");
    const listRes = createMockRes();
    await handler(listReq, listRes);
    const taskId = ((listRes._body as any).tasks?.[0]?.id ?? "") as string;

    const req = new EventEmitter() as IncomingMessage;
    req.method = "POST";
    req.url = `/vwp/dispatch/tasks/${taskId}/assign`;
    req.headers = { authorization: `Bearer ${TEST_TOKEN}` };
    setTimeout(() => {
      req.emit("data", Buffer.from("{bad-json"));
      req.emit("end");
    }, 5);

    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 404 for unknown task id on assignment routes", async () => {
    const missingId = "task-does-not-exist";

    const assignReq = createMockReq("POST", `/vwp/dispatch/tasks/${missingId}/assign`, {
      agentId: "eng-1",
      role: "Engineering",
    });
    const assignRes = createMockRes();
    await handler(assignReq, assignRes);
    expect(assignRes._status).toBe(404);

    const autoReq = createMockReq("POST", `/vwp/dispatch/tasks/${missingId}/auto-assign`);
    const autoRes = createMockRes();
    await handler(autoReq, autoRes);
    expect(autoRes._status).toBe(404);

    const unlockReq = createMockReq("POST", `/vwp/dispatch/tasks/${missingId}/unlock-assignment`);
    const unlockRes = createMockRes();
    await handler(unlockReq, unlockRes);
    expect(unlockRes._status).toBe(404);

    const explainReq = createMockReq("GET", `/vwp/dispatch/tasks/${missingId}/assignment-explain`);
    const explainRes = createMockRes();
    await handler(explainReq, explainRes);
    expect(explainRes._status).toBe(404);
  });
});
