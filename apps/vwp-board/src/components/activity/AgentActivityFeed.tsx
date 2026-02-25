"use client";

import { useEffect, useRef, useState } from "react";

interface ActivityEntry {
  id: string;
  taskId: string;
  timestamp: number;
  type: "agent_action" | "status_change" | "subtask_update" | "approval_gate";
  agentName?: string;
  action: string;
  detail: string;
}

interface AgentActivityFeedProps {
  entries: ActivityEntry[];
  maxHeight?: string;
  taskMetaById?: Record<string, { text: string; priority: string }>;
}

const TYPE_COLORS: Record<ActivityEntry["type"], string> = {
  agent_action: "var(--color-primary)",
  status_change: "var(--color-info)",
  subtask_update: "var(--color-success)",
  approval_gate: "var(--color-warning)",
};

const ACTION_BADGES: Partial<Record<string, { label: string; className: string }>> = {
  task_created: {
    label: "Task Queued",
    className: "bg-blue-100 text-blue-700",
  },
  execution_routed: {
    label: "Execution Routed",
    className: "bg-indigo-100 text-indigo-700",
  },
  assignment_manual: {
    label: "Manual Assignment",
    className: "bg-amber-100 text-amber-700",
  },
  assignment_auto: {
    label: "Auto Assignment",
    className: "bg-emerald-100 text-emerald-700",
  },
  assignment_unlocked: {
    label: "Assignment Unlocked",
    className: "bg-slate-100 text-slate-700",
  },
  task_completed: {
    label: "Completed",
    className: "bg-emerald-100 text-emerald-700",
  },
  task_failed: {
    label: "Failed",
    className: "bg-rose-100 text-rose-700",
  },
  status_changed: {
    label: "Status Update",
    className: "bg-cyan-100 text-cyan-700",
  },
  team_launch: {
    label: "Team Launch",
    className: "bg-violet-100 text-violet-700",
  },
  ready_for_review: {
    label: "Ready for Review",
    className: "bg-lime-100 text-lime-700",
  },
  task_retried: {
    label: "Retried",
    className: "bg-orange-100 text-orange-700",
  },
  coordination: {
    label: "Coordination",
    className: "bg-fuchsia-100 text-fuchsia-700",
  },
  move: {
    label: "Column Move",
    className: "bg-sky-100 text-sky-700",
  },
};

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) {return "just now";}
  if (seconds < 60) {return `${seconds}s ago`;}
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {return `${minutes}m ago`;}
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {return `${hours}h ago`;}
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function humanizeAction(action: string): string {
  return action
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatPriority(priority: string | undefined): string {
  if (!priority) {return "MEDIUM";}
  return priority.toUpperCase();
}

function formatActivityDetail(entry: ActivityEntry): string {
  const raw = entry.detail?.trim() ?? "";

  if (entry.action === "task_created") {
    if (!raw || raw === "Task submitted to dispatch queue") {
      return `Task queued · ${entry.taskId.slice(0, 8)}…`;
    }
  }

  if (entry.action === "status_changed") {
    return raw.replace(/\b(in_progress|ready_for_review)\b/g, (m) => m.replaceAll("_", " "));
  }

  if (entry.action === "agent_action" && raw.toLowerCase().includes("tool")) {
    return raw.replace(/^tool\s+/i, "Tool: ");
  }

  return raw;
}

export function AgentActivityFeed({
  entries,
  maxHeight = "400px",
  taskMetaById = {},
}: AgentActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]"
        style={{ height: maxHeight }}
      >
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg-subtle)]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" />
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Waiting for agent activity...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]"
      style={{ maxHeight, scrollBehavior: "smooth" }}
    >
      <div className="divide-y divide-[var(--color-border)]">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-bg)]"
          >
            {/* Type indicator dot */}
            <div className="mt-1.5 shrink-0">
              <span
                className="block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: TYPE_COLORS[entry.type] }}
              />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                {entry.agentName && (
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {entry.agentName}
                  </span>
                )}
                {ACTION_BADGES[entry.action] && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTION_BADGES[entry.action]!.className}`}
                    title={entry.action}
                  >
                    {ACTION_BADGES[entry.action]!.label}
                  </span>
                )}
                <span className="text-sm text-[var(--color-text-secondary)]" title={entry.action}>
                  {humanizeAction(entry.action)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-[var(--color-text-muted)]" title={formatActivityDetail(entry)}>
                {formatActivityDetail(entry)}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] font-mono">
                <span>task: {entry.taskId}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(entry.taskId);
                      setCopiedTaskId(entry.taskId);
                      setTimeout(() => setCopiedTaskId((v) => (v === entry.taskId ? null : v)), 1200);
                    } catch {
                      // no-op
                    }
                  }}
                  className="rounded border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium"
                >
                  {copiedTaskId === entry.taskId ? "Copied" : "Copy"}
                </button>
              </div>
              {taskMetaById[entry.taskId]?.text && (
                <p
                  className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2"
                  title={`[${formatPriority(taskMetaById[entry.taskId].priority)}] ${taskMetaById[entry.taskId].text}`}
                >
                  [{formatPriority(taskMetaById[entry.taskId].priority)}] {taskMetaById[entry.taskId].text}
                </p>
              )}
            </div>

            {/* Timestamp + link */}
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
                title={entry.type}
              >
                {entry.type.replaceAll("_", " ")}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]" title={new Date(entry.timestamp).toLocaleString()}>
                {formatTimeAgo(entry.timestamp)}
              </span>
              <a
                href={`/board/${entry.taskId}`}
                className="text-[11px] font-medium text-[var(--color-primary)] hover:underline"
                title={`Open task ${entry.taskId}`}
              >
                View details
              </a>
            </div>
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
