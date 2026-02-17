"use client";

import { useEffect } from "react";
import { useBoardStore } from "@/store/board-store";
import { useSse } from "./useSse";

/**
 * Main board hook. Fetches the board on mount, connects SSE,
 * and returns store state plus actions.
 */
export function useBoard() {
  const columns = useBoardStore((s) => s.columns);
  const loading = useBoardStore((s) => s.loading);
  const error = useBoardStore((s) => s.error);
  const sseConnected = useBoardStore((s) => s.sseConnected);
  const fetchBoard = useBoardStore((s) => s.fetchBoard);
  const moveTask = useBoardStore((s) => s.moveTask);
  const reorderTask = useBoardStore((s) => s.reorderTask);
  const submitGoal = useBoardStore((s) => s.submitGoal);
  const confirmTask = useBoardStore((s) => s.confirmTask);

  // Start SSE connection
  useSse();

  // Fetch board data on mount
  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  return {
    columns,
    loading,
    error,
    sseConnected,
    moveTask,
    reorderTask,
    submitGoal,
    confirmTask,
    refresh: fetchBoard,
  };
}
