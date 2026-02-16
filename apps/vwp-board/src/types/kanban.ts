/**
 * Shared Kanban board types.
 *
 * Domain types (TaskStatus, TaskDecomposition, TeamSpec, CostEstimate,
 * SubtaskResult) come from the dispatch extension at
 * extensions/vwp-dispatch/types.ts. We re-declare the subset needed here
 * to avoid a direct workspace dependency on extensions/.
 */

// -- Re-declared dispatch types (source of truth: extensions/vwp-dispatch/types.ts) --

export type TaskStatus =
  | "queued"
  | "analyzing"
  | "confirming"
  | "dispatching"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskDecomposition {
  subtasks: Array<{ description: string; domain: string }>;
  domains: string[];
  estimatedComplexity: "low" | "medium" | "high";
}

export interface CostEstimate {
  estimatedTokens: number;
  estimatedCostUsd: number;
  breakdown: {
    analysis: number;
    perAgent: number;
    synthesis: number;
  };
}

export interface TeamSpec {
  leadPrompt: string;
  specialists: Array<{
    role: string;
    skillPlugin: string;
    skillName: string;
    contextKeys: string[];
  }>;
  estimatedCost: CostEstimate;
}

// -- Kanban-specific types --

export type KanbanColumnId =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "done";

export interface KanbanTask {
  id: string;
  text: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  column: KanbanColumnId;
  position: number;
  priority: "low" | "medium" | "high" | "urgent";
  decomposition: TaskDecomposition | null;
  subtasks: KanbanSubtask[];
  status: TaskStatus;
  teamSpec: TeamSpec | null;
  costEstimate: CostEstimate | null;
  actualCost: { tokens: number; usd: number } | null;
  result: string | null;
  error: string | null;
  domain: string;
  tags: string[];
}

export interface KanbanSubtask {
  id: string;
  taskId: string;
  description: string;
  domain: string;
  skillPlugin: string;
  skillName: string;
  status: "pending" | "running" | "completed" | "failed";
  assignedAgent: string | null;
  result: string | null;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
  position: number;
}

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

export interface BoardState {
  columns: Record<KanbanColumnId, KanbanTask[]>;
  loading: boolean;
  error: string | null;
}

export const COLUMN_CONFIG: Record<
  KanbanColumnId,
  { label: string; color: string }
> = {
  backlog: { label: "Backlog", color: "var(--color-text-muted)" },
  todo: { label: "To Do", color: "var(--color-info)" },
  in_progress: { label: "In Progress", color: "var(--color-warning)" },
  review: { label: "Review", color: "var(--color-accent)" },
  done: { label: "Done", color: "var(--color-success)" },
};
