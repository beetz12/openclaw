import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock homedir so we write to a temp directory instead of real ~/.openclaw
const FIXTURE_DIR = join(import.meta.dirname!, ".test-board-fixtures");
const BOARD_DIR = join(FIXTURE_DIR, ".openclaw", "vwp", "board");

vi.mock("node:os", () => ({
  homedir: () => FIXTURE_DIR,
}));

// Import after mock is set up
const { loadBoard, initializeBoard, moveTask, reorderTask, getBoard } =
  await import("./board-state.ts");

describe("board-state", () => {
  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
  });

  describe("initializeBoard", () => {
    it("creates an empty board state file", async () => {
      const board = await initializeBoard();

      expect(board.columns.backlog).toEqual([]);
      expect(board.columns.todo).toEqual([]);
      expect(board.columns.in_progress).toEqual([]);
      expect(board.columns.review).toEqual([]);
      expect(board.columns.done).toEqual([]);
      expect(board.positions).toEqual({});
      expect(board.updatedAt).toBeGreaterThan(0);

      // Verify file was written
      const raw = await readFile(join(BOARD_DIR, "state.json"), "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.columns.backlog).toEqual([]);
    });
  });

  describe("loadBoard", () => {
    it("returns empty board when no file exists", async () => {
      const board = await loadBoard();
      expect(board.columns.backlog).toEqual([]);
      expect(board.positions).toEqual({});
    });

    it("loads existing board state", async () => {
      await initializeBoard();
      await moveTask("task-1", "backlog");
      const board = await loadBoard();
      expect(board.columns.backlog).toContain("task-1");
    });
  });

  describe("moveTask", () => {
    it("adds a new task to a column", async () => {
      await initializeBoard();
      const result = await moveTask("task-1", "backlog");

      expect(result.from).toBeNull();
      expect(result.to).toBe("backlog");

      const board = await loadBoard();
      expect(board.columns.backlog).toEqual(["task-1"]);
      expect(board.positions["task-1"]).toEqual({ column: "backlog", position: 0 });
    });

    it("moves a task between columns", async () => {
      await initializeBoard();
      await moveTask("task-1", "backlog");
      const result = await moveTask("task-1", "in_progress");

      expect(result.from).toBe("backlog");
      expect(result.to).toBe("in_progress");

      const board = await loadBoard();
      expect(board.columns.backlog).toEqual([]);
      expect(board.columns.in_progress).toEqual(["task-1"]);
      expect(board.positions["task-1"]).toEqual({ column: "in_progress", position: 0 });
    });

    it("inserts at a specific position", async () => {
      await initializeBoard();
      await moveTask("task-1", "backlog");
      await moveTask("task-2", "backlog");
      await moveTask("task-3", "backlog", 1); // Insert between 1 and 2

      const board = await loadBoard();
      expect(board.columns.backlog).toEqual(["task-1", "task-3", "task-2"]);
    });

    it("clamps position to bounds", async () => {
      await initializeBoard();
      await moveTask("task-1", "backlog");
      await moveTask("task-2", "backlog", 100); // Clamped to end

      const board = await loadBoard();
      expect(board.columns.backlog).toEqual(["task-1", "task-2"]);
    });
  });

  describe("reorderTask", () => {
    it("reorders a task within its column", async () => {
      await initializeBoard();
      await moveTask("task-1", "todo");
      await moveTask("task-2", "todo");
      await moveTask("task-3", "todo");

      const moved = await reorderTask("task-3", 0);
      expect(moved).toBe(true);

      const board = await loadBoard();
      expect(board.columns.todo).toEqual(["task-3", "task-1", "task-2"]);
      expect(board.positions["task-3"]).toEqual({ column: "todo", position: 0 });
      expect(board.positions["task-1"]).toEqual({ column: "todo", position: 1 });
    });

    it("returns false for task not on board", async () => {
      await initializeBoard();
      const moved = await reorderTask("nonexistent", 0);
      expect(moved).toBe(false);
    });
  });

  describe("getBoard", () => {
    it("returns the current board state", async () => {
      await initializeBoard();
      await moveTask("task-1", "backlog");
      await moveTask("task-2", "in_progress");

      const board = await getBoard();
      expect(board.columns.backlog).toEqual(["task-1"]);
      expect(board.columns.in_progress).toEqual(["task-2"]);
    });
  });
});
