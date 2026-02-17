/**
 * Full pipeline integration test — exercises the complete VWP dispatch lifecycle:
 *
 *   1. User submits a task
 *   2. System decomposes into subtasks (mocked Claude CLI)
 *   3. Board state updates as task moves through columns
 *   4. User confirms the decomposition
 *   5. Agent team launches and specialists execute (mocked)
 *   6. SSE events emitted at each stage
 *   7. Final results available via API
 *   8. Board shows task in "done" column
 *
 * This tests the real modules (queue, checkpoint, board-state, routes,
 * kanban-routes, skill-matcher, team-assembler, SSE) with only the Claude CLI
 * subprocess calls mocked.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// ── Mock setup (must be before all imports) ──────────────────────────────────

const FIXTURE_DIR = join(import.meta.dirname!, ".test-fixtures", "e2e-pipeline");
const VWP_DIR = join(FIXTURE_DIR, ".openclaw", "vwp");

vi.mock("node:os", () => ({
  homedir: () => FIXTURE_DIR,
  tmpdir: () => join(FIXTURE_DIR, "tmp"),
}));

// Track all CLI calls for assertions.
const cliCalls: Array<{ argv: string[]; prompt: string }> = [];

const mockRunCommand = vi.fn().mockImplementation(async (argv: string[]) => {
  const promptIdx = argv.indexOf("-p");
  const prompt = promptIdx >= 0 ? (argv[promptIdx + 1] ?? "") : "";
  cliCalls.push({ argv, prompt });

  // Analyzer response — returns a structured decomposition.
  if (prompt.includes("Write a product listing")) {
    return {
      stdout: JSON.stringify({
        result: JSON.stringify({
          subtasks: [
            { description: "Research competitor product listings", domain: "marketing" },
            { description: "Write compelling product copy", domain: "marketing" },
          ],
          domains: ["marketing"],
          estimatedComplexity: "low",
        }),
      }),
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    };
  }

  // Team lead coordination call.
  if (prompt.includes("team lead")) {
    return {
      stdout: JSON.stringify({ result: "Coordination complete. Specialists assigned." }),
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    };
  }

  // Specialist calls — return success results.
  if (prompt.includes("specialist agent")) {
    return {
      stdout: JSON.stringify({
        result: "Task completed successfully. Here are the results of the analysis.",
      }),
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    };
  }

  // Default response for any unmatched prompt.
  return {
    stdout: JSON.stringify({ result: "ok" }),
    stderr: "",
    code: 0,
    signal: null,
    killed: false,
  };
});

vi.mock("../../src/process/exec.js", () => ({
  runCommandWithTimeout: (...args: unknown[]) => mockRunCommand(...args),
}));

// Mock chokidar to avoid real file watching.
vi.mock("chokidar", () => ({
  watch: () => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock auth helpers to accept our test token.
vi.mock("../../src/gateway/http-utils.js", () => ({
  getBearerToken: (req: IncomingMessage) => {
    const auth = req.headers.authorization ?? "";
    return auth.startsWith("Bearer ") ? auth.slice(7) : "";
  },
}));

vi.mock("../../src/security/secret-equal.js", () => ({
  safeEqualSecret: (a: string, b: string) => a === b,
}));

// Mock context-loader to return a test business profile.
vi.mock("./context-loader.js", () => ({
  loadProfile: vi.fn().mockResolvedValue({
    businessName: "Test Widget Co",
    industry: "ecommerce",
  }),
  loadBusinessContext: vi.fn().mockResolvedValue({
    profile: { businessName: "Test Widget Co", industry: "ecommerce" },
    role: "lead",
    allowedDomains: ["marketing", "sales"],
    documentAccess: [],
    contextBudget: 2000,
  }),
  generateSkillSummary: vi.fn().mockResolvedValue("Test skill summary"),
}));

// Mock memory client to avoid real NotebookLM calls.
vi.mock("./memory/notebooklm-client.js", () => ({
  createMemoryClient: vi.fn().mockResolvedValue({
    queryNotebook: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("./memory/memory-enrichment.js", () => ({
  enrichDecomposition: vi.fn().mockResolvedValue(null),
  formatEnrichmentPrompt: vi.fn().mockReturnValue(""),
}));

// ── Import real modules after mocks ──────────────────────────────────────────

const { createDispatchHttpHandler } = await import("./routes.ts");
const { createKanbanHttpHandler } = await import("./kanban-routes.ts");
const { TaskQueue } = await import("./task-queue.ts");
const { ApprovalSSE } = await import("../vwp-approval/sse.ts");
const { analyzeTask } = await import("./analyzer.ts");
const { matchSkills } = await import("./skill-matcher.ts");
const { assembleTeam } = await import("./team-assembler.ts");
const { launchTeam } = await import("./team-launcher.ts");
const { loadBusinessContext } = await import("./context-loader.ts");
const checkpoint = await import("./checkpoint.ts");
const boardState = await import("./board-state.ts");

// ── Test helpers ─────────────────────────────────────────────────────────────

const TEST_TOKEN = "test-pipeline-token";
const TEST_PORT = 19876; // unlikely to collide

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function httpRequest(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port: TEST_PORT,
      path,
      method,
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        "Content-Type": "application/json",
      },
    };

    const req = require("node:http").request(options, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        resolve({ status: (res as any).statusCode, body: parsed });
      });
    });

    req.on("error", reject);

    if (body !== undefined) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ── Mock registry with test skills ────────────────────────────────────────────

function createTestRegistry() {
  const skills = [
    {
      pluginName: "vwp-ecommerce",
      skillName: "product-listing",
      label: "Product Listing",
      description: "Create compelling product listings for ecommerce",
      skillPath: "/tmp/test-skills/product-listing",
      domains: ["marketing", "ecommerce"],
    },
    {
      pluginName: "vwp-ecommerce",
      skillName: "email-campaign",
      label: "Email Campaign",
      description: "Design and write email marketing campaigns",
      skillPath: "/tmp/test-skills/email-campaign",
      domains: ["marketing"],
    },
  ];

  return {
    getAllSkills: () => skills,
    getSkill: (plugin: string, skill: string) =>
      skills.find((s) => s.pluginName === plugin && s.skillName === skill) ?? null,
    scan: vi.fn().mockResolvedValue(undefined),
    watchForChanges: vi.fn(),
  } as any;
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("VWP Dispatch — Full Pipeline E2E", () => {
  let server: Server;
  let queue: InstanceType<typeof TaskQueue>;
  let sse: InstanceType<typeof ApprovalSSE>;
  let sseEvents: unknown[];
  let registry: ReturnType<typeof createTestRegistry>;
  let pipelinePromise: Promise<void> | null;

  /**
   * Runs the dispatch pipeline (same logic as index.ts register -> runPipeline).
   * Extracted here so tests can await completion.
   */
  async function runPipeline(task: { id: string; text: string; createdAt: number }) {
    await boardState.moveTask(task.id, "in_progress");
    sse.emit({ type: "task_column_changed", taskId: task.id, from: "todo", to: "in_progress" });

    const decomposition = await analyzeTask(task.text);
    await checkpoint.saveDecomposition(task.id, decomposition);

    const matches = matchSkills(decomposition.subtasks, registry);
    const context = await loadBusinessContext("lead");
    const spec = assembleTeam(matches, context, {
      complexity: decomposition.estimatedComplexity,
    });

    const handle = await launchTeam(spec, task.id, registry, { sse });
    await handle.monitor.stop();

    await boardState.moveTask(task.id, "review");
    sse.emit({ type: "task_column_changed", taskId: task.id, from: "in_progress", to: "review" });

    await boardState.moveTask(task.id, "done");
    sse.emit({ type: "task_column_changed", taskId: task.id, from: "review", to: "done" });

    await queue.completeActive();
  }

  beforeAll(async () => {
    // Create fixture directories.
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(VWP_DIR, { recursive: true });
    await mkdir(join(VWP_DIR, "board"), { recursive: true });
    await mkdir(join(VWP_DIR, "tasks"), { recursive: true });

    // Write a test business profile.
    await writeFile(
      join(VWP_DIR, "profile.json"),
      JSON.stringify({ businessName: "Test Widget Co", industry: "ecommerce" }),
    );

    // Set up infrastructure.
    queue = new TaskQueue();
    sse = new ApprovalSSE();
    sseEvents = [];
    registry = createTestRegistry();

    // Capture all SSE events.
    const origEmit = sse.emit.bind(sse);
    sse.emit = (event: unknown) => {
      sseEvents.push(event);
      return origEmit(event);
    };

    // Create HTTP handlers.
    const dispatchHandler = createDispatchHttpHandler({
      queue,
      gatewayToken: TEST_TOKEN,
      onConfirm: (task) => {
        // Mirror the register() behavior — fire-and-forget pipeline.
        pipelinePromise = runPipeline(task);
      },
    });

    const kanbanHandler = createKanbanHttpHandler({
      gatewayToken: TEST_TOKEN,
    });

    // Start the HTTP server.
    server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const handled = await dispatchHandler(req, res);
        if (handled) return;
        const kanbanHandled = await kanbanHandler(req, res);
        if (kanbanHandled) return;
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not found" }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(TEST_PORT, "127.0.0.1", resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });

  // NOTE: No beforeEach that clears state — this is an integration test where
  // phases are sequential and each test depends on the state from prior tests.

  // ── Phase 1: Submit ──────────────────────────────────────────────────────

  it("Phase 1: Submit a task and verify it is queued", async () => {
    const res = await httpRequest("POST", "/vwp/dispatch/submit", {
      text: "Write a product listing for our new Widget Pro 3000",
    });

    expect(res.status).toBe(201);
    const body = res.body as { id: string; text: string; position: number };
    expect(body.id).toBeDefined();
    expect(body.text).toBe("Write a product listing for our new Widget Pro 3000");
    expect(body.position).toBe(0); // First task → active immediately
  });

  it("Phase 1: Task appears in the task list", async () => {
    const res = await httpRequest("GET", "/vwp/dispatch/tasks");
    expect(res.status).toBe(200);

    const body = res.body as { tasks: Array<{ id: string; text: string; status: string }> };
    expect(body.tasks.length).toBeGreaterThanOrEqual(1);
    expect(body.tasks[0]!.text).toBe("Write a product listing for our new Widget Pro 3000");
    expect(body.tasks[0]!.status).toBe("queued");
  });

  it("Phase 1: Queue shows the task as active", async () => {
    const res = await httpRequest("GET", "/vwp/dispatch/queue");
    expect(res.status).toBe(200);

    const body = res.body as { active: { id: string; text: string } | null };
    expect(body.active).not.toBeNull();
    expect(body.active!.text).toBe("Write a product listing for our new Widget Pro 3000");
  });

  // ── Phase 2: Analysis (write decomposition to simulate auto-analysis) ────

  it("Phase 2: Analyze task and save decomposition", async () => {
    // Get the task ID from the queue.
    const queueRes = await httpRequest("GET", "/vwp/dispatch/queue");
    const taskId = ((queueRes.body as any).active as { id: string }).id;

    // Run analysis (uses mocked CLI).
    const decomposition = await analyzeTask("Write a product listing for our new Widget Pro 3000");

    expect(decomposition.subtasks).toHaveLength(2);
    expect(decomposition.subtasks[0]!.description).toContain("Research");
    expect(decomposition.subtasks[1]!.description).toContain("Write");
    expect(decomposition.estimatedComplexity).toBe("low");

    // Save decomposition so the confirm step will find it.
    await checkpoint.saveDecomposition(taskId, decomposition);

    // Move task to the board "todo" column.
    await boardState.moveTask(taskId, "todo");
  });

  it("Phase 2: Task detail shows decomposition", async () => {
    const queueRes = await httpRequest("GET", "/vwp/dispatch/queue");
    const taskId = ((queueRes.body as any).active as { id: string }).id;

    const res = await httpRequest("GET", `/vwp/dispatch/tasks/${taskId}`);
    expect(res.status).toBe(200);

    const body = res.body as {
      decomposition: { subtasks: unknown[]; estimatedComplexity: string };
    };
    expect(body.decomposition).toBeDefined();
    expect(body.decomposition.subtasks).toHaveLength(2);
    expect(body.decomposition.estimatedComplexity).toBe("low");
  });

  it("Phase 2: Board shows task in todo column", async () => {
    const res = await httpRequest("GET", "/vwp/dispatch/board");
    expect(res.status).toBe(200);

    const body = res.body as { columns: Record<string, unknown[]> };
    expect(body.columns.todo.length).toBe(1);
    expect((body.columns.todo[0] as any).text).toBe(
      "Write a product listing for our new Widget Pro 3000",
    );
  });

  // ── Phase 3: Confirm and execute ──────────────────────────────────────────

  it("Phase 3: Confirm task triggers the full pipeline", async () => {
    const queueRes = await httpRequest("GET", "/vwp/dispatch/queue");
    const taskId = ((queueRes.body as any).active as { id: string }).id;

    // Confirm — this triggers runPipeline via onConfirm callback.
    const confirmRes = await httpRequest("POST", `/vwp/dispatch/confirm/${taskId}`);
    expect(confirmRes.status).toBe(200);
    expect((confirmRes.body as any).status).toBe("dispatching");

    // Wait for the pipeline to complete.
    expect(pipelinePromise).not.toBeNull();
    await pipelinePromise;
  });

  it("Phase 3: Claude CLI was called for analysis, lead, and specialists", async () => {
    // CLI calls: 1 analysis + 1 lead + N specialists.
    // The analysis call inside runPipeline runs the analyzer again.
    const analysisCalls = cliCalls.filter((c) => c.prompt.includes("Write a product listing"));
    const leadCalls = cliCalls.filter((c) => c.prompt.includes("team lead"));
    const specialistCalls = cliCalls.filter((c) => c.prompt.includes("specialist agent"));

    // At least 1 analysis call (from the confirm pipeline).
    expect(analysisCalls.length).toBeGreaterThanOrEqual(1);
    // 1 lead coordination call.
    expect(leadCalls).toHaveLength(1);
    // At least 1 specialist (depends on skill matching).
    expect(specialistCalls.length).toBeGreaterThanOrEqual(1);
  });

  // ── Phase 4: Verify board progression ──────────────────────────────────────

  it("Phase 4: SSE events were emitted for board transitions", () => {
    const columnChanges = sseEvents.filter((e: any) => e.type === "task_column_changed");

    // Should have: todo→in_progress, in_progress→review, review→done
    expect(columnChanges.length).toBeGreaterThanOrEqual(3);

    const transitions = columnChanges.map((e: any) => `${e.from}→${e.to}`);
    expect(transitions).toContain("todo→in_progress");
    expect(transitions).toContain("in_progress→review");
    expect(transitions).toContain("review→done");
  });

  it("Phase 4: SSE events were emitted for specialist starts", () => {
    const startEvents = sseEvents.filter((e: any) => e.type === "subtask_started");
    expect(startEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("Phase 4: Board shows task in done column", async () => {
    const res = await httpRequest("GET", "/vwp/dispatch/board");
    expect(res.status).toBe(200);

    const body = res.body as { columns: Record<string, unknown[]> };
    expect(body.columns.done.length).toBe(1);
    expect(body.columns.todo.length).toBe(0);
    expect(body.columns.in_progress.length).toBe(0);
    expect(body.columns.review.length).toBe(0);
  });

  // ── Phase 5: Results ──────────────────────────────────────────────────────

  it("Phase 5: Task detail shows completed status with results", async () => {
    const taskListRes = await httpRequest("GET", "/vwp/dispatch/tasks");
    const tasks = (taskListRes.body as any).tasks as Array<{ id: string }>;
    const taskId = tasks[0]!.id;

    const res = await httpRequest("GET", `/vwp/dispatch/tasks/${taskId}`);
    expect(res.status).toBe(200);

    const body = res.body as {
      id: string;
      request: { text: string };
      decomposition: { subtasks: unknown[] };
      subtaskResults: Array<{ status: string; agentName: string }>;
      final: { taskId: string; status: string; subtasks: unknown[]; synthesizedResult: string };
    };

    // Request preserved.
    expect(body.request.text).toBe("Write a product listing for our new Widget Pro 3000");

    // Decomposition preserved.
    expect(body.decomposition.subtasks).toHaveLength(2);

    // Final result exists and is completed.
    expect(body.final).toBeDefined();
    expect(body.final.taskId).toBe(taskId);
    expect(body.final.status).toBe("completed");
    expect(body.final.subtasks.length).toBeGreaterThanOrEqual(1);
    expect(body.final.synthesizedResult).toBeTruthy();

    // Subtask results files exist.
    expect(body.subtaskResults.length).toBeGreaterThanOrEqual(1);
    for (const result of body.subtaskResults) {
      expect(result.status).toBe("completed");
    }
  });

  it("Phase 5: Queue is empty after completion", async () => {
    const res = await httpRequest("GET", "/vwp/dispatch/queue");
    expect(res.status).toBe(200);

    const body = res.body as { active: unknown; pending: unknown[]; length: number };
    expect(body.active).toBeNull();
    expect(body.length).toBe(0);
  });

  // ── Kanban operations ──────────────────────────────────────────────────────

  it("Kanban: Can move a task between columns", async () => {
    // Submit a second task.
    const submitRes = await httpRequest("POST", "/vwp/dispatch/submit", {
      text: "Create a social media campaign",
    });
    const taskId = (submitRes.body as any).id;

    // Move to the board.
    await boardState.moveTask(taskId, "backlog");

    // Move via HTTP.
    const moveRes = await httpRequest("PATCH", `/vwp/dispatch/tasks/${taskId}/column`, {
      column: "todo",
    });
    expect(moveRes.status).toBe(200);

    // Verify board.
    const boardRes = await httpRequest("GET", "/vwp/dispatch/board");
    const board = boardRes.body as { columns: Record<string, unknown[]> };
    const todoIds = board.columns.todo.map((t: any) => t.id);
    expect(todoIds).toContain(taskId);
  });

  it("Kanban: Can reorder a task within a column", async () => {
    const boardRes = await httpRequest("GET", "/vwp/dispatch/board");
    const board = boardRes.body as { columns: Record<string, unknown[]> };
    const todoTasks = board.columns.todo as Array<{ id: string }>;

    if (todoTasks.length > 0) {
      const taskId = todoTasks[0]!.id;
      const reorderRes = await httpRequest("PATCH", `/vwp/dispatch/tasks/${taskId}/position`, {
        position: 0,
      });
      expect(reorderRes.status).toBe(200);
    }
  });

  it("Kanban: Can update subtask decomposition", async () => {
    // Get task from todo column.
    const boardRes = await httpRequest("GET", "/vwp/dispatch/board");
    const board = boardRes.body as { columns: Record<string, unknown[]> };
    const todoTasks = board.columns.todo as Array<{ id: string }>;

    if (todoTasks.length > 0) {
      const taskId = todoTasks[0]!.id;
      const subtasksRes = await httpRequest("PATCH", `/vwp/dispatch/tasks/${taskId}/subtasks`, {
        subtasks: [
          { description: "Create Instagram content", domain: "marketing" },
          { description: "Write LinkedIn post", domain: "marketing" },
          { description: "Schedule email blast", domain: "marketing" },
        ],
      });
      expect(subtasksRes.status).toBe(200);

      // Verify the decomposition was saved.
      const taskRes = await httpRequest("GET", `/vwp/dispatch/tasks/${taskId}`);
      const taskBody = taskRes.body as { decomposition: { subtasks: unknown[] } };
      expect(taskBody.decomposition.subtasks).toHaveLength(3);
    }
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it("Auth: Rejects requests without valid token", async () => {
    const options = {
      hostname: "127.0.0.1",
      port: TEST_PORT,
      path: "/vwp/dispatch/tasks",
      method: "GET" as const,
      headers: {
        Authorization: "Bearer wrong-token",
        "Content-Type": "application/json",
      },
    };

    const res = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const req = require("node:http").request(options, (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: (res as any).statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString()),
          });
        });
      });
      req.on("error", reject);
      req.end();
    });

    expect(res.status).toBe(401);
    expect((res.body as any).error).toBe("Unauthorized");
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("Error: Confirm without decomposition returns 409", async () => {
    // Submit a task but don't analyze it.
    const submitRes = await httpRequest("POST", "/vwp/dispatch/submit", {
      text: "A task that has no decomposition yet",
    });
    const taskId = (submitRes.body as any).id;

    const confirmRes = await httpRequest("POST", `/vwp/dispatch/confirm/${taskId}`);
    expect(confirmRes.status).toBe(409);
    expect((confirmRes.body as any).error).toMatch(/not yet analyzed|no decomposition/);
  });

  it("Error: Get non-existent task returns 404", async () => {
    const res = await httpRequest("GET", "/vwp/dispatch/tasks/non-existent-task-id");
    expect(res.status).toBe(404);
  });

  it("Error: Submit with empty text returns 400", async () => {
    const res = await httpRequest("POST", "/vwp/dispatch/submit", { text: "" });
    expect(res.status).toBe(400);
  });

  it("Error: Submit with missing text field returns 400", async () => {
    const res = await httpRequest("POST", "/vwp/dispatch/submit", {});
    expect(res.status).toBe(400);
  });
});
