import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMonthlySpend } from "./cost-tracker.js";

describe("getMonthlySpend", () => {
  const TEST_DIR = join(process.cwd(), ".test-cost-tracker");
  const TASKS_DIR = join(TEST_DIR, ".openclaw", "vwp", "tasks");

  beforeEach(async () => {
    await mkdir(TASKS_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns 0 when tasks directory is empty", async () => {
    const spend = await getMonthlySpend(TASKS_DIR);
    expect(spend).toBe(0);
  });

  it("sums costs for tasks completed this month", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).getTime();

    // Task 1: completed this month with cost
    const task1Dir = join(TASKS_DIR, "task-1");
    await mkdir(task1Dir);
    await writeFile(
      join(task1Dir, "final.json"),
      JSON.stringify({ costUsd: 5.5, completedAt: thisMonth }),
    );

    // Task 2: completed this month with cost
    const task2Dir = join(TASKS_DIR, "task-2");
    await mkdir(task2Dir);
    await writeFile(
      join(task2Dir, "final.json"),
      JSON.stringify({ costUsd: 12.25, completedAt: thisMonth }),
    );

    const spend = await getMonthlySpend(TASKS_DIR);
    expect(spend).toBe(17.75);
  });

  it("excludes tasks completed in previous months", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).getTime();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime();

    // Task from this month
    const task1Dir = join(TASKS_DIR, "task-1");
    await mkdir(task1Dir);
    await writeFile(
      join(task1Dir, "final.json"),
      JSON.stringify({ costUsd: 10.0, completedAt: thisMonth }),
    );

    // Task from last month (should be excluded)
    const task2Dir = join(TASKS_DIR, "task-2");
    await mkdir(task2Dir);
    await writeFile(
      join(task2Dir, "final.json"),
      JSON.stringify({ costUsd: 50.0, completedAt: lastMonth }),
    );

    const spend = await getMonthlySpend(TASKS_DIR);
    expect(spend).toBe(10.0);
  });

  it("excludes tasks without costUsd", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).getTime();

    // Task with cost
    const task1Dir = join(TASKS_DIR, "task-1");
    await mkdir(task1Dir);
    await writeFile(
      join(task1Dir, "final.json"),
      JSON.stringify({ costUsd: 7.0, completedAt: thisMonth }),
    );

    // Task without costUsd (should be excluded)
    const task2Dir = join(TASKS_DIR, "task-2");
    await mkdir(task2Dir);
    await writeFile(
      join(task2Dir, "final.json"),
      JSON.stringify({ completedAt: thisMonth, status: "completed" }),
    );

    const spend = await getMonthlySpend(TASKS_DIR);
    expect(spend).toBe(7.0);
  });

  it("excludes tasks without completedAt timestamp", async () => {
    // Task with cost but no completedAt (should be excluded)
    const taskDir = join(TASKS_DIR, "task-1");
    await mkdir(taskDir);
    await writeFile(
      join(taskDir, "final.json"),
      JSON.stringify({ costUsd: 15.0, status: "running" }),
    );

    const spend = await getMonthlySpend(TASKS_DIR);
    expect(spend).toBe(0);
  });

  it("handles malformed or missing final.json files gracefully", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).getTime();

    // Valid task
    const task1Dir = join(TASKS_DIR, "task-1");
    await mkdir(task1Dir);
    await writeFile(
      join(task1Dir, "final.json"),
      JSON.stringify({ costUsd: 8.0, completedAt: thisMonth }),
    );

    // Task directory with no final.json
    const task2Dir = join(TASKS_DIR, "task-2");
    await mkdir(task2Dir);

    // Task with malformed JSON
    const task3Dir = join(TASKS_DIR, "task-3");
    await mkdir(task3Dir);
    await writeFile(join(task3Dir, "final.json"), "{ invalid json");

    const spend = await getMonthlySpend(TASKS_DIR);
    expect(spend).toBe(8.0);
  });

  it("accumulates multiple task costs correctly", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).getTime();

    const costs = [1.11, 2.22, 3.33, 4.44, 5.55];
    for (let i = 0; i < costs.length; i++) {
      const taskDir = join(TASKS_DIR, `task-${i}`);
      await mkdir(taskDir);
      await writeFile(
        join(taskDir, "final.json"),
        JSON.stringify({ costUsd: costs[i], completedAt: thisMonth }),
      );
    }

    const spend = await getMonthlySpend(TASKS_DIR);
    const expected = costs.reduce((sum, c) => sum + c, 0);
    expect(spend).toBeCloseTo(expected, 10);
  });
});
