"use client";

const TOKEN_KEY = "vwp-dashboard-token";
const BASE_URL_KEY = "vwp-dashboard-base-url";

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

type Handler = (data: unknown) => void;

export class BoardSSEClient {
  private _source: EventSource | null = null;
  private _handlers = new Map<string, Set<Handler>>();
  private _retryMs = INITIAL_RETRY_MS;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _intentionalClose = false;

  get connected(): boolean {
    return (
      typeof EventSource !== "undefined" &&
      this._source?.readyState === EventSource.OPEN
    );
  }

  connect(baseUrl?: string): void {
    if (this._source) {return;}
    if (typeof EventSource === "undefined") {return;} // SSR guard

    this._intentionalClose = false;
    const base =
      baseUrl ??
      (typeof localStorage !== "undefined"
        ? localStorage.getItem(BASE_URL_KEY)
        : null) ??
      window.location.origin;
    const token =
      typeof localStorage !== "undefined"
        ? (localStorage.getItem(TOKEN_KEY) ?? "")
        : "";

    // EventSource does not support custom headers, so pass the token
    // as a query parameter. The backend accepts both Bearer header and
    // ?token= for SSE connections.
    const url = new URL("/vwp/events", base);
    if (token) {
      url.searchParams.set("token", token);
    }

    const source = new EventSource(url.toString());
    this._source = source;

    source.onopen = () => {
      this._retryMs = INITIAL_RETRY_MS;
    };

    source.onerror = () => {
      this._cleanup();
      if (!this._intentionalClose) {
        this._scheduleReconnect(baseUrl);
      }
    };

    // Listen for typed events. The server sends events with
    // `event: <type>` so we listen on specific event names.
    // Also listen for generic `message` events as a fallback.
    source.onmessage = (ev) => {
      this._dispatch(ev);
    };

    // Register listeners for known Kanban event types
    const eventTypes = [
      "connected",
      "task_column_changed",
      "subtask_started",
      "subtask_completed",
      "subtask_failed",
      "agent_action",
      "cost_update",
      "approval_required",
      "message_queued",
      "message_approved",
      "message_rejected",
      "message_auto_approved",
      "task_action_queued",
      "task_action_approved",
      "task_action_rejected",
      // Phase 5A: Agent status events
      "agent_status_changed",
      "agent_connected",
      "agent_disconnected",
      "agent_log",
      "gateway_status",
    ];

    for (const type of eventTypes) {
      source.addEventListener(type, (ev) => {
        this._dispatch(ev);
      });
    }
  }

  disconnect(): void {
    this._intentionalClose = true;
    this._cleanup();
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }

  /**
   * Subscribe to events of a given type.
   * Returns an unsubscribe function.
   */
  on(eventType: string, handler: Handler): () => void {
    let set = this._handlers.get(eventType);
    if (!set) {
      set = new Set();
      this._handlers.set(eventType, set);
    }
    set.add(handler);

    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this._handlers.delete(eventType);
      }
    };
  }

  private _dispatch(ev: MessageEvent): void {
    let data: unknown;
    try {
      data = JSON.parse(ev.data as string);
    } catch {
      return;
    }

    const eventType =
      (data as { type?: string }).type ?? ev.type ?? "message";

    // Notify type-specific handlers
    const typeHandlers = this._handlers.get(eventType);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(data);
        } catch {
          // Don't let one handler break others
        }
      }
    }

    // Also notify wildcard handlers
    const wildcardHandlers = this._handlers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(data);
        } catch {
          // Don't let one handler break others
        }
      }
    }
  }

  private _cleanup(): void {
    if (this._source) {
      this._source.close();
      this._source = null;
    }
  }

  private _scheduleReconnect(baseUrl?: string): void {
    if (this._retryTimer) {return;}

    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this.connect(baseUrl);
    }, this._retryMs);

    // Exponential backoff
    this._retryMs = Math.min(this._retryMs * 2, MAX_RETRY_MS);
  }
}

/** Singleton SSE client instance */
export const boardSSE = new BoardSSEClient();
