import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Stub browser globals BEFORE the component import.
// tasks-view imports tasks-client.js (localStorage singleton) and router.js
// (window.addEventListener at module level).
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { origin: "http://localhost:3000", hash: "" },
  };
  (globalThis as any).fetch = () => Promise.resolve({ ok: true, json: async () => ({}) });
});

import { TasksView } from "./tasks-view.js";

// ---------------------------------------------------------------------------
// Test TasksView pure logic without triggering Lit's DOM lifecycle.
// We use Object.create to get prototype methods without calling constructor.
// Object.defineProperty bypasses Lit's @state() reactive setters.
// ---------------------------------------------------------------------------

/** Set an own data property that shadows the Lit @state() prototype accessor. */
function def(obj: any, key: string, value: any) {
  Object.defineProperty(obj, key, { value, writable: true, configurable: true });
}

function create(): TasksView {
  const el = Object.create(TasksView.prototype) as TasksView;
  def(el, "_loading", false);
  def(el, "_tasks", []);
  def(el, "_expandedIds", new Set<string>());
  def(el, "_pollTimer", null);
  return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TasksView", () => {
  describe("expand/collapse", () => {
    it("_toggleExpand adds task id to expanded set", () => {
      const el = create();
      (el as any)._toggleExpand("task-1");
      expect((el as any)._expandedIds.has("task-1")).toBe(true);
    });

    it("_toggleExpand removes task id if already expanded", () => {
      const el = create();
      (el as any)._toggleExpand("task-1");
      (el as any)._toggleExpand("task-1");
      expect((el as any)._expandedIds.has("task-1")).toBe(false);
    });

    it("handles multiple expanded ids", () => {
      const el = create();
      (el as any)._toggleExpand("task-1");
      (el as any)._toggleExpand("task-2");
      expect((el as any)._expandedIds.has("task-1")).toBe(true);
      expect((el as any)._expandedIds.has("task-2")).toBe(true);
    });
  });

  describe("_calcProgress", () => {
    it("returns 100 for completed task with no subtasks", () => {
      const el = create();
      expect((el as any)._calcProgress({ status: "completed", subTasks: [] })).toBe(100);
    });

    it("returns 50 for running task with no subtasks", () => {
      const el = create();
      expect((el as any)._calcProgress({ status: "running", subTasks: [] })).toBe(50);
    });

    it("returns 0 for pending task with no subtasks", () => {
      const el = create();
      expect((el as any)._calcProgress({ status: "pending", subTasks: [] })).toBe(0);
    });

    it("calculates progress based on completed/failed subtasks", () => {
      const el = create();
      expect(
        (el as any)._calcProgress({
          status: "running",
          subTasks: [
            { id: "1", label: "A", status: "completed" },
            { id: "2", label: "B", status: "running" },
            { id: "3", label: "C", status: "failed" },
            { id: "4", label: "D", status: "pending" },
          ],
        }),
      ).toBe(50); // 2 done out of 4
    });

    it("returns 100 when all subtasks are done", () => {
      const el = create();
      expect(
        (el as any)._calcProgress({
          status: "completed",
          subTasks: [
            { id: "1", label: "A", status: "completed" },
            { id: "2", label: "B", status: "completed" },
          ],
        }),
      ).toBe(100);
    });
  });

  describe("_formatTimeAgo", () => {
    it("returns 'just now' for recent timestamps", () => {
      const el = create();
      expect((el as any)._formatTimeAgo(Date.now())).toBe("just now");
    });

    it("returns minutes for sub-hour timestamps", () => {
      const el = create();
      expect((el as any)._formatTimeAgo(Date.now() - 10 * 60 * 1000)).toBe("10m ago");
    });

    it("returns hours for sub-day timestamps", () => {
      const el = create();
      expect((el as any)._formatTimeAgo(Date.now() - 5 * 60 * 60 * 1000)).toBe("5h ago");
    });

    it("returns days for older timestamps", () => {
      const el = create();
      expect((el as any)._formatTimeAgo(Date.now() - 3 * 24 * 60 * 60 * 1000)).toBe("3d ago");
    });
  });

  describe("statusIcon (standalone)", () => {
    it("returns check mark for completed", async () => {
      const { statusIcon, checkCircle } = await import("../styles/icons.js");
      expect(statusIcon("completed")).toBe(checkCircle);
    });

    it("returns yellow circle for running", async () => {
      const { statusIcon, alertCircle } = await import("../styles/icons.js");
      expect(statusIcon("running")).toBe(alertCircle);
    });

    it("returns X for failed", async () => {
      const { statusIcon, xCircle } = await import("../styles/icons.js");
      expect(statusIcon("failed")).toBe(xCircle);
    });

    it("returns stop for cancelled", async () => {
      const { statusIcon, minusCircle } = await import("../styles/icons.js");
      expect(statusIcon("cancelled")).toBe(minusCircle);
    });

    it("returns default circle for unknown", async () => {
      const { statusIcon, circle } = await import("../styles/icons.js");
      expect(statusIcon("unknown")).toBe(circle);
    });
  });
});
