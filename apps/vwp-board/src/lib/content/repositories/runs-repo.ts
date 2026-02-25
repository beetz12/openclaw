import type { DatabaseSync } from "node:sqlite";
import type { RunInput } from "../schemas";

export class RunsRepo {
  constructor(private readonly db: DatabaseSync) {}

  getById(id: string): Record<string, unknown> | undefined {
    return (this.db.prepare("SELECT * FROM content_runs WHERE id = ?").get(id) as Record<string, unknown>) ?? undefined;
  }

  upsert(run: RunInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO content_runs (
          id, created_at, updated_at, completed_at, trigger_type, trigger_ref, status,
          objective, tool_used, why_chosen, result_summary, improvement_needed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          updated_at = excluded.updated_at,
          completed_at = COALESCE(excluded.completed_at, content_runs.completed_at),
          trigger_type = excluded.trigger_type,
          trigger_ref = excluded.trigger_ref,
          status = excluded.status,
          objective = excluded.objective,
          tool_used = excluded.tool_used,
          why_chosen = excluded.why_chosen,
          result_summary = excluded.result_summary,
          improvement_needed = excluded.improvement_needed`
      )
      .run(
        run.id,
        run.created_at ?? now,
        now,
        run.completed_at ?? null,
        run.trigger_type,
        run.trigger_ref ?? null,
        run.status,
        run.objective ?? null,
        run.tool_used ?? null,
        run.why_chosen ?? null,
        run.result_summary ?? null,
        run.improvement_needed ?? null
      );
  }

  list(params: { trigger_type?: string; limit: number; offset: number }): Record<string, unknown>[] {
    const where = params.trigger_type ? "WHERE trigger_type = ?" : "";
    const stmt = this.db.prepare(
      `SELECT * FROM content_runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    );

    if (params.trigger_type) {
      return stmt.all(params.trigger_type, params.limit, params.offset) as Record<string, unknown>[];
    }
    return stmt.all(params.limit, params.offset) as Record<string, unknown>[];
  }
}
