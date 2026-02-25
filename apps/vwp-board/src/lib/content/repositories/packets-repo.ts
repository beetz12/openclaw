import type { DatabaseSync } from "node:sqlite";
import type { PacketInput } from "../schemas";

export class PacketsRepo {
  constructor(private readonly db: DatabaseSync) {}

  upsert(packet: PacketInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO content_packets (
          id, created_at, source_run_id, packet_type, title, summary, recommendations, evidence,
          decision_rationale, debug_notes, next_action, artifact_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_run_id = excluded.source_run_id,
          packet_type = excluded.packet_type,
          title = excluded.title,
          summary = excluded.summary,
          recommendations = excluded.recommendations,
          evidence = excluded.evidence,
          decision_rationale = excluded.decision_rationale,
          debug_notes = excluded.debug_notes,
          next_action = excluded.next_action,
          artifact_path = excluded.artifact_path`
      )
      .run(
        packet.id,
        packet.created_at ?? now,
        packet.source_run_id,
        packet.packet_type,
        packet.title,
        packet.summary ?? null,
        packet.recommendations === undefined ? null : JSON.stringify(packet.recommendations),
        packet.evidence === undefined ? null : JSON.stringify(packet.evidence),
        packet.decision_rationale ?? null,
        packet.debug_notes === undefined ? null : JSON.stringify(packet.debug_notes),
        packet.next_action ?? null,
        packet.artifact_path ?? null
      );
  }

  list(params: { type?: string; limit: number; offset: number }): Record<string, unknown>[] {
    const where = params.type ? "WHERE packet_type = ?" : "";
    const stmt = this.db.prepare(
      `SELECT * FROM content_packets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    );
    if (params.type) {
      return stmt.all(params.type, params.limit, params.offset) as Record<string, unknown>[];
    }
    return stmt.all(params.limit, params.offset) as Record<string, unknown>[];
  }
}
