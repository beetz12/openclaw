import type { ServerResponse } from "node:http";
import { EventEmitter } from "node:events";

export type ApprovalEvent =
  | { type: "message_queued"; message: unknown }
  | { type: "message_approved"; id: string; content: string }
  | { type: "message_rejected"; id: string }
  | { type: "message_auto_approved"; message: unknown }
  | { type: "task_action_queued"; action: unknown }
  | { type: "task_action_approved"; id: string }
  | { type: "task_action_rejected"; id: string };

const MAX_SSE_CONNECTIONS = 5;
const HEARTBEAT_INTERVAL_MS = 30_000;

export class ApprovalSSE {
  private emitter = new EventEmitter();
  private connections = new Set<ServerResponse>();

  get connectionCount(): number {
    return this.connections.size;
  }

  emit(event: ApprovalEvent): void {
    this.emitter.emit("approval", event);
  }

  addConnection(res: ServerResponse): boolean {
    if (this.connections.size >= MAX_SSE_CONNECTIONS) {
      return false;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

    this.connections.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        cleanup();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const onEvent = (event: ApprovalEvent) => {
      try {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        cleanup();
      }
    };

    const cleanup = () => {
      clearInterval(heartbeat);
      this.emitter.removeListener("approval", onEvent);
      this.connections.delete(res);
    };

    this.emitter.on("approval", onEvent);
    res.on("close", cleanup);

    return true;
  }

  closeAll(): void {
    for (const res of this.connections) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
    this.connections.clear();
    this.emitter.removeAllListeners();
  }
}
