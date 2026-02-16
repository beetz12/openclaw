import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { ToolRunner } = await import("./tool-runner.ts");

describe("ToolRunner", () => {
  let runner: InstanceType<typeof ToolRunner>;

  beforeEach(() => {
    runner = new ToolRunner({ maxConcurrent: 2 });
  });

  afterEach(async () => {
    await runner.cancelAll();
  });

  it("starts a simple python process and captures output", async () => {
    // Run a trivial python command that prints to stdout
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const runId = await runner.start({
      toolName: "test_tool",
      toolLabel: "Test Tool",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: 'print("hello from tool")' },
      envAllowlist: [],
      timeoutSeconds: 10,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });

    expect(runId).toBeTruthy();
    // Wait for completion
    await runner.waitForRun(runId);

    const started = events.find((e) => e.type === "tool_run_started");
    expect(started).toBeDefined();

    const completed = events.find((e) => e.type === "tool_run_completed");
    expect(completed).toBeDefined();
    expect(completed?.exitCode).toBe(0);
  });

  it("respects max concurrent limit", async () => {
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    // Start 2 long-running processes (max is 2)
    await runner.start({
      toolName: "slow1",
      toolLabel: "Slow 1",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: "import time; time.sleep(5)" },
      envAllowlist: [],
      timeoutSeconds: 10,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });
    await runner.start({
      toolName: "slow2",
      toolLabel: "Slow 2",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: "import time; time.sleep(5)" },
      envAllowlist: [],
      timeoutSeconds: 10,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });

    // Third should throw
    await expect(
      runner.start({
        toolName: "slow3",
        toolLabel: "Slow 3",
        toolDir: "/tmp",
        entrypoint: "-c",
        runtime: "python3",
        args: { __raw: "print('hi')" },
        envAllowlist: [],
        timeoutSeconds: 10,
        maxOutputBytes: 1048576,
        onEvent: () => {},
      }),
    ).rejects.toThrow(/concurrent/i);
  });

  it("can cancel a running process", async () => {
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const runId = await runner.start({
      toolName: "cancel_test",
      toolLabel: "Cancel Test",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: "import time; time.sleep(60)" },
      envAllowlist: [],
      timeoutSeconds: 120,
      maxOutputBytes: 1048576,
      onEvent: (event) => events.push(event),
    });

    // Cancel it
    const cancelled = await runner.cancel(runId);
    expect(cancelled).toBe(true);

    const cancelledEvent = events.find((e) => e.type === "tool_run_cancelled");
    expect(cancelledEvent).toBeDefined();
  });

  it("returns active runs", async () => {
    await runner.start({
      toolName: "active_test",
      toolLabel: "Active Test",
      toolDir: "/tmp",
      entrypoint: "-c",
      runtime: "python3",
      args: { __raw: "import time; time.sleep(10)" },
      envAllowlist: [],
      timeoutSeconds: 30,
      maxOutputBytes: 1048576,
      onEvent: () => {},
    });

    const active = runner.getActiveRuns();
    expect(active.length).toBe(1);
    expect(active[0].toolName).toBe("active_test");
    expect(active[0].status).toBe("running");
  });
});
