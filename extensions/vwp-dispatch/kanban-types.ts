/** Kanban-specific types for the vwp-dispatch extension. */

export type KanbanColumnId = "backlog" | "todo" | "in_progress" | "review" | "done";

export const KANBAN_COLUMNS: readonly KanbanColumnId[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
] as const;

export interface BoardState {
  columns: Record<KanbanColumnId, string[]>;
  positions: Record<string, { column: KanbanColumnId; position: number }>;
  updatedAt: number;
}

export interface ActivityEntry {
  id: string;
  taskId: string;
  timestamp: number;
  type: "agent_action" | "status_change" | "subtask_update" | "approval_gate";
  agentName?: string;
  action: string;
  detail: string;
}

export type KanbanSSEEvent =
  | { type: "task_column_changed"; taskId: string; from: KanbanColumnId; to: KanbanColumnId }
  | { type: "subtask_started"; taskId: string; subtaskId: string; agentName: string }
  | { type: "subtask_completed"; taskId: string; subtaskId: string; result: string }
  | { type: "subtask_failed"; taskId: string; subtaskId: string; error: string }
  | { type: "agent_action"; taskId: string; agentName: string; action: string; detail: string }
  | { type: "cost_update"; taskId: string; currentTokens: number; currentUsd: number }
  | { type: "approval_required"; taskId: string; subtaskId: string; actionType: string }
  | AgentSSEEvent
  | ToolSSEEvent;

// --- Agent status types (Phase 5A: Mission Control) ---

export type AgentStatus = "active" | "idle" | "error";

export interface AgentInfo {
  id: string;
  name: string;
  status: AgentStatus;
  taskId: string | null;
  subtaskId: string | null;
  lastAction: string | null;
  lastSeen: number;
  error: string | null;
}

export type AgentSSEEvent =
  | { type: "agent_status_changed"; agent: AgentInfo }
  | { type: "agent_connected"; agent: AgentInfo }
  | { type: "agent_disconnected"; agentId: string }
  | { type: "agent_log"; agentId: string; taskId: string; message: string; timestamp: number }
  | { type: "gateway_status"; connected: boolean };

// --- Tool run types (Workspace Tools Integration) ---

export type ToolRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ToolRunInfo {
  runId: string;
  toolName: string;
  toolLabel: string;
  args: Record<string, string>;
  status: ToolRunStatus;
  startedAt: number;
  completedAt: number | null;
  exitCode: number | null;
  error: string | null;
}

export type ToolSSEEvent =
  | { type: "tool_run_started"; run: ToolRunInfo }
  | { type: "tool_run_output"; runId: string; stream: "stdout" | "stderr"; chunk: string }
  | {
      type: "tool_run_completed";
      runId: string;
      toolName: string;
      exitCode: number;
      durationMs: number;
    }
  | { type: "tool_run_failed"; runId: string; toolName: string; error: string }
  | { type: "tool_run_cancelled"; runId: string; toolName: string };
