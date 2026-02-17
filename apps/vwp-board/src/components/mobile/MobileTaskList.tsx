"use client";

import { useState, useCallback, useRef } from "react";
import type { KanbanColumnId, KanbanTask } from "@/types/kanban";
import { COLUMN_CONFIG } from "@/types/kanban";
import { SwipeableTaskCard } from "./SwipeableTaskCard";
import { MobileTaskSheet } from "./MobileTaskSheet";

interface MobileTaskListProps {
  columns: Record<KanbanColumnId, KanbanTask[]>;
  onRefresh: () => void;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onCancel: (taskId: string) => void;
}

const COLUMN_ORDER: KanbanColumnId[] = [
  "in_progress",
  "review",
  "todo",
  "backlog",
  "done",
];

const PULL_THRESHOLD = 80;

export function MobileTaskList({
  columns,
  onRefresh,
  onApprove,
  onReject,
  onRetry,
  onCancel,
}: MobileTaskListProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const pulling = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (container && container.scrollTop <= 0) {
        touchStartY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!pulling.current) {return;}
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0) {
        // Apply resistance
        const dampened = dy > PULL_THRESHOLD ? PULL_THRESHOLD + (dy - PULL_THRESHOLD) * 0.3 : dy;
        setPullOffset(dampened);
      }
    },
    [],
  );

  const handleTouchEnd = useCallback(() => {
    if (!pulling.current) {return;}
    pulling.current = false;

    if (pullOffset >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      onRefresh();
      setTimeout(() => {
        setRefreshing(false);
        setPullOffset(0);
      }, 800);
    } else {
      setPullOffset(0);
    }
  }, [pullOffset, refreshing, onRefresh]);

  return (
    <>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
          style={{ height: pullOffset > 0 ? `${pullOffset}px` : "0px" }}
        >
          <div
            className={`text-sm text-[var(--color-text-muted)] ${
              refreshing ? "animate-pulse" : ""
            }`}
          >
            {refreshing
              ? "Refreshing..."
              : pullOffset >= PULL_THRESHOLD
                ? "Release to refresh"
                : "Pull to refresh"}
          </div>
        </div>

        {/* Task groups */}
        <div className="flex flex-col gap-5 p-4 pb-24">
          {COLUMN_ORDER.map((colId) => {
            const config = COLUMN_CONFIG[colId];
            const tasks = columns[colId];
            if (tasks.length === 0) {return null;}

            return (
              <section key={colId}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">
                    {config.label}
                  </h3>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    ({tasks.length})
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {tasks.map((task) => (
                    <SwipeableTaskCard
                      key={task.id}
                      task={task}
                      onTap={() => setSelectedTaskId(task.id)}
                      onApprove={() => onApprove(task.id)}
                      onReject={() => onReject(task.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Empty state */}
          {COLUMN_ORDER.every((col) => columns[col].length === 0) && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg-subtle)]">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-text-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                No tasks yet
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Submit a new goal to get started
              </p>
            </div>
          )}
        </div>
      </div>

      {/* FAB: New Goal */}
      <a
        href="/goals/new"
        className="fixed bottom-[calc(var(--tab-bar-height)+16px)] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[var(--shadow-lg)] active:scale-95 transition-transform"
        aria-label="New Goal"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </a>

      {/* Task detail sheet */}
      {selectedTaskId && (
        <MobileTaskSheet
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onApprove={onApprove}
          onReject={onReject}
          onRetry={onRetry}
          onCancel={onCancel}
        />
      )}
    </>
  );
}
