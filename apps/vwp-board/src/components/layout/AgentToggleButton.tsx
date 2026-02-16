"use client";

import { useBoardStore } from "@/store/board-store";

export function AgentToggleButton() {
  const agentCount = useBoardStore((s) => s.agents.length);
  const setOpen = useBoardStore((s) => s.setAgentPanelOpen);
  const open = useBoardStore((s) => s.agentPanelOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={open ? "Close agents panel" : "Open agents panel"}
      className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
    >
      <span>Agents</span>
      {agentCount > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-700">
          {agentCount}
        </span>
      )}
    </button>
  );
}
