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
}
