"use client";

import { useEffect, useRef } from "react";

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
}

const TYPE_COLORS: Record<ActivityEntry["type"], string> = {
  agent_action: "var(--color-primary)",
  status_change: "var(--color-info)",
  subtask_update: "var(--color-success)",
  approval_gate: "var(--color-warning)",
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

export function AgentActivityFeed({
  entries,
  maxHeight = "400px",
}: AgentActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
              <div className="flex items-baseline gap-2">
                {entry.agentName && (
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {entry.agentName}
                  </span>
                )}
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {entry.action}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
                {entry.detail}
              </p>
            </div>

            {/* Timestamp */}
            <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
              {formatTimeAgo(entry.timestamp)}
            </span>
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
