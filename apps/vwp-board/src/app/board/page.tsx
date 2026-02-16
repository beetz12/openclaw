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
  // gatewayConnected will be added by Task 7 — use false until then
  const gatewayConnected = false;
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
      refresh();
    },
    [refresh],
  );

  const handleRetry = useCallback(
    async (taskId: string) => {
      // Re-confirm a failed task to resubmit it
      await confirmTask(taskId);
    },
    [confirmTask],
  );

  const handleCancel = useCallback(
    async (taskId: string) => {
      await kanbanApi.cancelTask(taskId);
      refresh();
    },
    [refresh],
  );

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
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        <h2 className="text-lg font-bold text-[var(--color-text)]">Board</h2>
        <ConnectionIndicator
          sseConnected={sseConnected}
          sseStale={sseStale}
          gatewayConnected={gatewayConnected}
        />
      </div>

      {/* Board: mobile or desktop */}
      {isMobile ? (
        <MobileTaskList
          columns={columns}
          onRefresh={refresh}
          onApprove={handleApprove}
          onReject={handleReject}
          onRetry={handleRetry}
          onCancel={handleCancel}
        />
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
