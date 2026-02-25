import type { DatabaseSync } from "node:sqlite";
import type { ToolEventInput } from "../schemas";

export class ToolsRepo {
  constructor(private readonly db: DatabaseSync) {}

  insertUsageEvent(event: ToolEventInput): void {
    this.db
      .prepare(
        `INSERT INTO tool_usage_events (
          id, created_at, run_id, tool_name, task_type, result_quality, reliability, time_saved_est
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`
      )
      .run(
        event.id,
        event.created_at ?? new Date().toISOString(),
        event.run_id,
        event.tool_name,
        event.task_type ?? null,
        event.result_quality ?? null,
        event.reliability ?? null,
        event.time_saved_est ?? null
      );
  }
}
