"use client";

import { useAgentStatus } from "@/hooks/useAgentStatus";

export function AgentStatusPanel() {
  const { snapshot, stateColor } = useAgentStatus();

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Agent Status
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
          <span className={`h-2 w-2 rounded-full ${stateColor}`} />
          {snapshot.state}
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        Sub-agents active: <span className="font-semibold text-[var(--color-text)]">{snapshot.subAgentsActive}</span>
      </p>
      <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text)]">
        {snapshot.activeTask ? snapshot.activeTask.text : "No active task"}
      </p>
      <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">Updated: {new Date(snapshot.updatedAt).toLocaleTimeString()}</p>
    </div>
  );
}
