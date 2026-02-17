/**
 * Kanban SSE helpers — emits Kanban-specific events through the existing
 * ApprovalSSE infrastructure.
 */

import type { KanbanSSEEvent } from "../vwp-dispatch/kanban-types.js";
import type { ApprovalSSE } from "./sse.js";

export type { KanbanSSEEvent };

/**
 * Emit a Kanban event through the shared SSE connection.
 * The ApprovalEvent union already includes KanbanSSEEvent types.
 */
export function emitKanbanEvent(sse: ApprovalSSE, event: KanbanSSEEvent): void {
  sse.emit(event);
}
