"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import type { KanbanTask } from "@/types/kanban";
import { useTaskDetail } from "@/hooks/useTaskDetail";
import { AgentActivityFeed } from "@/components/activity/AgentActivityFeed";
import { TaskFailedBanner } from "@/components/error/TaskFailedBanner";
import { TimeoutWarning } from "@/components/error/TimeoutWarning";

interface MobileTaskSheetProps {
  taskId: string;
  onClose: () => void;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onCancel: (taskId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  analyzing: "Analyzing",
  confirming: "Confirming",
  dispatching: "Dispatching",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function MobileTaskSheet({
  taskId,
  onClose,
  onApprove,
  onReject,
  onRetry,
  onCancel,
}: MobileTaskSheetProps) {
  const { task, activity, loading } = useTaskDetail(taskId);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragging = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {handleClose();}
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  // Swipe-down to close gesture on handle area
  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragStartY.current = e.clientY;
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) {return;}
      const dy = Math.max(0, e.clientY - dragStartY.current);
      setDragOffset(dy);
    },
    [],
  );

  const handleDragEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragging.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      const dy = e.clientY - dragStartY.current;
      if (dy > 120) {
        handleClose();
      } else {
        setDragOffset(0);
      }
    },
    [handleClose],
  );

  const subtaskProgress = task
    ? {
        total: task.subtasks.length,
        completed: task.subtasks.filter((s) => s.status === "completed").length,
        running: task.subtasks.filter((s) => s.status === "running").length,
        failed: task.subtasks.filter((s) => s.status === "failed").length,
      }
    : null;

  const showApprovalActions =
    task &&
    (task.status === "confirming" || task.column === "review");

  const runningSubtask = task?.subtasks.find(
    (s) => s.status === "running" && s.startedAt,
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col rounded-t-2xl bg-[var(--color-surface)] shadow-[var(--shadow-xl)] transition-transform duration-200 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          transform: visible
            ? `translateY(${dragOffset}px)`
            : "translateY(100%)",
          transition: dragging.current ? "none" : undefined,
        }}
      >
        {/* Drag handle */}
        <div
          className="flex cursor-grab items-center justify-center py-3 active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={() => {
            dragging.current = false;
            setDragOffset(0);
          }}
        >
          <div className="h-1 w-10 rounded-full bg-[var(--color-border)]" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-[var(--color-text-muted)]">
                Loading...
              </span>
            </div>
          ) : task ? (
            <div className="space-y-4 pb-24">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-[var(--color-text)]">
                    {task.text}
                  </h2>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                      {STATUS_LABELS[task.status] ?? task.status}
                    </span>
                    {task.domain && (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {task.domain}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="ml-2 shrink-0 rounded-full p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="4" y1="4" x2="14" y2="14" />
                    <line x1="14" y1="4" x2="4" y2="14" />
                  </svg>
                </button>
              </div>

              {/* Failed banner */}
              {task.status === "failed" && (
                <TaskFailedBanner
                  errorMessage={task.error}
                  onRetry={() => onRetry(task.id)}
                  onCancel={() => onCancel(task.id)}
                />
              )}

              {/* Timeout warning */}
              {runningSubtask?.startedAt && task.costEstimate && (
                <TimeoutWarning
                  startedAt={runningSubtask.startedAt}
                  estimatedDurationMs={
                    task.costEstimate.estimatedTokens > 100000
                      ? 120000
                      : 60000
                  }
                  onCancel={() => onCancel(task.id)}
                />
              )}

              {/* Cost */}
              {(task.actualCost || task.costEstimate) && (
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    Cost
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[var(--color-text)] font-[var(--font-mono)]">
                    {task.actualCost
                      ? `$${task.actualCost.usd.toFixed(4)}`
                      : `~$${task.costEstimate!.estimatedCostUsd.toFixed(4)}`}
                  </p>
                  {task.actualCost && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {task.actualCost.tokens.toLocaleString()} tokens
                    </p>
                  )}
                </div>
              )}

              {/* Subtask progress */}
              {subtaskProgress && subtaskProgress.total > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    Subtasks ({subtaskProgress.completed}/
                    {subtaskProgress.total})
                  </p>
                  <div className="space-y-1.5">
                    {task.subtasks.map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 py-2"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            st.status === "completed"
                              ? "bg-emerald-500"
                              : st.status === "running"
                                ? "bg-teal-500"
                                : st.status === "failed"
                                  ? "bg-rose-500"
                                  : "bg-slate-300"
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                          {st.description}
                        </span>
                        {st.assignedAgent && (
                          <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                            {st.assignedAgent}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity Feed */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Activity
                </p>
                <AgentActivityFeed entries={activity} maxHeight="300px" />
              </div>
            </div>
          ) : null}
        </div>

        {/* Sticky bottom actions */}
        {showApprovalActions && (
          <div className="sticky bottom-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onReject(taskId)}
                className="flex-1 rounded-[var(--radius-md)] border border-rose-200 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => onApprove(taskId)}
                className="flex-1 rounded-[var(--radius-md)] bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Approve
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
