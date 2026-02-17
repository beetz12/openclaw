"use client";

import type { KanbanTask } from "@/types/kanban";

export interface TaskDetailProps {
  task: KanbanTask;
  onClose: () => void;
}

/** Placeholder task detail panel — will be built out by teammates. */
export function TaskDetail({ task, onClose }: TaskDetailProps) {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-[var(--color-text)]">
          Task: {task.id}
        </h2>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Close
        </button>
      </div>
      <p className="text-[var(--color-text-secondary)]">{task.text}</p>
    </div>
  );
}
