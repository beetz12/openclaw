/**
 * GatewayClient — connects to the OpenClaw Gateway via WebSocket with
 * challenge-response authentication.
 *
 * Implements the OpenClaw RequestFrame protocol:
 *   Requests:  { type: "req", id: uuid, method: string, params: object }
 *   Responses: { type: "res", id: uuid, ok: boolean, payload: unknown, error?: { message } }
 *   Events:    { type: "event", event: string, params?: unknown }
 */

import { EventEmitter } from "node:events";

const DEFAULT_URL = process.env.OPENCLAW_GATEWAY_URL || "ws://127.0.0.1:18789";
const DEFAULT_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";

const CONNECTION_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_MS = 10_000;

/** Minimal interface for the WebSocket instance we require. */
export interface IWebSocket {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** Constructor shape for the WebSocket factory. */
export type WebSocketFactory = (url: string) => IWebSocket;

export interface GatewayClientOptions {
  url?: string;
  token?: string;
  /** Inject a custom WebSocket factory (for testing). */
  createWebSocket?: WebSocketFactory;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const WS_OPEN = 1;
const WS_CONNECTING = 0;

export class GatewayClient extends EventEmitter {
  private ws: IWebSocket | null = null;
  private token: string;
  private url: string;
  private createWebSocket: WebSocketFactory;
  private pendingRequests = new Map<string, PendingRequest>();
  private connected = false;
  private authenticated = false;
  private connecting: Promise<void> | null = null;
  private autoReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(urlOrOpts?: string | GatewayClientOptions, token?: string) {
    super();

    if (typeof urlOrOpts === "object" && urlOrOpts !== null) {
      this.url = urlOrOpts.url ?? DEFAULT_URL;
      this.token = urlOrOpts.token ?? DEFAULT_TOKEN;
      this.createWebSocket =
        urlOrOpts.createWebSocket ?? ((u: string) => new WebSocket(u) as unknown as IWebSocket);
    } else {
      this.url = urlOrOpts ?? DEFAULT_URL;
      this.token = token ?? DEFAULT_TOKEN;
      this.createWebSocket = (u: string) => new WebSocket(u) as unknown as IWebSocket;
    }

    // Prevent Node.js from throwing on unhandled 'error' events.
    this.on("error", () => {});
  }

  // -------------------------------------------------------------------------
  // connect()
  // -------------------------------------------------------------------------

  connect(): Promise<void> {
    // Already connected — nothing to do.
    if (this.connected && this.ws?.readyState === WS_OPEN) {
      return Promise.resolve();
    }

    // Prevent simultaneous connection attempts — return the existing promise.
    if (this.connecting) {
      return this.connecting;
    }

    this.autoReconnect = true;

    this.connecting = new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      try {
        // Clean up any pre-existing WebSocket.
        this.cleanupWS();

        // Build URL with token query parameter.
        const wsUrl = new URL(this.url);
        if (this.token) {
          wsUrl.searchParams.set("token", this.token);
        }

        this.ws = this.createWebSocket(wsUrl.toString());

        // --- Connection timeout ---
        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            // Null out onclose before closing to prevent double-settle.
            if (this.ws) this.ws.onclose = null;
            this.ws?.close();
            this.connected = false;
            this.authenticated = false;
            this.connecting = null;
            this.emit("disconnected");
            settle(() => reject(new Error("Connection timeout")));
          }
        }, CONNECTION_TIMEOUT_MS);

        // --- WebSocket event handlers ---

        this.ws.onopen = () => {
          // Wait for the Gateway to send the challenge event.
        };

        this.ws.onclose = () => {
          clearTimeout(connectionTimeout);
          const wasConnected = this.connected;
          this.connected = false;
          this.authenticated = false;
          this.connecting = null;
          this.emit("disconnected");

          // Auto-reconnect only after a previously successful connection.
          if (this.autoReconnect && wasConnected) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = () => {
          clearTimeout(connectionTimeout);
          if (!this.connected) {
            this.connecting = null;
            settle(() => reject(new Error("Failed to connect to OpenClaw Gateway")));
          }
        };

        this.ws.onmessage = (event: { data: string }) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data, resolve, reject, connectionTimeout);
          } catch {
            // Ignore unparseable messages.
          }
        };
      } catch (err) {
        this.connecting = null;
        settle(() => reject(err));
      }
    });

    return this.connecting;
  }

  // -------------------------------------------------------------------------
  // call<T>()
  // -------------------------------------------------------------------------

  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.connected || !this.authenticated || !this.ws || this.ws.readyState !== WS_OPEN) {
      throw new Error("Not connected to OpenClaw Gateway");
    }

    const id = crypto.randomUUID();
    const message = { type: "req", id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, CALL_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.ws!.send(JSON.stringify(message));
    });
  }

  // -------------------------------------------------------------------------
  // disconnect()
  // -------------------------------------------------------------------------

  disconnect(): void {
    this.autoReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Reject all pending requests.
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Disconnected"));
      this.pendingRequests.delete(id);
    }

    if (this.ws) {
      this.ws.onclose = null; // Prevent the close handler from triggering reconnect.
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.authenticated = false;
    this.connecting = null;
  }

  // -------------------------------------------------------------------------
  // isConnected()
  // -------------------------------------------------------------------------

  isConnected(): boolean {
    return this.connected && this.authenticated && this.ws?.readyState === WS_OPEN;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private handleMessage(
    data: Record<string, unknown>,
    connectResolve: (value: void) => void,
    connectReject: (error: Error) => void,
    connectionTimeout: ReturnType<typeof setTimeout>,
  ): void {
    // --- Challenge-response during connect ---
    if (data.type === "event" && data.event === "connect.challenge") {
      const requestId = crypto.randomUUID();
      const connectReq = {
        type: "req",
        id: requestId,
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "vwp-dispatch",
            version: "1.0.0",
            platform: "node",
            mode: "agent",
          },
          auth: {
            token: this.token,
          },
        },
      };

      // Register a pending request for the auth handshake.
      const timer = setTimeout(() => {
        // Auth handshake timeout is covered by the connection timeout.
      }, CONNECTION_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(connectionTimeout);
          this.connected = true;
          this.authenticated = true;
          this.connecting = null;
          this.emit("connected");
          connectResolve();
        },
        reject: (error: Error) => {
          clearTimeout(connectionTimeout);
          this.connecting = null;
          this.ws?.close();
          connectReject(new Error(`Authentication failed: ${error.message}`));
        },
        timer,
      });

      this.ws!.send(JSON.stringify(connectReq));
      return;
    }

    // --- RPC response ---
    if (data.type === "res" && data.id !== undefined) {
      const requestId = data.id as string;
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(requestId);

        if (data.ok === false && data.error) {
          const errObj = data.error as { message: string };
          pending.reject(new Error(errObj.message));
        } else {
          pending.resolve(data.payload);
        }
        return;
      }
    }

    // --- Gateway events (forwarded to listeners) ---
    if (data.type === "event" && data.event) {
      this.emit(data.event as string, data.params);
    }
  }

  private cleanupWS(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      if (this.ws.readyState === WS_OPEN || this.ws.readyState === WS_CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.autoReconnect) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.autoReconnect) return;

      try {
        await this.connect();
      } catch {
        // Reconnect failed — schedule another attempt.
        this.scheduleReconnect();
      }
    }, RECONNECT_DELAY_MS);
  }
}
