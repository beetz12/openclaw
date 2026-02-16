"use client";

import { useBoardStore } from "@/store/board-store";

export function MobileAgentTab() {
  const agentCount = useBoardStore((s) => s.agents.length);
  const setOpen = useBoardStore((s) => s.setAgentPanelOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] relative"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="7" r="3" />
        <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
      Agents
      {agentCount > 0 && (
        <span className="absolute -top-0.5 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
          {agentCount}
        </span>
      )}
    </button>
  );
}
