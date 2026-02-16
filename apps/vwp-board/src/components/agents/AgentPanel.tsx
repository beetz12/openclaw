"use client";

import { useCallback, useEffect } from "react";
import { useBoardStore } from "@/store/board-store";
import { AgentCard } from "./AgentCard";

interface AgentPanelProps {
  onTaskClick?: (taskId: string) => void;
}

export function AgentPanel({ onTaskClick }: AgentPanelProps) {
  const open = useBoardStore((s) => s.agentPanelOpen);
  const setOpen = useBoardStore((s) => s.setAgentPanelOpen);
  const agents = useBoardStore((s) => s.agents);
  const gatewayConnected = useBoardStore((s) => s.gatewayConnected);

  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!open) {return;}
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {handleClose();}
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  if (!open) {return null;}

  const activeAgents = agents.filter((a) => a.status === "active");
  const otherAgents = agents.filter((a) => a.status !== "active");

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className="fixed inset-0 z-40 bg-black/20 md:hidden"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-hidden rounded-t-2xl border-t border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg md:static md:inset-auto md:z-auto md:max-h-none md:w-80 md:rounded-none md:rounded-l-none md:border-l md:border-t-0 md:shadow-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--color-text)]">Agents</h3>
            <span className="rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
              {agents.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${gatewayConnected ? "bg-emerald-500" : "bg-rose-500"}`}
              title={gatewayConnected ? "Gateway connected" : "Gateway offline"}
            />
            <button
              type="button"
              onClick={handleClose}
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]"
              aria-label="Close agent panel"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-auto p-3" style={{ maxHeight: "calc(70vh - 52px)" }}>
          {agents.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">
                No agents running
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Agents appear here when tasks are being executed
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {activeAgents.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Active ({activeAgents.length})
                  </p>
                  {activeAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} onTaskClick={onTaskClick} />
                  ))}
                </>
              )}
              {otherAgents.length > 0 && (
                <>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Recent ({otherAgents.length})
                  </p>
                  {otherAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} onTaskClick={onTaskClick} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
