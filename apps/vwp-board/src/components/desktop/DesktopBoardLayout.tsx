"use client";

import { useState, useCallback } from "react";
import type { KanbanColumnId, KanbanTask } from "@/types/kanban";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { AgentPanel } from "@/components/agents/AgentPanel";
import { useBoardStore } from "@/store/board-store";
import { TaskDetailPanel } from "./TaskDetailPanel";

interface DesktopBoardLayoutProps {
  columns: Record<KanbanColumnId, KanbanTask[]>;
  onMoveTask: (
    taskId: string,
    toColumn: KanbanColumnId,
    position: number,
  ) => void;
  onReorderTask: (taskId: string, newPosition: number) => void;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onCancel: (taskId: string) => void;
}

export function DesktopBoardLayout({
  columns,
  onMoveTask,
  onReorderTask,
  onApprove,
  onReject,
  onRetry,
  onCancel,
}: DesktopBoardLayoutProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const agentPanelOpen = useBoardStore((s) => s.agentPanelOpen);

  const handleTaskClick = useCallback((taskId: string) => {
    setSelectedTaskId((prev) => (prev === taskId ? null : taskId));
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-auto">
        <KanbanBoard
          columns={columns}
          onMoveTask={onMoveTask}
          onReorderTask={onReorderTask}
          onTaskClick={handleTaskClick}
        />
      </div>
      <TaskDetailPanel
        taskId={selectedTaskId}
        onClose={handleClosePanel}
        onApprove={onApprove}
        onReject={onReject}
        onRetry={onRetry}
        onCancel={onCancel}
      />
      {agentPanelOpen && (
        <AgentPanel onTaskClick={handleTaskClick} />
      )}
    </div>
  );
}
