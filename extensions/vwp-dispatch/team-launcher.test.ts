import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock homedir to use a temp fixture directory.
const FIXTURE_DIR = join(import.meta.dirname!, ".test-fixtures", "launcher");
const TASKS_BASE = join(FIXTURE_DIR, ".openclaw", "vwp", "tasks");

vi.mock("node:os", () => ({
  homedir: () => FIXTURE_DIR,
}));

// Mock runCommandWithTimeout to avoid spawning real CLIs.
const mockRunCommand = vi.fn().mockResolvedValue({
  stdout: '{"result": "ok"}',
  stderr: "",
  code: 0,
  signal: null,
  killed: false,
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

// Mock context-loader to avoid real file reads.
vi.mock("./context-loader.js", () => ({
  generateSkillSummary: vi.fn().mockResolvedValue("Test skill summary"),
}));

const { launchTeam } = await import("./team-launcher.ts");

// Minimal mock registry.
const mockRegistry = {
  getSkill: vi.fn().mockReturnValue({ skillPath: "/tmp/test-skill" }),
} as any;

function createTestSpec() {
  return {
    leadPrompt: "You are the team lead.",
    specialists: [
      {
        role: "researcher",
        skillPlugin: "test-plugin",
        skillName: "research",
        contextKeys: ["businessName"],
      },
      {
        role: "writer",
        skillPlugin: "test-plugin",
        skillName: "writing",
        contextKeys: [],
      },
    ],
    estimatedCost: {
      estimatedTokens: 10000,
      estimatedCostUsd: 0.5,
      breakdown: { analysis: 1000, perAgent: 3000, synthesis: 1000 },
    },
  };
}

describe("team-launcher", () => {
  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
    mockRunCommand.mockClear();
    mockRunCommand.mockResolvedValue({
      stdout: '{"result": "ok"}',
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    });
  });

  afterEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("returns a TeamHandle with specialist entries", async () => {
    const spec = createTestSpec();
    const handle = await launchTeam(spec, "task-001", mockRegistry);

    expect(handle.taskId).toBe("task-001");
    expect(handle.specialists).toHaveLength(2);
    expect(handle.specialists[0]!.role).toBe("researcher");
    expect(handle.specialists[1]!.role).toBe("writer");
    expect(handle.monitor).toBeDefined();
  });

  it("creates prompt files for each specialist and lead", async () => {
    const spec = createTestSpec();
    await launchTeam(spec, "task-002", mockRegistry);

    const taskDir = join(TASKS_BASE, "task-002");
    const promptsDir = join(taskDir, "prompts");
    const files = await readdir(promptsDir);

    expect(files).toContain("lead.txt");
    expect(files).toContain("researcher.txt");
    expect(files).toContain("writer.txt");

    // Verify lead prompt content.
    const leadPrompt = await readFile(join(promptsDir, "lead.txt"), "utf-8");
    expect(leadPrompt).toContain("task-002");
    expect(leadPrompt).toContain("team lead");

    // Verify specialist prompt content.
    const researchPrompt = await readFile(join(promptsDir, "researcher.txt"), "utf-8");
    expect(researchPrompt).toContain("researcher");
    expect(researchPrompt).toContain("test-plugin");
  });

  it("creates result directories", async () => {
    const spec = createTestSpec();
    await launchTeam(spec, "task-003", mockRegistry);

    const taskDir = join(TASKS_BASE, "task-003");
    const resultsFiles = await readdir(join(taskDir, "results"));
    expect(resultsFiles).toContain("researcher.json");
    expect(resultsFiles).toContain("writer.json");
  });

  it("spawns lead first then specialists in parallel", async () => {
    const callOrder: string[] = [];
    mockRunCommand.mockImplementation(async (argv: string[]) => {
      const prompt = argv[argv.indexOf("-p") + 1] ?? "";
      if (prompt.includes("team lead")) {
        callOrder.push("lead");
      } else {
        callOrder.push("specialist");
      }
      return { stdout: '{"result": "ok"}', stderr: "", code: 0, signal: null, killed: false };
    });

    const spec = createTestSpec();
    await launchTeam(spec, "task-004", mockRegistry);

    // Lead should be called first.
    expect(callOrder[0]).toBe("lead");
    // Then specialists (2 of them).
    expect(callOrder.filter((c) => c === "specialist")).toHaveLength(2);
  });

  it("calls runCommandWithTimeout with correct args", async () => {
    const spec = createTestSpec();
    await launchTeam(spec, "task-005", mockRegistry, { model: "opus" });

    // Lead call + 2 specialist calls = 3 total.
    expect(mockRunCommand).toHaveBeenCalledTimes(3);

    // Check CLI args structure.
    const firstCall = mockRunCommand.mock.calls[0]!;
    const argv = firstCall[0] as string[];
    expect(argv[0]).toBe("claude");
    expect(argv).toContain("-p");
    expect(argv).toContain("--dangerously-skip-permissions");
    expect(argv).toContain("--output-format");
    expect(argv).toContain("json");
    expect(argv).toContain("--model");
    expect(argv).toContain("opus");
  });

  it("writes final.json on completion", async () => {
    const spec = createTestSpec();
    await launchTeam(spec, "task-006", mockRegistry);

    const finalPath = join(TASKS_BASE, "task-006", "final.json");
    const raw = await readFile(finalPath, "utf-8");
    const final = JSON.parse(raw);

    expect(final.taskId).toBe("task-006");
    expect(final.status).toBe("completed");
    expect(final.subtasks).toHaveLength(2);
  });

  it("marks specialists as failed when subprocess fails", async () => {
    mockRunCommand.mockImplementation(async (argv: string[]) => {
      const prompt = argv[argv.indexOf("-p") + 1] ?? "";
      if (prompt.includes("team lead")) {
        return { stdout: "{}", stderr: "", code: 0, signal: null, killed: false };
      }
      return { stdout: "", stderr: "error occurred", code: 1, signal: null, killed: false };
    });

    const spec = createTestSpec();
    const handle = await launchTeam(spec, "task-007", mockRegistry);

    // All specialists should be marked failed.
    for (const s of handle.specialists) {
      expect(s.status).toBe("failed");
    }

    // Final should reflect failure.
    const finalPath = join(TASKS_BASE, "task-007", "final.json");
    const raw = await readFile(finalPath, "utf-8");
    const final = JSON.parse(raw);
    expect(final.status).toBe("failed");
  });

  it("emits SSE events when sse is provided", async () => {
    const emitted: unknown[] = [];
    const mockSSE = {
      emit: (event: unknown) => emitted.push(event),
    } as any;

    const spec = createTestSpec();
    await launchTeam(spec, "task-008", mockRegistry, { sse: mockSSE });

    // Should emit subtask_started for each specialist.
    const startEvents = emitted.filter((e: any) => e.type === "subtask_started");
    expect(startEvents).toHaveLength(2);
  });

  it("handles empty specialists list", async () => {
    const spec = {
      ...createTestSpec(),
      specialists: [],
    };
    const handle = await launchTeam(spec, "task-009", mockRegistry);

    expect(handle.specialists).toHaveLength(0);
    // Only lead call should happen.
    expect(mockRunCommand).toHaveBeenCalledTimes(1);
  });
});
