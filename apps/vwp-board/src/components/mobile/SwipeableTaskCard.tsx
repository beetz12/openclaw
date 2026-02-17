"use client";

import { useRef, useState, useCallback } from "react";
import type { KanbanTask } from "@/types/kanban";

interface SwipeableTaskCardProps {
  task: KanbanTask;
  onTap: () => void;
  onApprove: () => void;
  onReject: () => void;
}

const SWIPE_THRESHOLD = 80;

const PRIORITY_STYLES: Record<
  KanbanTask["priority"],
  { bg: string; text: string; label: string }
> = {
  low: { bg: "bg-slate-100", text: "text-slate-600", label: "Low" },
  medium: { bg: "bg-blue-100", text: "text-blue-700", label: "Med" },
  high: { bg: "bg-orange-100", text: "text-orange-700", label: "High" },
  urgent: { bg: "bg-rose-100", text: "text-rose-700", label: "Urgent" },
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-slate-400",
  analyzing: "bg-blue-400",
  confirming: "bg-amber-400",
  dispatching: "bg-violet-400",
  running: "bg-teal-500",
  completed: "bg-emerald-500",
  failed: "bg-rose-500",
  cancelled: "bg-slate-300",
};

export function SwipeableTaskCard({
  task,
  onTap,
  onApprove,
  onReject,
}: SwipeableTaskCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const directionLocked = useRef(false);
  const isHorizontal = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      startX.current = e.clientX;
      startY.current = e.clientY;
      tracking.current = true;
      directionLocked.current = false;
      isHorizontal.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!tracking.current) {return;}

      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;

      // Lock direction after 10px of movement
      if (!directionLocked.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        directionLocked.current = true;
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      }

      if (!directionLocked.current || !isHorizontal.current) {return;}

      // Apply resistance beyond threshold
      const dampened =
        Math.abs(dx) > SWIPE_THRESHOLD
          ? Math.sign(dx) *
            (SWIPE_THRESHOLD + (Math.abs(dx) - SWIPE_THRESHOLD) * 0.3)
          : dx;
      setOffsetX(dampened);
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!tracking.current) {return;}
      tracking.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

      const dx = e.clientX - startX.current;

      if (!directionLocked.current || !isHorizontal.current) {
        // Minimal movement - treat as tap
        if (Math.abs(dx) < 5 && Math.abs(e.clientY - startY.current) < 5) {
          onTap();
        }
        setOffsetX(0);
        return;
      }

      if (dx > SWIPE_THRESHOLD) {
        onApprove();
      } else if (dx < -SWIPE_THRESHOLD) {
        onReject();
      }

      setOffsetX(0);
    },
    [onTap, onApprove, onReject],
  );

  const priority = PRIORITY_STYLES[task.priority];
  const statusColor = STATUS_COLORS[task.status] ?? "bg-slate-400";
  const completedSubtasks = task.subtasks.filter(
    (s) => s.status === "completed",
  ).length;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action backgrounds */}
      <div className="absolute inset-0 flex">
        {/* Left side: approve (revealed on swipe right) */}
        <div className="flex flex-1 items-center bg-emerald-500 pl-4">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="4,10 8,14 16,6" />
          </svg>
        </div>
        {/* Right side: reject (revealed on swipe left) */}
        <div className="flex flex-1 items-center justify-end bg-rose-500 pr-4">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="5" x2="15" y2="15" />
            <line x1="15" y1="5" x2="5" y2="15" />
          </svg>
        </div>
      </div>

      {/* Card content */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          tracking.current = false;
          setOffsetX(0);
        }}
        className="relative cursor-pointer touch-pan-y select-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-sm)]"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: offsetX === 0 ? "transform 300ms cubic-bezier(0.25, 1, 0.5, 1)" : "none",
        }}
      >
        {/* Header: status dot + title */}
        <div className="flex items-start gap-2">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusColor}`}
          />
          <p className="text-sm font-medium text-[var(--color-text)] line-clamp-2 leading-snug">
            {task.text}
          </p>
        </div>

        {/* Tags */}
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priority.bg} ${priority.text}`}
          >
            {priority.label}
          </span>
          {task.subtasks.length > 0 && (
            <span className="text-xs text-[var(--color-text-muted)]">
              {completedSubtasks}/{task.subtasks.length} subtasks
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
