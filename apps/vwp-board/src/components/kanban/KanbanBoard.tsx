"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import type { KanbanColumnId, KanbanTask } from "@/types/kanban";
import { COLUMN_CONFIG } from "@/types/kanban";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

export interface KanbanBoardProps {
  columns: Record<KanbanColumnId, KanbanTask[]>;
  onMoveTask: (taskId: string, toColumn: KanbanColumnId, position: number) => void;
  onReorderTask: (taskId: string, newPosition: number) => void;
  onTaskClick: (taskId: string) => void;
}

const COLUMN_ORDER: KanbanColumnId[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
];

function findColumnForTask(
  columns: Record<KanbanColumnId, KanbanTask[]>,
  taskId: string,
): KanbanColumnId | null {
  for (const colId of COLUMN_ORDER) {
    if (columns[colId].some((t) => t.id === taskId)) {
      return colId;
    }
  }
  return null;
}

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

export function KanbanBoard({
  columns,
  onMoveTask,
  onReorderTask,
  onTaskClick,
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [localColumns, setLocalColumns] = useState(columns);
  const isMobile = useIsMobile();

  // Sync external columns prop into local state
  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const taskId = String(event.active.id);
      const colId = findColumnForTask(localColumns, taskId);
      if (colId) {
        const task = localColumns[colId].find((t) => t.id === taskId);
        if (task) {setActiveTask(task);}
      }
    },
    [localColumns],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) {return;}

      const activeId = String(active.id);
      const overId = String(over.id);

      const activeCol = findColumnForTask(localColumns, activeId);
      // "over" could be a task ID or a column ID (droppable)
      let overCol = findColumnForTask(localColumns, overId);
      if (!overCol && COLUMN_ORDER.includes(overId as KanbanColumnId)) {
        overCol = overId as KanbanColumnId;
      }

      if (!activeCol || !overCol || activeCol === overCol) {return;}

      // Move the task to the new column optimistically
      setLocalColumns((prev) => {
        const sourceItems = prev[activeCol].filter((t) => t.id !== activeId);
        const task = prev[activeCol].find((t) => t.id === activeId);
        if (!task) {return prev;}

        const destItems = [...prev[overCol]];
        const overIndex = destItems.findIndex((t) => t.id === overId);
        const insertIndex = overIndex >= 0 ? overIndex : destItems.length;
        destItems.splice(insertIndex, 0, task);

        return {
          ...prev,
          [activeCol]: sourceItems,
          [overCol]: destItems,
        };
      });
    },
    [localColumns],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);

      if (!over) {return;}

      const activeId = String(active.id);
      const overId = String(over.id);

      const activeCol = findColumnForTask(localColumns, activeId);
      let overCol = findColumnForTask(localColumns, overId);
      if (!overCol && COLUMN_ORDER.includes(overId as KanbanColumnId)) {
        overCol = overId as KanbanColumnId;
      }

      if (!activeCol) {return;}

      if (activeCol === overCol && overCol) {
        // Same column reorder
        const items = localColumns[overCol];
        const oldIndex = items.findIndex((t) => t.id === activeId);
        const newIndex = items.findIndex((t) => t.id === overId);
        if (oldIndex !== newIndex && newIndex >= 0) {
          const reordered = arrayMove(items, oldIndex, newIndex);
          setLocalColumns((prev) => ({ ...prev, [overCol]: reordered }));
          onReorderTask(activeId, newIndex);
        }
      } else if (overCol) {
        // Cross-column move (already handled optimistically in handleDragOver)
        const destItems = localColumns[overCol];
        const position = destItems.findIndex((t) => t.id === activeId);
        onMoveTask(activeId, overCol, position >= 0 ? position : destItems.length);
      }
    },
    [localColumns, onMoveTask, onReorderTask],
  );

  // Mobile: flat grouped list (no drag-and-drop)
  if (isMobile) {
    return (
      <div className="flex flex-col gap-6 p-4 pb-24">
        {COLUMN_ORDER.map((colId) => {
          const config = COLUMN_CONFIG[colId];
          const tasks = localColumns[colId];
          return (
            <section key={colId}>
              <div className="flex items-center gap-2 mb-2">
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
              {tasks.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] italic pl-4">
                  No tasks
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onTaskClick(task.id)}
                      className="cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-sm)] active:shadow-[var(--shadow-md)] transition-shadow"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            task.status === "completed"
                              ? "bg-emerald-500"
                              : task.status === "running"
                                ? "bg-teal-500"
                                : task.status === "failed"
                                  ? "bg-rose-500"
                                  : "bg-slate-400"
                          }`}
                        />
                        <p className="text-sm font-medium text-[var(--color-text)] line-clamp-2">
                          {task.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  // Desktop: 5-column Kanban with drag-and-drop
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        className="grid gap-3 p-4 overflow-x-auto h-full"
        style={{ gridTemplateColumns: "repeat(5, minmax(260px, 1fr))" }}
      >
        {COLUMN_ORDER.map((colId) => {
          const config = COLUMN_CONFIG[colId];
          return (
            <KanbanColumn
              key={colId}
              id={colId}
              label={config.label}
              color={config.color}
              tasks={localColumns[colId]}
              onTaskClick={onTaskClick}
            />
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-[280px]">
            <TaskCard
              task={activeTask}
              onClick={() => {}}
              isDragOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
