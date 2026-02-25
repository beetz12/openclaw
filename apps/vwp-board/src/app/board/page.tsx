"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBoard } from "@/hooks/useBoard";
import { useBoardStore } from "@/store/board-store";
import { kanbanApi } from "@/lib/api-client";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { NetworkError } from "@/components/error/NetworkError";
import { ConnectionIndicator } from "@/components/status/ConnectionIndicator";
import { MobileTaskList } from "@/components/mobile/MobileTaskList";
import { DesktopBoardLayout } from "@/components/desktop/DesktopBoardLayout";
import { AgentPanel } from "@/components/agents/AgentPanel";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    initialized.current = true;
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}

function BoardContent() {
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [submitting, setSubmitting] = useState(false);

  const {
    columns,
    loading,
    error,
    sseConnected,
    moveTask,
    reorderTask,
    refresh,
    confirmTask,
  } = useBoard();
  const sseStale = useBoardStore((s) => s.sseStale);
  const gatewayConnected = useBoardStore((s) => s.gatewayConnected);
  const isMobile = useIsMobile();

  const handleApprove = useCallback(
    async (taskId: string) => {
      await confirmTask(taskId);
    },
    [confirmTask],
  );

  const handleReject = useCallback(
    async (taskId: string) => {
      await kanbanApi.cancelTask(taskId);
      void refresh();
    },
    [refresh],
  );

  const handleRetry = useCallback(
    async (taskId: string) => {
      await kanbanApi.retryTask(taskId);
      void refresh();
    },
    [refresh],
  );

  const handleCancel = useCallback(
    async (taskId: string) => {
      await kanbanApi.cancelTask(taskId);
      void refresh();
    },
    [refresh],
  );

  const handleQuickAdd = useCallback(async () => {
    const text = newTaskText.trim();
    if (!text) {return;}
    setSubmitting(true);
    try {
      await kanbanApi.submitGoal(text, newTaskPriority);
      setNewTaskText("");
      setNewTaskPriority("medium");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }, [newTaskPriority, newTaskText, refresh]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-[var(--color-text-muted)]">
          Loading board...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Network error banner */}
      <NetworkError connected={sseConnected} onRetry={refresh} />

      {/* Status bar */}
      <div className="border-b border-[var(--color-border)] px-4 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--color-text)]">Board</h2>
          <ConnectionIndicator
            sseConnected={sseConnected}
            sseStale={sseStale}
            gatewayConnected={gatewayConnected}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            placeholder="Quick add task to To Do..."
            className="min-w-[260px] flex-1 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-sm"
          />
          <select
            value={newTaskPriority}
            onChange={(e) => setNewTaskPriority(e.target.value as "low" | "medium" | "high" | "urgent")}
            className="rounded border border-[var(--color-border)] px-2.5 py-1.5 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <button
            type="button"
            disabled={submitting || !newTaskText.trim()}
            onClick={() => void handleQuickAdd()}
            className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      {/* Board: mobile or desktop */}
      {isMobile ? (
        <>
          <MobileTaskList
            columns={columns}
            onRefresh={refresh}
            onApprove={handleApprove}
            onReject={handleReject}
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
          {/* AgentPanel on mobile uses position:fixed (bottom sheet) */}
          <AgentPanel />
        </>
      ) : (
        <div className="flex-1 overflow-hidden">
          <DesktopBoardLayout
            columns={columns}
            onMoveTask={moveTask}
            onReorderTask={reorderTask}
            onApprove={handleApprove}
            onReject={handleReject}
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
        </div>
      )}
    </div>
  );
}

export default function BoardPage() {
  return (
    <ErrorBoundary>
      <BoardContent />
    </ErrorBoundary>
  );
}
