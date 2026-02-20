"use client";

import { useEffect } from "react";
import { boardSSE } from "@/lib/sse-client";
import { useBoardStore, type KanbanSSEEvent } from "@/store/board-store";
import { useChatStore } from "@/store/chat-store";
import { useCoworkStore } from "@/store/cowork-store";
import { KanbanApiClient } from "@/lib/api-client";

const CHAT_EVENT_TYPES = new Set([
  "chat_message",
  "chat_stream_token",
  "chat_task_dispatched",
  "chat_intent_clarify",
  "chat_team_suggest",
  "chat_thinking",
]);

const COWORK_EVENT_TYPES = new Set([
  "cowork_started",
  "cowork_text",
  "cowork_tool_use",
  "cowork_tool_result",
  "cowork_completed",
  "cowork_error",
  "cowork_approval_needed",
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
  const handleCoworkEvent = useCoworkStore((s) => s.handleCoworkEvent);

  useEffect(() => {
    // Auto-bootstrap token/base URL from server-side env if localStorage is empty.
    // This avoids "Gateway not running" false negatives when the gateway is up
    // but the dashboard has no auth token yet.
    const bootstrapPromise = (async () => {
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        if (!res.ok) {return;}
        const cfg = (await res.json()) as { gatewayToken?: string; hasToken?: boolean };
        if (cfg?.hasToken && cfg.gatewayToken && typeof window !== "undefined") {
          const existing = localStorage.getItem("vwp-dashboard-token");
          if (!existing) {
            localStorage.setItem("vwp-dashboard-token", cfg.gatewayToken);
          }
        }
        if (typeof window !== "undefined") {
          const existingBase = localStorage.getItem("vwp-dashboard-base-url");
          if (!existingBase) {
            localStorage.setItem("vwp-dashboard-base-url", window.location.origin);
          }
        }
      } catch {
        // Best-effort bootstrap only.
      }
    })();

    void bootstrapPromise.finally(async () => {
      boardSSE.connect();
      // Also do an immediate status probe so chat can enable even if SSE
      // "connected" event is delayed or unavailable.
      try {
        const api = new KanbanApiClient();
        const { connected } = await api.getChatStatus();
        setGatewayConnected(connected);
      } catch {
        setGatewayConnected(false);
      }
    });

    const unsubConnected = boardSSE.on("connected", () => {
      setSseConnected(true);
      // Fetch actual gateway connection status from backend
      const api = new KanbanApiClient();
      api.getChatStatus().then(({ connected }) => {
        setGatewayConnected(connected);
      }).catch(() => {
        // If we can't reach the status endpoint, assume disconnected
        setGatewayConnected(false);
      });
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

        // Forward cowork events to the cowork store
        if (COWORK_EVENT_TYPES.has(event.type)) {
          try {
            handleCoworkEvent(event);
          } catch {
            // Don't let one event break the pipeline
          }
        }

        // Sync gateway_status to chat store
        if (event.type === "gateway_status") {
          setGatewayConnected((event as unknown as { connected: boolean }).connected);
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
  }, [handleSSEEvent, setSseConnected, setSseStale, handleChatSSEEvent, setGatewayConnected, handleCoworkEvent]);
}
