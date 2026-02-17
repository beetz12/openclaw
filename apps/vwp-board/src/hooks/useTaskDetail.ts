"use client";

import { useEffect, useState, useCallback } from "react";
import type { KanbanTask } from "@/types/kanban";
import { kanbanApi, type ActivityEntry } from "@/lib/api-client";
import { boardSSE } from "@/lib/sse-client";

interface TaskDetailState {
  task: KanbanTask | null;
  activity: ActivityEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetches a single task's detail and activity log.
 * Subscribes to SSE for real-time updates to this specific task.
 */
export function useTaskDetail(taskId: string): TaskDetailState {
  const [task, setTask] = useState<KanbanTask | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskData, activityData] = await Promise.all([
        kanbanApi.getTaskDetail(taskId),
        kanbanApi.getActivity(taskId),
      ]);
      setTask(taskData);
      setActivity(activityData);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "error" in err
          ? (err as { error: string }).error
          : "Failed to load task";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Initial fetch
  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // SSE subscriptions for real-time updates to this task
  useEffect(() => {
    if (!boardSSE.connected) {
      boardSSE.connect();
    }

    const unsubs: Array<() => void> = [];

    // Listen for subtask updates
    unsubs.push(
      boardSSE.on("subtask_started", (data) => {
        const event = data as { taskId: string; subtaskId: string; agentName: string };
        if (event.taskId !== taskId) {return;}
        setTask((prev) => {
          if (!prev) {return prev;}
          return {
            ...prev,
            subtasks: prev.subtasks.map((st) =>
              st.id === event.subtaskId
                ? { ...st, status: "running" as const, assignedAgent: event.agentName }
                : st,
            ),
          };
        });
      }),
    );

    unsubs.push(
      boardSSE.on("subtask_completed", (data) => {
        const event = data as { taskId: string; subtaskId: string; result: string };
        if (event.taskId !== taskId) {return;}
        setTask((prev) => {
          if (!prev) {return prev;}
          return {
            ...prev,
            subtasks: prev.subtasks.map((st) =>
              st.id === event.subtaskId
                ? { ...st, status: "completed" as const, result: event.result }
                : st,
            ),
          };
        });
      }),
    );

    unsubs.push(
      boardSSE.on("subtask_failed", (data) => {
        const event = data as { taskId: string; subtaskId: string; error: string };
        if (event.taskId !== taskId) {return;}
        setTask((prev) => {
          if (!prev) {return prev;}
          return {
            ...prev,
            subtasks: prev.subtasks.map((st) =>
              st.id === event.subtaskId
                ? { ...st, status: "failed" as const, error: event.error }
                : st,
            ),
          };
        });
      }),
    );

    unsubs.push(
      boardSSE.on("cost_update", (data) => {
        const event = data as {
          taskId: string;
          currentTokens: number;
          currentUsd: number;
        };
        if (event.taskId !== taskId) {return;}
        setTask((prev) => {
          if (!prev) {return prev;}
          return {
            ...prev,
            actualCost: { tokens: event.currentTokens, usd: event.currentUsd },
          };
        });
      }),
    );

    unsubs.push(
      boardSSE.on("task_column_changed", (data) => {
        const event = data as { taskId: string; to: string };
        if (event.taskId !== taskId) {return;}
        setTask((prev) => {
          if (!prev) {return prev;}
          return { ...prev, column: event.to as KanbanTask["column"] };
        });
      }),
    );

    // Agent actions get added to the activity feed
    unsubs.push(
      boardSSE.on("agent_action", (data) => {
        const event = data as {
          taskId: string;
          agentName: string;
          action: string;
          detail: string;
        };
        if (event.taskId !== taskId) {return;}
        setActivity((prev) => [
          ...prev,
          {
            id: `live-${Date.now()}`,
            taskId: event.taskId,
            timestamp: Date.now(),
            type: "agent_action" as const,
            agentName: event.agentName,
            action: event.action,
            detail: event.detail,
          },
        ]);
      }),
    );

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [taskId]);

  return { task, activity, loading, error, refresh: fetchDetail };
}
