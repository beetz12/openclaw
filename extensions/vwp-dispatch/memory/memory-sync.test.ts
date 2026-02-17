import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MemoryClient, TaskOutcome, LearnedPattern } from "./notebooklm-client.js";

// Mock homedir so we write to a temp directory
const FIXTURE_DIR = join(import.meta.dirname!, ".test-memory-sync-fixtures");
const TASKS_DIR = join(FIXTURE_DIR, ".openclaw", "vwp", "tasks");

vi.mock("node:os", () => ({
  homedir: () => FIXTURE_DIR,
}));

const { MemorySync } = await import("./memory-sync.ts");

function createMockClient(overrides?: Partial<MemoryClient>): MemoryClient {
  return {
    storeTaskOutcome: vi.fn().mockResolvedValue(undefined),
    querySimilarTasks: vi.fn().mockResolvedValue([]),
    queryDomainKnowledge: vi.fn().mockResolvedValue(""),
    storeProfile: vi.fn().mockResolvedValue(undefined),
    storePattern: vi.fn().mockResolvedValue(undefined),
    isAvailable: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

async function writeTaskFixture(taskId: string): Promise<void> {
  const dir = join(TASKS_DIR, taskId);
  await mkdir(dir, { recursive: true });

  await writeFile(
    join(dir, "request.json"),
    JSON.stringify({ id: taskId, text: "Write a blog post", createdAt: Date.now() - 30000 }),
  );
  await writeFile(
    join(dir, "decomposition.json"),
    JSON.stringify({
      subtasks: [
        { description: "Research topic", domain: "marketing" },
        { description: "Draft content", domain: "marketing" },
      ],
      domains: ["marketing"],
      estimatedComplexity: "low",
    }),
  );
  await writeFile(
    join(dir, "final.json"),
    JSON.stringify({
      taskId,
      status: "completed",
      subtasks: [
        { id: "s1", skillPlugin: "p", skillName: "s", status: "completed", result: "done" },
        { id: "s2", skillPlugin: "p", skillName: "s", status: "completed", result: "done" },
      ],
      costTokens: 5000,
      costUsd: 0.05,
    }),
  );
}

describe("MemorySync", () => {
  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
  });

  describe("syncTaskCompletion", () => {
    it("syncs a completed task and writes marker file", async () => {
      await writeTaskFixture("task-sync-1");

      const client = createMockClient();
      const sync = new MemorySync(client);

      await sync.syncTaskCompletion("task-sync-1");

      // Should have called storeTaskOutcome
      expect(client.storeTaskOutcome).toHaveBeenCalledOnce();
      const outcome = (client.storeTaskOutcome as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TaskOutcome;
      expect(outcome.taskId).toBe("task-sync-1");
      expect(outcome.goal).toBe("Write a blog post");
      expect(outcome.success).toBe(true);
      expect(outcome.subtasks).toHaveLength(2);

      // Should have written sync marker
      const marker = JSON.parse(
        await readFile(join(TASKS_DIR, "task-sync-1", "synced-to-memory.json"), "utf-8"),
      );
      expect(marker.syncedAt).toBeGreaterThan(0);
    });

    it("skips already-synced tasks", async () => {
      await writeTaskFixture("task-sync-2");
      // Write marker
      await writeFile(
        join(TASKS_DIR, "task-sync-2", "synced-to-memory.json"),
        JSON.stringify({ syncedAt: Date.now() }),
      );

      const client = createMockClient();
      const sync = new MemorySync(client);

      await sync.syncTaskCompletion("task-sync-2");

      expect(client.storeTaskOutcome).not.toHaveBeenCalled();
    });

    it("skips when MCP is unavailable", async () => {
      await writeTaskFixture("task-sync-3");

      const client = createMockClient({
        isAvailable: vi.fn().mockResolvedValue(false),
      });
      const sync = new MemorySync(client);

      await sync.syncTaskCompletion("task-sync-3");

      expect(client.storeTaskOutcome).not.toHaveBeenCalled();
    });

    it("skips when checkpoint data is missing", async () => {
      // Create task dir but no files
      await mkdir(join(TASKS_DIR, "task-sync-4"), { recursive: true });

      const client = createMockClient();
      const sync = new MemorySync(client);

      await sync.syncTaskCompletion("task-sync-4");

      expect(client.storeTaskOutcome).not.toHaveBeenCalled();
    });

    it("does not throw on errors", async () => {
      await writeTaskFixture("task-sync-5");

      const client = createMockClient({
        storeTaskOutcome: vi.fn().mockRejectedValue(new Error("store failed")),
      });
      const sync = new MemorySync(client);

      // Should not throw
      await expect(sync.syncTaskCompletion("task-sync-5")).resolves.toBeUndefined();
    });
  });

  describe("syncProfile", () => {
    it("calls storeProfile on the client", async () => {
      const client = createMockClient();
      const sync = new MemorySync(client);

      const profile = { businessName: "TestCo", industry: "retail" };
      await sync.syncProfile(profile);

      expect(client.storeProfile).toHaveBeenCalledWith(profile);
    });

    it("skips when MCP is unavailable", async () => {
      const client = createMockClient({
        isAvailable: vi.fn().mockResolvedValue(false),
      });
      const sync = new MemorySync(client);

      await sync.syncProfile({ businessName: "TestCo" });

      expect(client.storeProfile).not.toHaveBeenCalled();
    });
  });

  describe("syncPatterns", () => {
    it("stores each pattern via the client", async () => {
      const client = createMockClient();
      const sync = new MemorySync(client);

      const patterns: LearnedPattern[] = [
        { category: "user_preference", description: "Likes short emails", confidence: 0.9 },
        { category: "skill_performance", description: "Marketing agent is fast", confidence: 0.7 },
      ];

      await sync.syncPatterns(patterns);

      expect(client.storePattern).toHaveBeenCalledTimes(2);
    });

    it("skips empty pattern array", async () => {
      const client = createMockClient();
      const sync = new MemorySync(client);

      await sync.syncPatterns([]);

      expect(client.isAvailable).not.toHaveBeenCalled();
      expect(client.storePattern).not.toHaveBeenCalled();
    });

    it("does not throw on errors", async () => {
      const client = createMockClient({
        storePattern: vi.fn().mockRejectedValue(new Error("fail")),
      });
      const sync = new MemorySync(client);

      await expect(
        sync.syncPatterns([{ category: "test", description: "test", confidence: 1 }]),
      ).resolves.toBeUndefined();
    });
  });
});
