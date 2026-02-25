import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock homedir so we write to a temp directory
const FIXTURE_DIR = join(import.meta.dirname!, ".test-fixtures", "checkpoint");
const TASKS_DIR = join(FIXTURE_DIR, ".openclaw", "vwp", "tasks");

vi.mock("node:os", () => ({
  homedir: () => FIXTURE_DIR,
}));

const {
  createTask,
  saveActivity,
  getActivity,
  saveAgentCheckpoint,
  getAgentCheckpoints,
  saveTaskMetadata,
  getTaskMetadata,
  getTaskStatus,
  saveAssignmentProfile,
} = await import("./checkpoint.ts");

describe("checkpoint — extended functions", () => {
  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
  });

  describe("saveActivity / getActivity", () => {
    it("saves and retrieves activity entries", async () => {
      await createTask("task-a1", { id: "task-a1", text: "test", createdAt: Date.now() });

      const entry1 = {
        id: "act-1",
        taskId: "task-a1",
        timestamp: Date.now(),
        type: "agent_action" as const,
        agentName: "marketing-agent",
        action: "started",
        detail: "Beginning research phase",
      };
      const entry2 = {
        id: "act-2",
        taskId: "task-a1",
        timestamp: Date.now() + 1000,
        type: "status_change" as const,
        action: "status_changed",
        detail: "running -> completed",
      };

      await saveActivity("task-a1", entry1);
      await saveActivity("task-a1", entry2);

      const entries = await getActivity("task-a1");
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe("act-1");
      expect(entries[0].agentName).toBe("marketing-agent");
      expect(entries[1].id).toBe("act-2");
      expect(entries[1].type).toBe("status_change");
    });

    it("returns empty array for non-existent task", async () => {
      const entries = await getActivity("nonexistent");
      expect(entries).toEqual([]);
    });

    it("appends to existing activity log", async () => {
      await createTask("task-a2", { id: "task-a2", text: "test", createdAt: Date.now() });

      for (let i = 0; i < 5; i++) {
        await saveActivity("task-a2", {
          id: `act-${i}`,
          taskId: "task-a2",
          timestamp: Date.now() + i,
          type: "agent_action",
          action: `action-${i}`,
          detail: `Detail ${i}`,
        });
      }

      const entries = await getActivity("task-a2");
      expect(entries).toHaveLength(5);
      expect(entries[4].action).toBe("action-4");
    });
  });

  describe("saveAgentCheckpoint / getAgentCheckpoints", () => {
    it("saves and retrieves agent checkpoints", async () => {
      await createTask("task-c1", { id: "task-c1", text: "test", createdAt: Date.now() });

      await saveAgentCheckpoint("task-c1", "marketing", { step: 1, data: "researching" });
      await saveAgentCheckpoint("task-c1", "marketing", { step: 2, data: "drafting" });
      await saveAgentCheckpoint("task-c1", "finance", { step: 1, data: "calculating" });

      const checkpoints = await getAgentCheckpoints("task-c1");

      expect(checkpoints["marketing"]).toHaveLength(2);
      expect(checkpoints["marketing"][0]).toEqual({ step: 1, data: "researching" });
      expect(checkpoints["marketing"][1]).toEqual({ step: 2, data: "drafting" });
      expect(checkpoints["finance"]).toHaveLength(1);
      expect(checkpoints["finance"][0]).toEqual({ step: 1, data: "calculating" });
    });

    it("returns empty object for task with no checkpoints", async () => {
      const checkpoints = await getAgentCheckpoints("nonexistent");
      expect(checkpoints).toEqual({});
    });

    it("creates sequentially numbered files", async () => {
      await createTask("task-c2", { id: "task-c2", text: "test", createdAt: Date.now() });

      await saveAgentCheckpoint("task-c2", "agent-x", { n: 0 });
      await saveAgentCheckpoint("task-c2", "agent-x", { n: 1 });
      await saveAgentCheckpoint("task-c2", "agent-x", { n: 2 });

      // Verify files exist with correct naming
      const cpDir = join(TASKS_DIR, "task-c2", "checkpoints");
      const f0 = JSON.parse(await readFile(join(cpDir, "agent-x-0.json"), "utf-8"));
      const f1 = JSON.parse(await readFile(join(cpDir, "agent-x-1.json"), "utf-8"));
      const f2 = JSON.parse(await readFile(join(cpDir, "agent-x-2.json"), "utf-8"));

      expect(f0.n).toBe(0);
      expect(f1.n).toBe(1);
      expect(f2.n).toBe(2);
    });
  });

  describe("assignment profile", () => {
    it("creates default assignment profile on task creation", async () => {
      await createTask("task-as1", { id: "task-as1", text: "test", createdAt: Date.now() });
      const status = await getTaskStatus("task-as1");
      expect(status.assignment).toEqual({
        assignedAgentId: null,
        assignedRole: null,
        requiredSkills: [],
        assignmentMode: "auto",
        assignmentReason: null,
        executorAgentId: null,
        executionProfile: null,
      });
    });

    it("merges partial assignment updates without dropping prior fields", async () => {
      await createTask("task-as2", { id: "task-as2", text: "test", createdAt: Date.now() });

      await saveAssignmentProfile("task-as2", {
        assignedAgentId: "marketing-1",
        assignedRole: "Marketing",
        requiredSkills: ["copywriting", "linkedin"],
        assignmentMode: "manual-lock",
      });

      await saveAssignmentProfile("task-as2", {
        assignmentReason: "Best role/skill match",
        executorAgentId: "marketing-1",
      });

      const status = await getTaskStatus("task-as2");
      expect(status.assignment).toEqual({
        assignedAgentId: "marketing-1",
        assignedRole: "Marketing",
        requiredSkills: ["copywriting", "linkedin"],
        assignmentMode: "manual-lock",
        assignmentReason: "Best role/skill match",
        executorAgentId: "marketing-1",
        executionProfile: null,
      });
    });
  });

  describe("saveTaskMetadata / getTaskMetadata", () => {
    it("saves and retrieves metadata", async () => {
      await createTask("task-m1", { id: "task-m1", text: "test", createdAt: Date.now() });

      const metadata = {
        column: "in_progress",
        priority: "high",
        tags: ["urgent", "marketing"],
        assignee: "user-123",
      };

      await saveTaskMetadata("task-m1", metadata);

      const result = await getTaskMetadata("task-m1");
      expect(result).toEqual(metadata);
    });

    it("returns null for non-existent task", async () => {
      const result = await getTaskMetadata("nonexistent");
      expect(result).toBeNull();
    });

    it("overwrites existing metadata", async () => {
      await createTask("task-m2", { id: "task-m2", text: "test", createdAt: Date.now() });

      await saveTaskMetadata("task-m2", { column: "backlog", priority: "low" });
      await saveTaskMetadata("task-m2", { column: "in_progress", priority: "high" });

      const result = await getTaskMetadata("task-m2");
      expect(result).toEqual({ column: "in_progress", priority: "high" });
    });
  });
});
