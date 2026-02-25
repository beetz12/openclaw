"use client";

import { useEffect } from "react";
import { useBoardStore } from "@/store/board-store";

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

  // Fetch board data on mount
  useEffect(() => {
    void fetchBoard();
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
