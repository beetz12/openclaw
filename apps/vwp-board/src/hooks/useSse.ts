"use client";

import { useEffect } from "react";
import { boardSSE } from "@/lib/sse-client";
import { useBoardStore, type KanbanSSEEvent } from "@/store/board-store";
import { useChatStore } from "@/store/chat-store";

const CHAT_EVENT_TYPES = new Set([
  "chat_message",
  "chat_stream_token",
  "chat_task_dispatched",
  "chat_intent_clarify",
  "chat_team_suggest",
]);

/**
 * Manages the SSE connection lifecycle.
 * Connects on mount, disconnects on unmount.
 * Pipes board events to board store and chat events to chat store.
 */
export function useSse(): void {
  const handleSSEEvent = useBoardStore((s) => s.handleSSEEvent);
  const setSseConnected = useBoardStore((s) => s.setSseConnected);
  const setSseStale = useBoardStore((s) => s.setSseStale);
  const handleChatSSEEvent = useChatStore((s) => s.handleChatSSEEvent);
  const setGatewayConnected = useChatStore((s) => s.setGatewayConnected);

  useEffect(() => {
    boardSSE.connect();

    const unsubConnected = boardSSE.on("connected", () => {
      setSseConnected(true);
      // SSE connects through the gateway, so if SSE is up the gateway is reachable
      setGatewayConnected(true);
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

        // Forward chat events to the chat store
        if (CHAT_EVENT_TYPES.has(event.type)) {
          try {
            handleChatSSEEvent(event);
          } catch {
            // Don't let one event break the pipeline
          }
        }

        // Sync gateway_status to chat store
        if (event.type === "gateway_status") {
          setGatewayConnected((event as any).connected);
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
  }, [handleSSEEvent, setSseConnected, setSseStale, handleChatSSEEvent, setGatewayConnected]);
}
