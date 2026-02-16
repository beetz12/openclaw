import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import type { KanbanSSEEvent } from "../vwp-dispatch/kanban-types.js";

export type ApprovalEvent =
  | { type: "message_queued"; message: unknown }
  | { type: "message_approved"; id: string; content: string }
  | { type: "message_rejected"; id: string }
  | { type: "message_auto_approved"; message: unknown }
  | { type: "task_action_queued"; action: unknown }
  | { type: "task_action_approved"; id: string }
  | { type: "task_action_rejected"; id: string }
  | KanbanSSEEvent;

const MAX_SSE_CONNECTIONS = 5;
const HEARTBEAT_INTERVAL_MS = 30_000;

export class EventBuffer {
  private events: Array<{ id: number; event: { type: string; data: string } }> = [];
  private nextId = 1;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  add(event: { type: string; data: string }): number {
    const id = this.nextId++;
    this.events.push({ id, event });
    if (this.events.length > this.capacity) {
      this.events.shift();
    }
    return id;
  }

  replaySince(lastId: number): Array<{ id: number; event: { type: string; data: string } }> {
    return this.events.filter((e) => e.id > lastId);
  }
}

export class ApprovalSSE {
  private emitter = new EventEmitter();
  private connections = new Set<ServerResponse>();
  private buffer = new EventBuffer(500);

  get connectionCount(): number {
    return this.connections.size;
  }

  emit(event: ApprovalEvent): void {
    // Buffer the event for replay and get the event ID
    const eventId = this.buffer.add({ type: event.type, data: JSON.stringify(event) });
    this.emitter.emit("approval", { event, eventId });
  }

  addConnection(res: ServerResponse, req?: IncomingMessage): boolean {
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

    // Replay missed events if Last-Event-ID header is provided
    if (req) {
      const lastEventId = req.headers["last-event-id"];
      if (lastEventId) {
        const lastId = parseInt(String(lastEventId), 10);
        if (!isNaN(lastId)) {
          const missedEvents = this.buffer.replaySince(lastId);
          for (const { id, event } of missedEvents) {
            try {
              res.write(`id: ${id}\nevent: ${event.type}\ndata: ${event.data}\n\n`);
            } catch {
              // Connection might have closed during replay
              return false;
            }
          }
        }
      }
    }

    this.connections.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        cleanup();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const onEvent = (payload: { event: ApprovalEvent; eventId: number }) => {
      try {
        res.write(
          `id: ${payload.eventId}\nevent: ${payload.event.type}\ndata: ${JSON.stringify(payload.event)}\n\n`,
        );
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
