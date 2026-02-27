import type { DatabaseSync } from "node:sqlite";

export type ContentActionInput = {
  id: string;
  created_at?: string;
  idea_id: string;
  actor: string;
  action_type: string;
  note?: string | null;
};

export class ActionsRepo {
  constructor(private readonly db: DatabaseSync) {}

  insert(action: ContentActionInput): void {
    this.db
      .prepare(
        `INSERT INTO content_actions (id, created_at, idea_id, actor, action_type, note)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`
      )
      .run(
        action.id,
        action.created_at ?? new Date().toISOString(),
        action.idea_id,
        action.actor,
        action.action_type,
        action.note ?? null
      );
  }

  list(params: { ideaId?: string; limit?: number; offset?: number }): Record<string, unknown>[] {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    if (params.ideaId) {
      return this.db
        .prepare(
          `SELECT id, created_at, idea_id, actor, action_type, note
           FROM content_actions
           WHERE idea_id = ?
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(params.ideaId, limit, offset) as Record<string, unknown>[];
    }

    return this.db
      .prepare(
        `SELECT id, created_at, idea_id, actor, action_type, note
         FROM content_actions
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as Record<string, unknown>[];
  }
}
