"use client";

import { useState } from "react";
import type { AgentInfo } from "@/types/kanban";

const STATUS_STYLES: Record<AgentInfo["status"], { dot: string; label: string }> = {
  active: { dot: "bg-emerald-500 animate-pulse", label: "Active" },
  idle: { dot: "bg-slate-300", label: "Idle" },
  error: { dot: "bg-rose-500", label: "Error" },
};

interface AgentCardProps {
  agent: AgentInfo;
  onTaskClick?: (taskId: string) => void;
}

export function AgentCard({ agent, onTaskClick }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLES[agent.status];

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
          <span className="text-sm font-medium text-[var(--color-text)]">{agent.name}</span>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">{style.label}</span>
      </div>

      {/* Task link */}
      {agent.taskId && (
        <button
          type="button"
          onClick={() => onTaskClick?.(agent.taskId!)}
          className="mt-1.5 text-xs text-[var(--color-primary)] hover:underline truncate block w-full text-left"
        >
          Task: {agent.taskId.slice(0, 8)}...
        </button>
      )}

      {/* Last action */}
      {agent.lastAction && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)] truncate">
          {agent.lastAction}
        </p>
      )}

      {/* Error */}
      {agent.error && (
        <p className="mt-1 text-xs text-[var(--color-danger)] truncate">
          {agent.error}
        </p>
      )}

      {/* Expand toggle (placeholder for logs) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        {expanded ? "Hide logs" : "Show logs"}
      </button>

      {expanded && (
        <div className="mt-2 max-h-32 overflow-auto rounded bg-[var(--color-bg)] p-2 text-[11px] font-mono text-[var(--color-text-muted)]">
          <p className="italic">Log streaming coming soon</p>
        </div>
      )}
    </div>
  );
}
