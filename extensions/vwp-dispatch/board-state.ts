/**
 * Board state persistence — manages Kanban board layout on disk.
 *
 * State file: ~/.openclaw/vwp/board/state.json
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BoardState, KanbanColumnId } from "./kanban-types.js";
import { atomicWriteFile } from "./atomic-write.js";
import { KANBAN_COLUMNS } from "./kanban-types.js";

const BOARD_DIR = join(homedir(), ".openclaw", "vwp", "board");
const STATE_FILE = join(BOARD_DIR, "state.json");

function emptyBoard(): BoardState {
  return {
    columns: {
      backlog: [],
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    },
    positions: {},
    updatedAt: Date.now(),
  };
}

export async function loadBoard(): Promise<BoardState> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw) as BoardState;
  } catch {
    return emptyBoard();
  }
}

async function saveBoard(state: BoardState): Promise<void> {
  await atomicWriteFile(STATE_FILE, JSON.stringify(state, null, 2));
}

export async function initializeBoard(): Promise<BoardState> {
  const state = emptyBoard();
  await saveBoard(state);
  return state;
}

export async function moveTask(
  taskId: string,
  toColumn: KanbanColumnId,
  position?: number,
): Promise<{ from: KanbanColumnId | null; to: KanbanColumnId }> {
  const state = await loadBoard();

  // Remove from current column if present
  let fromColumn: KanbanColumnId | null = null;
  for (const col of KANBAN_COLUMNS) {
    const idx = state.columns[col].indexOf(taskId);
    if (idx !== -1) {
      fromColumn = col;
      state.columns[col].splice(idx, 1);
      break;
    }
  }

  // Insert into target column at the specified position (or end)
  const targetArr = state.columns[toColumn];
  const insertAt =
    position !== undefined ? Math.max(0, Math.min(position, targetArr.length)) : targetArr.length;
  targetArr.splice(insertAt, 0, taskId);

  // Rebuild positions for affected columns
  rebuildPositions(state, toColumn);
  if (fromColumn && fromColumn !== toColumn) {
    rebuildPositions(state, fromColumn);
  }

  state.updatedAt = Date.now();
  await saveBoard(state);
  return { from: fromColumn, to: toColumn };
}

export async function reorderTask(taskId: string, newPosition: number): Promise<boolean> {
  const state = await loadBoard();

  // Find which column the task is in
  let column: KanbanColumnId | null = null;
  for (const col of KANBAN_COLUMNS) {
    const idx = state.columns[col].indexOf(taskId);
    if (idx !== -1) {
      column = col;
      state.columns[col].splice(idx, 1);
      break;
    }
  }

  if (!column) return false;

  const arr = state.columns[column];
  const insertAt = Math.max(0, Math.min(newPosition, arr.length));
  arr.splice(insertAt, 0, taskId);

  rebuildPositions(state, column);
  state.updatedAt = Date.now();
  await saveBoard(state);
  return true;
}

export async function getBoard(): Promise<BoardState> {
  return loadBoard();
}

function rebuildPositions(state: BoardState, column: KanbanColumnId): void {
  const arr = state.columns[column];
  for (let i = 0; i < arr.length; i++) {
    state.positions[arr[i]] = { column, position: i };
  }
}
