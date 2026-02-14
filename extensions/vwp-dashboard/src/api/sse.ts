import type { SSEEvent } from "./types.js";
import { api } from "./client.js";

export type SSEStatus = "connecting" | "connected" | "disconnected";
export type SSEEventCallback = (event: SSEEvent) => void;
export type SSEStatusCallback = (status: SSEStatus) => void;

const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30_000;

export class VwpSSEClient {
  private _eventSource: EventSource | null = null;
  private _eventListeners: SSEEventCallback[] = [];
  private _statusListeners: SSEStatusCallback[] = [];
  private _status: SSEStatus = "disconnected";
  private _reconnectMs = MIN_RECONNECT_MS;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _intentionalClose = false;

  get status(): SSEStatus {
    return this._status;
  }

  connect(): void {
    this._intentionalClose = false;
    this._connect();
  }

  disconnect(): void {
    this._intentionalClose = true;
    this._clearReconnectTimer();
    this._close();
  }

  onEvent(cb: SSEEventCallback): () => void {
    this._eventListeners.push(cb);
    return () => {
      const idx = this._eventListeners.indexOf(cb);
      if (idx >= 0) this._eventListeners.splice(idx, 1);
    };
  }

  onStatus(cb: SSEStatusCallback): () => void {
    this._statusListeners.push(cb);
    return () => {
      const idx = this._statusListeners.indexOf(cb);
      if (idx >= 0) this._statusListeners.splice(idx, 1);
    };
  }

  private _setStatus(status: SSEStatus) {
    if (this._status === status) return;
    this._status = status;
    for (const cb of this._statusListeners) cb(status);
  }

  private _connect() {
    this._close();
    this._setStatus("connecting");

    const base = api.baseUrl || window.location.origin;
    const url = new URL("/vwp/events", base);
    // Pass token as query param since EventSource doesn't support custom headers
    if (api.token) {
      url.searchParams.set("token", api.token);
    }

    const es = new EventSource(url.toString());
    this._eventSource = es;

    es.addEventListener("connected", (e) => {
      this._reconnectMs = MIN_RECONNECT_MS;
      this._setStatus("connected");
      try {
        const data = JSON.parse((e as MessageEvent).data) as { ts: number };
        this._emit({ type: "connected", ts: data.ts });
      } catch {
        this._emit({ type: "connected", ts: Date.now() });
      }
    });

    const eventTypes = [
      "message_queued",
      "message_approved",
      "message_rejected",
      "message_auto_approved",
    ] as const;

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data) as SSEEvent;
          this._emit(data);
        } catch {
          // skip malformed events
        }
      });
    }

    es.onerror = () => {
      this._close();
      this._setStatus("disconnected");
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
    };
  }

  private _close() {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
  }

  private _emit(event: SSEEvent) {
    for (const cb of this._eventListeners) {
      cb(event);
    }
  }

  private _scheduleReconnect() {
    this._clearReconnectTimer();
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._reconnectMs = Math.min(this._reconnectMs * 2, MAX_RECONNECT_MS);
      this._connect();
    }, this._reconnectMs);
  }

  private _clearReconnectTimer() {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}

/** Singleton SSE client */
export const sseClient = new VwpSSEClient();
