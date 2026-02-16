"use client";

import { create } from "zustand";
import type {
  KanbanColumnId,
  KanbanTask,
  BoardState,
  AgentInfo,
} from "@/types/kanban";
import { kanbanApi } from "@/lib/api-client";

/** SSE event types that the store handles. */
export type KanbanSSEEvent =
  | {
      type: "task_column_changed";
      taskId: string;
      from: KanbanColumnId;
      to: KanbanColumnId;
    }
  | { type: "subtask_started"; taskId: string; subtaskId: string; agentName: string }
  | { type: "subtask_completed"; taskId: string; subtaskId: string; result: string }
  | { type: "subtask_failed"; taskId: string; subtaskId: string; error: string }
  | {
      type: "agent_action";
      taskId: string;
      agentName: string;
      action: string;
      detail: string;
    }
  | { type: "cost_update"; taskId: string; currentTokens: number; currentUsd: number }
  | {
      type: "approval_required";
      taskId: string;
      subtaskId: string;
      actionType: string;
    }
  | { type: "agent_status_changed"; agent: AgentInfo }
  | { type: "agent_connected"; agent: AgentInfo }
  | { type: "agent_disconnected"; agentId: string }
  | { type: "agent_log"; agentId: string; taskId: string; message: string; timestamp: number }
  | { type: "gateway_status"; connected: boolean };

const EMPTY_COLUMNS: Record<KanbanColumnId, KanbanTask[]> = {
  backlog: [],
  todo: [],
  in_progress: [],
  review: [],
  done: [],
};

export interface BoardStore {
  // State
  columns: Record<KanbanColumnId, KanbanTask[]>;
  loading: boolean;
  error: string | null;
  sseConnected: boolean;
  sseStale: boolean;

  // Actions
  fetchBoard: () => Promise<void>;
  moveTask: (
    taskId: string,
    toColumn: KanbanColumnId,
    position: number,
  ) => Promise<void>;
  reorderTask: (taskId: string, newPosition: number) => Promise<void>;
  submitGoal: (text: string) => Promise<string>;
  confirmTask: (taskId: string) => Promise<void>;

  // SSE
  setSseConnected: (connected: boolean) => void;
  setSseStale: (stale: boolean) => void;
  handleSSEEvent: (event: KanbanSSEEvent) => void;
}

function findTask(
  columns: Record<KanbanColumnId, KanbanTask[]>,
  taskId: string,
): { column: KanbanColumnId; index: number; task: KanbanTask } | null {
  const colIds: KanbanColumnId[] = [
    "backlog",
    "todo",
    "in_progress",
    "review",
    "done",
  ];
  for (const col of colIds) {
    const idx = columns[col].findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      return { column: col, index: idx, task: columns[col][idx] };
    }
  }
  return null;
}

function cloneColumns(
  columns: Record<KanbanColumnId, KanbanTask[]>,
): Record<KanbanColumnId, KanbanTask[]> {
  return {
    backlog: [...columns.backlog],
    todo: [...columns.todo],
    in_progress: [...columns.in_progress],
    review: [...columns.review],
    done: [...columns.done],
  };
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  columns: EMPTY_COLUMNS,
  loading: false,
  error: null,
  sseConnected: false,
  sseStale: false,

  fetchBoard: async () => {
    set({ loading: true, error: null });
    try {
      const board: BoardState = await kanbanApi.getBoard();
      set({ columns: board.columns, loading: false });
    } catch (err) {
      const msg =
        err && typeof err === "object" && "error" in err
          ? (err as { error: string }).error
          : "Failed to load board";
      set({ error: msg, loading: false });
    }
  },

  moveTask: async (taskId, toColumn, position) => {
    const { columns } = get();
    const found = findTask(columns, taskId);
    if (!found) {return;}

    // Optimistic update
    const next = cloneColumns(columns);
    next[found.column].splice(found.index, 1);
    const insertAt = Math.max(0, Math.min(position, next[toColumn].length));
    const movedTask = { ...found.task, column: toColumn, position: insertAt };
    next[toColumn].splice(insertAt, 0, movedTask);
    set({ columns: next });

    try {
      await kanbanApi.moveToColumn(taskId, toColumn);
      if (position !== 0) {
        await kanbanApi.reorder(taskId, position);
      }
    } catch {
      // Revert on failure
      set({ columns });
    }
  },

  reorderTask: async (taskId, newPosition) => {
    const { columns } = get();
    const found = findTask(columns, taskId);
    if (!found) {return;}

    // Optimistic update
    const next = cloneColumns(columns);
    next[found.column].splice(found.index, 1);
    const insertAt = Math.max(
      0,
      Math.min(newPosition, next[found.column].length),
    );
    next[found.column].splice(insertAt, 0, {
      ...found.task,
      position: insertAt,
    });
    set({ columns: next });

    try {
      await kanbanApi.reorder(taskId, newPosition);
    } catch {
      set({ columns });
    }
  },

  submitGoal: async (text) => {
    const result = await kanbanApi.submitGoal(text);
    // After submitting, refresh the board to pick up the new task
    get().fetchBoard();
    return result.id;
  },

  confirmTask: async (taskId) => {
    await kanbanApi.confirmExecution(taskId);
    // Refresh to get updated status
    get().fetchBoard();
  },

  setSseConnected: (connected) => set({ sseConnected: connected }),
  setSseStale: (stale) => set({ sseStale: stale }),

  handleSSEEvent: (event) => {
    const { columns } = get();

    switch (event.type) {
      case "task_column_changed": {
        const found = findTask(columns, event.taskId);
        if (!found) {
          // Task not on board yet -- refresh
          get().fetchBoard();
          return;
        }
        if (found.column === event.to) {return;} // Already there

        const next = cloneColumns(columns);
        next[found.column].splice(found.index, 1);
        next[event.to].push({ ...found.task, column: event.to });
        set({ columns: next });
        break;
      }

      case "subtask_started": {
        const found = findTask(columns, event.taskId);
        if (!found) {return;}
        const next = cloneColumns(columns);
        const task = { ...found.task };
        task.subtasks = task.subtasks.map((st) =>
          st.id === event.subtaskId
            ? { ...st, status: "running" as const, assignedAgent: event.agentName }
            : st,
        );
        next[found.column][found.index] = task;
        set({ columns: next });
        break;
      }

      case "subtask_completed": {
        const found = findTask(columns, event.taskId);
        if (!found) {return;}
        const next = cloneColumns(columns);
        const task = { ...found.task };
        task.subtasks = task.subtasks.map((st) =>
          st.id === event.subtaskId
            ? { ...st, status: "completed" as const, result: event.result }
            : st,
        );
        next[found.column][found.index] = task;
        set({ columns: next });
        break;
      }

      case "subtask_failed": {
        const found = findTask(columns, event.taskId);
        if (!found) {return;}
        const next = cloneColumns(columns);
        const task = { ...found.task };
        task.subtasks = task.subtasks.map((st) =>
          st.id === event.subtaskId
            ? { ...st, status: "failed" as const, error: event.error }
            : st,
        );
        next[found.column][found.index] = task;
        set({ columns: next });
        break;
      }

      case "cost_update": {
        const found = findTask(columns, event.taskId);
        if (!found) {return;}
        const next = cloneColumns(columns);
        next[found.column][found.index] = {
          ...found.task,
          actualCost: {
            tokens: event.currentTokens,
            usd: event.currentUsd,
          },
        };
        set({ columns: next });
        break;
      }

      case "agent_action":
      case "approval_required":
        // These events are informational / handled by detail views.
        // A full refresh ensures we pick up any side-effects.
        break;
    }
  },
}));
