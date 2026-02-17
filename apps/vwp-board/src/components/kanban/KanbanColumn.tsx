"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { KanbanColumnId, KanbanTask } from "@/types/kanban";
import { TaskCard } from "./TaskCard";

export interface KanbanColumnProps {
  id: KanbanColumnId;
  label: string;
  color: string;
  tasks: KanbanTask[];
  onTaskClick: (taskId: string) => void;
}

export function KanbanColumn({ id, label, color, tasks, onTaskClick }: KanbanColumnProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id });

  const taskIds = tasks.map((t) => t.id);

  return (
    <div
      className="flex flex-col min-w-[260px] max-w-[340px] rounded-xl bg-[var(--color-bg-subtle,#f1f5f9)]"
      style={{ borderTop: `3px solid ${color}` }}
    >
      {/* Column header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between px-3 py-2.5 select-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {label}
          </span>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600">
            {tasks.length}
          </span>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[var(--color-text-muted)] transition-transform duration-200 ${
            collapsed ? "-rotate-90" : ""
          }`}
        >
          <polyline points="4 6 8 10 12 6" />
        </svg>
      </button>

      {/* Task list / drop zone */}
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={`
            flex-1 flex flex-col gap-2 px-2 pb-2 min-h-[60px] overflow-y-auto
            rounded-b-xl transition-colors duration-150
            ${isOver ? "bg-[var(--color-primary-bg,#e0f2f1)]" : ""}
          `}
        >
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task.id)}
              />
            ))}
          </SortableContext>

          {tasks.length === 0 && (
            <div className="flex flex-1 items-center justify-center py-8">
              <p className="text-xs text-[var(--color-text-muted)] italic">
                No tasks
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
