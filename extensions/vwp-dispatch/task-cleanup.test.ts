import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupOldTasks } from "./task-cleanup.js";

describe("cleanupOldTasks", () => {
  const TEST_DIR = join(process.cwd(), ".test-task-cleanup");
  const TASKS_DIR = join(TEST_DIR, "tasks");

  beforeEach(async () => {
    await mkdir(TASKS_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns zero when tasks directory is empty", async () => {
    const result = await cleanupOldTasks({ tasksDir: TASKS_DIR });

    expect(result.deleted).toBe(0);
    expect(result.taskIds).toEqual([]);
  });

  it("deletes tasks older than maxAgeDays", async () => {
    const now = Date.now();
    const oldTask = now - 100 * 24 * 60 * 60 * 1000; // 100 days ago

    const taskDir = join(TASKS_DIR, "old-task");
    await mkdir(taskDir);
    await writeFile(
      join(taskDir, "final.json"),
      JSON.stringify({ completedAt: oldTask, status: "completed" }),
    );

    const result = await cleanupOldTasks({ tasksDir: TASKS_DIR, maxAgeDays: 90 });

    expect(result.deleted).toBe(1);
    expect(result.taskIds).toEqual(["old-task"]);

    // Verify directory was actually deleted
    const remaining = await readdir(TASKS_DIR);
    expect(remaining).toEqual([]);
  });

  it("preserves tasks newer than maxAgeDays", async () => {
    const now = Date.now();
    const recentTask = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago

    const taskDir = join(TASKS_DIR, "recent-task");
    await mkdir(taskDir);
    await writeFile(
      join(taskDir, "final.json"),
      JSON.stringify({ completedAt: recentTask, status: "completed" }),
    );

    const result = await cleanupOldTasks({ tasksDir: TASKS_DIR, maxAgeDays: 90 });

    expect(result.deleted).toBe(0);
    expect(result.taskIds).toEqual([]);

    // Verify directory still exists
    const remaining = await readdir(TASKS_DIR);
    expect(remaining).toContain("recent-task");
  });

  it("deletes multiple old tasks and preserves recent ones", async () => {
    const now = Date.now();
    const veryOld = now - 200 * 24 * 60 * 60 * 1000; // 200 days ago
    const old = now - 100 * 24 * 60 * 60 * 1000; // 100 days ago
    const recent = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago

    // Create very old task
    const task1Dir = join(TASKS_DIR, "task-1");
    await mkdir(task1Dir);
    await writeFile(
      join(task1Dir, "final.json"),
      JSON.stringify({ completedAt: veryOld, status: "completed" }),
    );

    // Create old task
    const task2Dir = join(TASKS_DIR, "task-2");
    await mkdir(task2Dir);
    await writeFile(
      join(task2Dir, "final.json"),
      JSON.stringify({ completedAt: old, status: "completed" }),
    );

    // Create recent task
    const task3Dir = join(TASKS_DIR, "task-3");
    await mkdir(task3Dir);
    await writeFile(
      join(task3Dir, "final.json"),
      JSON.stringify({ completedAt: recent, status: "completed" }),
    );

    const result = await cleanupOldTasks({ tasksDir: TASKS_DIR, maxAgeDays: 90 });

    expect(result.deleted).toBe(2);
    expect(result.taskIds).toEqual(expect.arrayContaining(["task-1", "task-2"]));

    // Verify only recent task remains
    const remaining = await readdir(TASKS_DIR);
    expect(remaining).toEqual(["task-3"]);
  });

  it("skips tasks without completedAt timestamp", async () => {
    const taskDir = join(TASKS_DIR, "running-task");
    await mkdir(taskDir);
    await writeFile(join(taskDir, "final.json"), JSON.stringify({ status: "running" }));

    const result = await cleanupOldTasks({ tasksDir: TASKS_DIR, maxAgeDays: 90 });

    expect(result.deleted).toBe(0);

    // Verify task still exists
    const remaining = await readdir(TASKS_DIR);
    expect(remaining).toContain("running-task");
  });

  it("skips tasks without final.json", async () => {
    const taskDir = join(TASKS_DIR, "no-final");
    await mkdir(taskDir);

    const result = await cleanupOldTasks({ tasksDir: TASKS_DIR, maxAgeDays: 90 });

    expect(result.deleted).toBe(0);

    // Verify task directory still exists
    const remaining = await readdir(TASKS_DIR);
    expect(remaining).toContain("no-final");
  });

  it("handles malformed final.json gracefully", async () => {
    const now = Date.now();
    const oldTask = now - 100 * 24 * 60 * 60 * 1000;

    // Valid old task
    const task1Dir = join(TASKS_DIR, "task-1");
    await mkdir(task1Dir);
    await writeFile(
      join(task1Dir, "final.json"),
      JSON.stringify({ completedAt: oldTask, status: "completed" }),
    );

    // Malformed JSON task
    const task2Dir = join(TASKS_DIR, "task-2");
    await mkdir(task2Dir);
    await writeFile(join(task2Dir, "final.json"), "{ invalid json");

    const result = await cleanupOldTasks({ tasksDir: TASKS_DIR, maxAgeDays: 90 });

    // Should delete only the valid old task
    expect(result.deleted).toBe(1);
    expect(result.taskIds).toEqual(["task-1"]);

    // Malformed task should remain
    const remaining = await readdir(TASKS_DIR);
    expect(remaining).toContain("task-2");
  });

  it("uses default maxAgeDays of 90 when not specified", async () => {
    const now = Date.now();
    const task91DaysOld = now - 91 * 24 * 60 * 60 * 1000;
    const task89DaysOld = now - 89 * 24 * 60 * 60 * 1000;

    // Create task just over 90 days old
    const task1Dir = join(TASKS_DIR, "task-91");
    await mkdir(task1Dir);
    await writeFile(
      join(task1Dir, "final.json"),
      JSON.stringify({ completedAt: task91DaysOld, status: "completed" }),
    );

    // Create task just under 90 days old
    const task2Dir = join(TASKS_DIR, "task-89");
    await mkdir(task2Dir);
    await writeFile(
      join(task2Dir, "final.json"),
      JSON.stringify({ completedAt: task89DaysOld, status: "completed" }),
    );

    const result = await cleanupOldTasks({ tasksDir: TASKS_DIR });

    expect(result.deleted).toBe(1);
    expect(result.taskIds).toEqual(["task-91"]);

    const remaining = await readdir(TASKS_DIR);
    expect(remaining).toEqual(["task-89"]);
  });

  it("respects custom maxAgeDays value", async () => {
    const now = Date.now();
    const task40DaysOld = now - 40 * 24 * 60 * 60 * 1000;

    const taskDir = join(TASKS_DIR, "task-40");
    await mkdir(taskDir);
    await writeFile(
      join(taskDir, "final.json"),
      JSON.stringify({ completedAt: task40DaysOld, status: "completed" }),
    );

    // With 30 day threshold, 40-day-old task should be deleted
    const result = await cleanupOldTasks({ tasksDir: TASKS_DIR, maxAgeDays: 30 });

    expect(result.deleted).toBe(1);
    expect(result.taskIds).toEqual(["task-40"]);
  });

  it("handles non-existent tasks directory gracefully", async () => {
    const nonExistentDir = join(TEST_DIR, "does-not-exist");

    const result = await cleanupOldTasks({ tasksDir: nonExistentDir });

    expect(result.deleted).toBe(0);
    expect(result.taskIds).toEqual([]);
  });
});
