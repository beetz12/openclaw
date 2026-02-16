"use client";

import { useEffect } from "react";
import { boardSSE } from "@/lib/sse-client";
import { useBoardStore, type KanbanSSEEvent } from "@/store/board-store";

/**
 * Manages the SSE connection lifecycle.
 * Connects on mount, disconnects on unmount.
 * Pipes all events to the board store's handleSSEEvent.
 */
export function useSse(): void {
  const handleSSEEvent = useBoardStore((s) => s.handleSSEEvent);
  const setSseConnected = useBoardStore((s) => s.setSseConnected);
  const setSseStale = useBoardStore((s) => s.setSseStale);

  useEffect(() => {
    boardSSE.connect();

    const unsubConnected = boardSSE.on("connected", () => {
      setSseConnected(true);
    });

    const unsubStale = boardSSE.onStaleChange((stale) => {
      setSseStale(stale);
    });

    // Subscribe to all events via wildcard
    const unsubAll = boardSSE.on("*", (data) => {
      const event = data as KanbanSSEEvent;
      if (event && typeof event === "object" && "type" in event) {
        try {
          handleSSEEvent(event);
        } catch {
          // Don't let one event break the SSE pipeline
        }
      }
    });

    return () => {
      unsubConnected();
      unsubStale();
      unsubAll();
      boardSSE.disconnect();
      setSseConnected(false);
      setSseStale(false);
    };
  }, [handleSSEEvent, setSseConnected, setSseStale]);
}
