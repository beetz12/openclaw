import type { DatabaseSync } from "node:sqlite";
import type { IdeaInput } from "../schemas";

export class IdeasRepo {
  constructor(private readonly db: DatabaseSync) {}

  getById(id: string): Record<string, unknown> | undefined {
    return (this.db.prepare("SELECT * FROM content_ideas WHERE id = ?").get(id) as Record<string, unknown>) ?? undefined;
  }

  upsert(idea: IdeaInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO content_ideas (
          id, created_at, updated_at, source_run_id, title, topic_key, status, priority_rank,
          score_total, score_demand, score_novelty, score_authority_fit, score_difficulty,
          score_sub_conversion, rationale_summary, debug_notes, recommended_next_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          updated_at = excluded.updated_at,
          source_run_id = excluded.source_run_id,
          title = excluded.title,
          topic_key = excluded.topic_key,
          status = excluded.status,
          priority_rank = excluded.priority_rank,
          score_total = excluded.score_total,
          score_demand = excluded.score_demand,
          score_novelty = excluded.score_novelty,
          score_authority_fit = excluded.score_authority_fit,
          score_difficulty = excluded.score_difficulty,
          score_sub_conversion = excluded.score_sub_conversion,
          rationale_summary = excluded.rationale_summary,
          debug_notes = excluded.debug_notes,
          recommended_next_action = excluded.recommended_next_action`
      )
      .run(
        idea.id,
        idea.created_at ?? now,
        idea.updated_at ?? now,
        idea.source_run_id,
        idea.title,
        idea.topic_key ?? null,
        idea.status,
        idea.priority_rank ?? null,
        idea.score_total ?? null,
        idea.score_demand,
        idea.score_novelty,
        idea.score_authority_fit,
        idea.score_difficulty,
        idea.score_sub_conversion,
        idea.rationale_summary ?? null,
        idea.debug_notes === undefined ? null : JSON.stringify(idea.debug_notes),
        idea.recommended_next_action ?? null
      );
  }

  updateStatus(id: string, status: string): void {
    this.db
      .prepare("UPDATE content_ideas SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  }

  list(params: { status?: string; limit: number; offset: number }): Record<string, unknown>[] {
    const where = params.status ? "WHERE status = ?" : "";
    const stmt = this.db.prepare(
      `SELECT * FROM content_ideas ${where} ORDER BY COALESCE(priority_rank, 999999) ASC, score_total DESC, created_at DESC LIMIT ? OFFSET ?`
    );
    if (params.status) {
      return stmt.all(params.status, params.limit, params.offset) as Record<string, unknown>[];
    }
    return stmt.all(params.limit, params.offset) as Record<string, unknown>[];
  }
}
