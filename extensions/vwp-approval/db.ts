import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type PendingMessage = {
  id: string;
  to: string;
  content: string;
  edited_content: string | null;
  channel: string;
  session_key: string;
  agent_id: string;
  created_at: number;
  status: "pending" | "approved" | "rejected" | "auto_approved";
};

export type ApprovalStats = {
  channel: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  auto_approved: number;
};

export type PaginationResult<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
};

export type TaskActionType =
  | "email_send"
  | "crm_update"
  | "social_post"
  | "calendar_update"
  | "document_edit"
  | "other";

export type TaskAction = {
  id: string;
  task_id: string;
  action_type: TaskActionType;
  content: string;
  status: "pending" | "approved" | "rejected";
  created_at: number;
  resolved_at: number | null;
};

export class ApprovalDB {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_messages (
        id TEXT PRIMARY KEY,
        "to" TEXT NOT NULL,
        content TEXT NOT NULL,
        edited_content TEXT,
        channel TEXT NOT NULL DEFAULT '',
        session_key TEXT NOT NULL DEFAULT '',
        agent_id TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      )
    `);
    // Index on status for fast queue lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pending_messages_status
        ON pending_messages (status)
    `);
    // Composite index for channel + status filtering with ordering
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pending_messages_status_channel
        ON pending_messages (status, channel, created_at)
    `);

    // Task actions table — queues external actions for approval
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_actions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_actions_status
        ON task_actions (status, created_at)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_actions_task_id
        ON task_actions (task_id, status)
    `);
  }

  addPending(params: {
    to: string;
    content: string;
    channel?: string;
    sessionKey?: string;
    agentId?: string;
    status?: "pending" | "auto_approved";
  }): PendingMessage {
    const id = randomUUID();
    const now = Date.now();
    const status = params.status ?? "pending";
    const stmt = this.db.prepare(
      `INSERT INTO pending_messages (id, "to", content, edited_content, channel, session_key, agent_id, created_at, status)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      id,
      params.to,
      params.content,
      params.channel ?? "",
      params.sessionKey ?? "",
      params.agentId ?? "",
      now,
      status,
    );
    return {
      id,
      to: params.to,
      content: params.content,
      edited_content: null,
      channel: params.channel ?? "",
      session_key: params.sessionKey ?? "",
      agent_id: params.agentId ?? "",
      created_at: now,
      status,
    };
  }

  getPending(opts?: {
    channel?: string;
    limit?: number;
    offset?: number;
  }): PaginationResult<PendingMessage> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    let countSql: string;
    let dataSql: string;
    let countParams: unknown[];
    let dataParams: unknown[];

    if (opts?.channel) {
      countSql = `SELECT COUNT(*) as total FROM pending_messages WHERE status = 'pending' AND channel = ?`;
      countParams = [opts.channel];
      dataSql = `SELECT id, "to", content, edited_content, channel, session_key, agent_id, created_at, status
         FROM pending_messages WHERE status = 'pending' AND channel = ?
         ORDER BY created_at ASC LIMIT ? OFFSET ?`;
      dataParams = [opts.channel, limit, offset];
    } else {
      countSql = `SELECT COUNT(*) as total FROM pending_messages WHERE status = 'pending'`;
      countParams = [];
      dataSql = `SELECT id, "to", content, edited_content, channel, session_key, agent_id, created_at, status
         FROM pending_messages WHERE status = 'pending'
         ORDER BY created_at ASC LIMIT ? OFFSET ?`;
      dataParams = [limit, offset];
    }

    const countResult = this.db.prepare(countSql).get(...countParams) as { total: number };
    const items = this.db.prepare(dataSql).all(...dataParams) as PendingMessage[];

    return { items, total: countResult.total, offset, limit };
  }

  getById(id: string): PendingMessage | undefined {
    const stmt = this.db.prepare(
      `SELECT id, "to", content, edited_content, channel, session_key, agent_id, created_at, status
       FROM pending_messages WHERE id = ?`,
    );
    return stmt.get(id) as PendingMessage | undefined;
  }

  approve(id: string, editedContent?: string): boolean {
    if (editedContent !== undefined) {
      const stmt = this.db.prepare(
        `UPDATE pending_messages SET status = 'approved', edited_content = ? WHERE id = ? AND status = 'pending'`,
      );
      const result = stmt.run(editedContent, id);
      return result.changes > 0;
    }
    const stmt = this.db.prepare(
      `UPDATE pending_messages SET status = 'approved' WHERE id = ? AND status = 'pending'`,
    );
    const result = stmt.run(id);
    return result.changes > 0;
  }

  reject(id: string): boolean {
    const stmt = this.db.prepare(
      `UPDATE pending_messages SET status = 'rejected' WHERE id = ? AND status = 'pending'`,
    );
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getStats(): ApprovalStats[] {
    const stmt = this.db.prepare(`
      SELECT
        channel,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'auto_approved' THEN 1 ELSE 0 END) as auto_approved
      FROM pending_messages
      GROUP BY channel
    `);
    return stmt.all() as ApprovalStats[];
  }

  // -- Task action methods ---------------------------------------------------

  insertTaskAction(params: {
    taskId: string;
    actionType: TaskActionType;
    content: string;
  }): TaskAction {
    const id = randomUUID();
    const now = Date.now();
    const stmt = this.db.prepare(
      `INSERT INTO task_actions (id, task_id, action_type, content, status, created_at, resolved_at)
       VALUES (?, ?, ?, ?, 'pending', ?, NULL)`,
    );
    stmt.run(id, params.taskId, params.actionType, params.content, now);
    return {
      id,
      task_id: params.taskId,
      action_type: params.actionType,
      content: params.content,
      status: "pending",
      created_at: now,
      resolved_at: null,
    };
  }

  getTaskActions(taskId: string): TaskAction[] {
    const stmt = this.db.prepare(
      `SELECT id, task_id, action_type, content, status, created_at, resolved_at
       FROM task_actions WHERE task_id = ? ORDER BY created_at ASC`,
    );
    return stmt.all(taskId) as TaskAction[];
  }

  getPendingTaskActions(): TaskAction[] {
    const stmt = this.db.prepare(
      `SELECT id, task_id, action_type, content, status, created_at, resolved_at
       FROM task_actions WHERE status = 'pending' ORDER BY created_at ASC`,
    );
    return stmt.all() as TaskAction[];
  }

  getTaskActionById(id: string): TaskAction | undefined {
    const stmt = this.db.prepare(
      `SELECT id, task_id, action_type, content, status, created_at, resolved_at
       FROM task_actions WHERE id = ?`,
    );
    return stmt.get(id) as TaskAction | undefined;
  }

  approveTaskAction(id: string): boolean {
    const now = Date.now();
    const stmt = this.db.prepare(
      `UPDATE task_actions SET status = 'approved', resolved_at = ? WHERE id = ? AND status = 'pending'`,
    );
    const result = stmt.run(now, id);
    return result.changes > 0;
  }

  rejectTaskAction(id: string): boolean {
    const now = Date.now();
    const stmt = this.db.prepare(
      `UPDATE task_actions SET status = 'rejected', resolved_at = ? WHERE id = ? AND status = 'pending'`,
    );
    const result = stmt.run(now, id);
    return result.changes > 0;
  }
}
