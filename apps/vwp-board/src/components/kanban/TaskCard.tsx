"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanTask } from "@/types/kanban";
import { useBoardStore } from "@/store/board-store";

export interface TaskCardProps {
  task: KanbanTask;
  onClick: () => void;
  isDragOverlay?: boolean;
}

const PRIORITY_STYLES: Record<KanbanTask["priority"], { bg: string; text: string; label: string }> = {
  low: { bg: "bg-slate-100", text: "text-slate-600", label: "Low" },
  medium: { bg: "bg-blue-100", text: "text-blue-700", label: "Med" },
  high: { bg: "bg-orange-100", text: "text-orange-700", label: "High" },
  urgent: { bg: "bg-rose-100", text: "text-rose-700", label: "Urgent" },
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-slate-400",
  analyzing: "bg-blue-400",
  confirming: "bg-amber-400",
  dispatching: "bg-violet-400",
  running: "bg-teal-500",
  completed: "bg-emerald-500",
  failed: "bg-rose-500",
  cancelled: "bg-slate-300",
};

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) {return "now";}
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {return `${minutes}m ago`;}
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {return `${hours}h ago`;}
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SubtaskProgress({ subtasks }: { subtasks: KanbanTask["subtasks"] }) {
  if (subtasks.length === 0) {return null;}
  const completed = subtasks.filter((s) => s.status === "completed").length;
  const ratio = completed / subtasks.length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
        {completed}/{subtasks.length}
      </span>
    </div>
  );
}

function AgentStatus({ subtasks }: { subtasks: KanbanTask["subtasks"] }) {
  const running = subtasks.filter((s) => s.status === "running" && s.assignedAgent).length;
  if (running > 0) {
    return (
      <span className="text-xs text-[var(--color-primary)] font-medium">
        {running} agent{running > 1 ? "s" : ""} running
      </span>
    );
  }
  const pending = subtasks.filter((s) => s.status === "pending").length;
  if (pending > 0) {
    return (
      <span className="text-xs text-[var(--color-text-muted)]">
        {pending} pending
      </span>
    );
  }
  return null;
}

export function TaskCard({ task, onClick, isDragOverlay }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const priority = PRIORITY_STYLES[task.priority];
  const statusColor = STATUS_COLORS[task.status] ?? "bg-slate-400";

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const agents = useBoardStore((s) => s.agents);
  const taskAgents = agents.filter((a) => a.taskId === task.id && a.status === "active");

  const costDisplay = task.actualCost
    ? `$${task.actualCost.usd.toFixed(2)}`
    : task.costEstimate
      ? `~$${task.costEstimate.estimatedCostUsd.toFixed(2)}`
      : null;

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? undefined : style}
      {...(isDragOverlay ? {} : attributes)}
      {...(isDragOverlay ? {} : listeners)}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      className={`
        group cursor-grab active:cursor-grabbing
        rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]
        p-3 select-none transition-shadow duration-150
        hover:shadow-[var(--shadow-md)]
        ${isDragging ? "shadow-[var(--shadow-lg)]" : "shadow-[var(--shadow-sm)]"}
        ${isDragOverlay ? "shadow-[var(--shadow-lg)] rotate-[2deg]" : ""}
      `}
    >
      {/* Header row: status dot + title */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusColor}`}
          title={task.status}
        />
        <p className="text-sm font-medium text-[var(--color-text)] line-clamp-2 leading-snug">
          {task.text}
        </p>
      </div>

      {/* Tags row: priority + domain */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priority.bg} ${priority.text}`}
        >
          {priority.label}
        </span>
        {task.domain && (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {task.domain}
          </span>
        )}
      </div>

      {/* Subtask progress */}
      {task.subtasks.length > 0 && (
        <div className="mt-2">
          <SubtaskProgress subtasks={task.subtasks} />
        </div>
      )}

      {/* Footer: cost + agent status + time */}
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-2">
          {costDisplay && (
            <span className="font-[var(--font-mono)] text-[11px]">{costDisplay}</span>
          )}
          {taskAgents.length > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                useBoardStore.getState().setAgentPanelOpen(true);
              }}
              title={`${taskAgents.length} agent(s) working`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {taskAgents.length} agent{taskAgents.length > 1 ? "s" : ""}
            </span>
          )}
          <AgentStatus subtasks={task.subtasks} />
        </div>
        <span className="text-[11px]">{timeAgo(task.updatedAt)}</span>
      </div>
    </div>
  );
}
