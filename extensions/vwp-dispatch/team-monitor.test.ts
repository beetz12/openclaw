import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const FIXTURE_DIR = join(import.meta.dirname!, ".test-fixtures", "monitor");
const TASKS_BASE = join(FIXTURE_DIR, ".openclaw", "vwp", "tasks");

vi.mock("node:os", () => ({
  homedir: () => FIXTURE_DIR,
}));

// Capture chokidar event handlers so we can simulate file events.
type ChokidarHandler = (path: string) => void;
let addHandler: ChokidarHandler | null = null;
let changeHandler: ChokidarHandler | null = null;

vi.mock("chokidar", () => ({
  watch: () => ({
    on(event: string, handler: ChokidarHandler) {
      if (event === "add") addHandler = handler;
      if (event === "change") changeHandler = handler;
      return this;
    },
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

const { TeamMonitor } = await import("./team-monitor.ts");

describe("TeamMonitor", () => {
  const taskId = "test-task-001";

  beforeEach(async () => {
    addHandler = null;
    changeHandler = null;
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    const taskDir = join(TASKS_BASE, taskId);
    await mkdir(join(taskDir, "results"), { recursive: true });
    await mkdir(join(taskDir, "checkpoints"), { recursive: true });
    await mkdir(join(taskDir, "pending-actions"), { recursive: true });
  });

  afterEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("creates a monitor and starts watching", async () => {
    const monitor = new TeamMonitor(taskId);
    await monitor.start();
    expect(addHandler).not.toBeNull();
    await monitor.stop();
  });

  it("emits subtask_completed when results file appears", async () => {
    const events: unknown[] = [];
    const monitor = new TeamMonitor(taskId);
    monitor.onProgress((event) => events.push(event));
    await monitor.start();

    // Write a result file.
    const resultPath = join(TASKS_BASE, taskId, "results", "researcher.json");
    await writeFile(
      resultPath,
      JSON.stringify({
        status: "completed",
        result: "Research done",
        agentName: "researcher",
      }),
    );

    // Simulate chokidar detecting the file.
    addHandler!(resultPath);

    // Wait for debounce (100ms) + processing.
    await sleep(200);

    expect(events).toHaveLength(1);
    const event = events[0] as any;
    expect(event.type).toBe("subtask_completed");
    expect(event.taskId).toBe(taskId);
    expect(event.subtaskId).toBe("researcher");
    expect(event.result).toBe("Research done");

    await monitor.stop();
  });

  it("emits subtask_failed when result has failed status", async () => {
    const events: unknown[] = [];
    const monitor = new TeamMonitor(taskId);
    monitor.onProgress((event) => events.push(event));
    await monitor.start();

    const resultPath = join(TASKS_BASE, taskId, "results", "writer.json");
    await writeFile(
      resultPath,
      JSON.stringify({
        status: "failed",
        error: "Could not write content",
        agentName: "writer",
      }),
    );

    addHandler!(resultPath);
    await sleep(200);

    expect(events).toHaveLength(1);
    const event = events[0] as any;
    expect(event.type).toBe("subtask_failed");
    expect(event.error).toBe("Could not write content");

    await monitor.stop();
  });

  it("emits agent_action when checkpoint file appears", async () => {
    const events: unknown[] = [];
    const monitor = new TeamMonitor(taskId);
    monitor.onProgress((event) => events.push(event));
    await monitor.start();

    const checkpointPath = join(TASKS_BASE, taskId, "checkpoints", "researcher-progress.json");
    await writeFile(
      checkpointPath,
      JSON.stringify({
        action: "analyzing",
        detail: "Reviewing data sources",
      }),
    );

    addHandler!(checkpointPath);
    await sleep(200);

    expect(events).toHaveLength(1);
    const event = events[0] as any;
    expect(event.type).toBe("agent_action");
    expect(event.agentName).toBe("researcher");
    expect(event.action).toBe("analyzing");
    expect(event.detail).toBe("Reviewing data sources");

    await monitor.stop();
  });

  it("emits approval_required when pending-action file appears", async () => {
    const events: unknown[] = [];
    const monitor = new TeamMonitor(taskId);
    monitor.onProgress((event) => events.push(event));
    await monitor.start();

    const actionPath = join(TASKS_BASE, taskId, "pending-actions", "action-1.json");
    await writeFile(
      actionPath,
      JSON.stringify({
        subtaskId: "researcher",
        actionType: "external_api_call",
      }),
    );

    addHandler!(actionPath);
    await sleep(200);

    expect(events).toHaveLength(1);
    const event = events[0] as any;
    expect(event.type).toBe("approval_required");
    expect(event.subtaskId).toBe("researcher");
    expect(event.actionType).toBe("external_api_call");

    await monitor.stop();
  });

  it("ignores pending-action response files", async () => {
    const events: unknown[] = [];
    const monitor = new TeamMonitor(taskId);
    monitor.onProgress((event) => events.push(event));
    await monitor.start();

    const responsePath = join(TASKS_BASE, taskId, "pending-actions", "action-1-response.json");
    await writeFile(responsePath, JSON.stringify({ approved: true }));

    addHandler!(responsePath);
    await sleep(200);

    expect(events).toHaveLength(0);
    await monitor.stop();
  });

  it("emits cost_update and auto-stops on final.json", async () => {
    const events: unknown[] = [];
    const monitor = new TeamMonitor(taskId);
    monitor.onProgress((event) => events.push(event));
    await monitor.start();

    const finalPath = join(TASKS_BASE, taskId, "final.json");
    await writeFile(
      finalPath,
      JSON.stringify({
        taskId,
        status: "completed",
        costTokens: 5000,
        costUsd: 0.25,
      }),
    );

    addHandler!(finalPath);
    await sleep(200);

    const costEvents = events.filter((e: any) => e.type === "cost_update");
    expect(costEvents).toHaveLength(1);
    const cost = costEvents[0] as any;
    expect(cost.currentTokens).toBe(5000);
    expect(cost.currentUsd).toBe(0.25);
  });

  it("emits to SSE when provided", async () => {
    const sseEmitted: unknown[] = [];
    const mockSSE = {
      emit: (event: unknown) => sseEmitted.push(event),
    } as any;

    const monitor = new TeamMonitor(taskId, mockSSE);
    await monitor.start();

    const resultPath = join(TASKS_BASE, taskId, "results", "writer.json");
    await writeFile(
      resultPath,
      JSON.stringify({
        status: "completed",
        result: "done",
        agentName: "writer",
      }),
    );

    addHandler!(resultPath);
    await sleep(200);

    expect(sseEmitted).toHaveLength(1);
    expect((sseEmitted[0] as any).type).toBe("subtask_completed");

    await monitor.stop();
  });

  it("ignores non-json files", async () => {
    const events: unknown[] = [];
    const monitor = new TeamMonitor(taskId);
    monitor.onProgress((event) => events.push(event));
    await monitor.start();

    const txtPath = join(TASKS_BASE, taskId, "results", "readme.txt");
    await writeFile(txtPath, "not json");

    addHandler!(txtPath);
    await sleep(200);

    expect(events).toHaveLength(0);
    await monitor.stop();
  });

  it("debounces rapid file changes", async () => {
    const events: unknown[] = [];
    const monitor = new TeamMonitor(taskId);
    monitor.onProgress((event) => events.push(event));
    await monitor.start();

    const resultPath = join(TASKS_BASE, taskId, "results", "researcher.json");
    await writeFile(
      resultPath,
      JSON.stringify({
        status: "completed",
        result: "final version",
        agentName: "researcher",
      }),
    );

    // Simulate rapid changes.
    addHandler!(resultPath);
    changeHandler!(resultPath);
    changeHandler!(resultPath);
    await sleep(300);

    // Should only emit once due to debounce.
    expect(events).toHaveLength(1);
    await monitor.stop();
  });

  it("stops emitting after stop() is called", async () => {
    const events: unknown[] = [];
    const monitor = new TeamMonitor(taskId);
    monitor.onProgress((event) => events.push(event));
    await monitor.start();
    await monitor.stop();

    const resultPath = join(TASKS_BASE, taskId, "results", "researcher.json");
    await writeFile(
      resultPath,
      JSON.stringify({
        status: "completed",
        result: "done",
        agentName: "researcher",
      }),
    );

    addHandler!(resultPath);
    await sleep(200);

    expect(events).toHaveLength(0);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
