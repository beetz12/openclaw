import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentStateManager } from "./agent-state.js";

describe("AgentStateManager", () => {
  let mgr: AgentStateManager;

  beforeEach(() => {
    mgr = new AgentStateManager();
  });

  describe("upsertAgent", () => {
    it("adds new agent with all fields populated", () => {
      const result = mgr.upsertAgent({
        id: "agent-1",
        name: "researcher",
        status: "active",
        taskId: "task-42",
        subtaskId: "sub-1",
        lastAction: "reading file",
        error: null,
      });

      expect(result).toMatchObject({
        id: "agent-1",
        name: "researcher",
        status: "active",
        taskId: "task-42",
        subtaskId: "sub-1",
        lastAction: "reading file",
        error: null,
      });
      expect(result.lastSeen).toBeGreaterThan(0);
    });

    it("updates existing agent, preserves unspecified fields", () => {
      mgr.upsertAgent({
        id: "agent-1",
        name: "researcher",
        status: "active",
        taskId: "task-42",
        subtaskId: "sub-1",
        lastAction: "reading file",
        error: null,
      });

      const updated = mgr.upsertAgent({
        id: "agent-1",
        status: "idle",
      });

      expect(updated.name).toBe("researcher");
      expect(updated.status).toBe("idle");
      expect(updated.taskId).toBe("task-42");
      expect(updated.subtaskId).toBe("sub-1");
      expect(updated.lastAction).toBe("reading file");
    });

    it("returns full AgentInfo with lastSeen > 0", () => {
      const now = Date.now();
      const result = mgr.upsertAgent({ id: "agent-1" });

      expect(result.lastSeen).toBeGreaterThanOrEqual(now);
      expect(result.id).toBe("agent-1");
      // New agent should get sensible defaults
      expect(result.name).toBe("");
      expect(result.status).toBe("idle");
      expect(result.taskId).toBeNull();
      expect(result.subtaskId).toBeNull();
      expect(result.lastAction).toBeNull();
      expect(result.error).toBeNull();
    });

    it("updates lastSeen on every upsert", () => {
      const first = mgr.upsertAgent({ id: "agent-1" });
      const firstSeen = first.lastSeen;

      // Advance time slightly
      vi.spyOn(Date, "now").mockReturnValue(firstSeen + 1000);

      const second = mgr.upsertAgent({ id: "agent-1", status: "active" });
      expect(second.lastSeen).toBeGreaterThan(firstSeen);

      vi.restoreAllMocks();
    });
  });

  describe("getAll", () => {
    it("returns empty array when no agents exist", () => {
      expect(mgr.getAll()).toEqual([]);
    });

    it("returns all tracked agents", () => {
      mgr.upsertAgent({ id: "a1", name: "agent-a" });
      mgr.upsertAgent({ id: "a2", name: "agent-b" });

      const all = mgr.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    });
  });

  describe("get", () => {
    it("returns agent by id", () => {
      mgr.upsertAgent({ id: "agent-1", name: "researcher" });
      const agent = mgr.get("agent-1");

      expect(agent).toBeDefined();
      expect(agent!.name).toBe("researcher");
    });

    it("returns undefined for nonexistent agent", () => {
      expect(mgr.get("nonexistent")).toBeUndefined();
    });
  });

  describe("getByTaskId", () => {
    it("returns agents for specific task only", () => {
      mgr.upsertAgent({ id: "a1", name: "agent-a", taskId: "task-1" });
      mgr.upsertAgent({ id: "a2", name: "agent-b", taskId: "task-1" });
      mgr.upsertAgent({ id: "a3", name: "agent-c", taskId: "task-2" });

      const result = mgr.getByTaskId("task-1");
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    });

    it("returns empty array when no agents match task", () => {
      mgr.upsertAgent({ id: "a1", taskId: "task-1" });
      expect(mgr.getByTaskId("task-999")).toEqual([]);
    });
  });

  describe("removeAgent", () => {
    it("removes agent by id, returns it", () => {
      mgr.upsertAgent({ id: "agent-1", name: "researcher" });
      const removed = mgr.removeAgent("agent-1");

      expect(removed).not.toBeNull();
      expect(removed!.id).toBe("agent-1");
      expect(removed!.name).toBe("researcher");
      expect(mgr.get("agent-1")).toBeUndefined();
    });

    it("returns null for nonexistent agent", () => {
      expect(mgr.removeAgent("nonexistent")).toBeNull();
    });

    it("also removes logs for the agent", () => {
      mgr.upsertAgent({ id: "agent-1" });
      mgr.addLog("agent-1", "did something");
      expect(mgr.getLogs("agent-1")).toHaveLength(1);

      mgr.removeAgent("agent-1");
      expect(mgr.getLogs("agent-1")).toEqual([]);
    });
  });

  describe("clearForTask", () => {
    it("removes all agents for a task, keeps others", () => {
      mgr.upsertAgent({ id: "a1", name: "agent-a", taskId: "task-1" });
      mgr.upsertAgent({ id: "a2", name: "agent-b", taskId: "task-1" });
      mgr.upsertAgent({ id: "a3", name: "agent-c", taskId: "task-2" });

      // Add logs for the agents being removed
      mgr.addLog("a1", "log for a1");
      mgr.addLog("a2", "log for a2");
      mgr.addLog("a3", "log for a3");

      mgr.clearForTask("task-1");

      expect(mgr.getAll()).toHaveLength(1);
      expect(mgr.getAll()[0]!.id).toBe("a3");

      // Logs for removed agents should also be cleared
      expect(mgr.getLogs("a1")).toEqual([]);
      expect(mgr.getLogs("a2")).toEqual([]);
      // Logs for kept agent should remain
      expect(mgr.getLogs("a3")).toHaveLength(1);
    });
  });

  describe("addLog", () => {
    it("stores log entries for agent", () => {
      mgr.upsertAgent({ id: "agent-1" });
      mgr.addLog("agent-1", "started work");
      mgr.addLog("agent-1", "finished work");

      const logs = mgr.getLogs("agent-1");
      expect(logs).toHaveLength(2);
      expect(logs[0]!.message).toBe("started work");
      expect(logs[0]!.timestamp).toBeGreaterThan(0);
      expect(logs[1]!.message).toBe("finished work");
    });

    it("caps at 100 entries, drops oldest", () => {
      mgr.upsertAgent({ id: "agent-1" });

      for (let i = 0; i < 110; i++) {
        mgr.addLog("agent-1", `message-${i}`);
      }

      const logs = mgr.getLogs("agent-1");
      expect(logs).toHaveLength(100);
      // Oldest 10 should have been dropped
      expect(logs[0]!.message).toBe("message-10");
      expect(logs[99]!.message).toBe("message-109");
    });

    it("is a no-op for nonexistent agent", () => {
      // Should not throw
      mgr.addLog("nonexistent", "some message");
      expect(mgr.getLogs("nonexistent")).toEqual([]);
    });
  });

  describe("getLogs", () => {
    it("returns empty array for nonexistent agent", () => {
      expect(mgr.getLogs("nonexistent")).toEqual([]);
    });

    it("returns empty array for agent with no logs", () => {
      mgr.upsertAgent({ id: "agent-1" });
      expect(mgr.getLogs("agent-1")).toEqual([]);
    });
  });
});
