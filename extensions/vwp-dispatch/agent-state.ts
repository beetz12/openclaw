/**
 * AgentStateManager — in-memory tracker for agent status.
 *
 * Consumed by the SSE layer to broadcast agent events to the frontend.
 * No persistence; state lives only for the lifetime of the process.
 */

import type { AgentInfo } from "./kanban-types.js";

export interface AgentLogEntry {
  message: string;
  timestamp: number;
}

const MAX_LOGS_PER_AGENT = 100;

const DEFAULT_AGENT: Omit<AgentInfo, "id" | "lastSeen"> = {
  name: "",
  status: "idle",
  taskId: null,
  subtaskId: null,
  lastAction: null,
  error: null,
};

export class AgentStateManager {
  private agents = new Map<string, AgentInfo>();
  private logs = new Map<string, AgentLogEntry[]>();

  /**
   * Create or update an agent.
   * Always refreshes `lastSeen`. Preserves existing fields when not provided.
   */
  upsertAgent(partial: { id: string } & Partial<Omit<AgentInfo, "id" | "lastSeen">>): AgentInfo {
    const existing = this.agents.get(partial.id);
    const base: AgentInfo = existing ?? { ...DEFAULT_AGENT, id: partial.id, lastSeen: 0 };

    const updated: AgentInfo = {
      ...base,
      ...stripUndefined(partial),
      lastSeen: Date.now(),
    };

    this.agents.set(partial.id, updated);

    // Ensure logs array exists for this agent
    if (!this.logs.has(partial.id)) {
      this.logs.set(partial.id, []);
    }

    return updated;
  }

  /** Return all tracked agents. */
  getAll(): AgentInfo[] {
    return [...this.agents.values()];
  }

  /** Return a single agent or undefined. */
  get(id: string): AgentInfo | undefined {
    return this.agents.get(id);
  }

  /** Return agents filtered by taskId. */
  getByTaskId(taskId: string): AgentInfo[] {
    return this.getAll().filter((a) => a.taskId === taskId);
  }

  /** Remove an agent and its logs. Returns the removed agent or null. */
  removeAgent(id: string): AgentInfo | null {
    const agent = this.agents.get(id) ?? null;
    if (agent) {
      this.agents.delete(id);
      this.logs.delete(id);
    }
    return agent;
  }

  /** Remove all agents associated with a task. Also clears their logs. */
  clearForTask(taskId: string): void {
    for (const agent of this.getByTaskId(taskId)) {
      this.agents.delete(agent.id);
      this.logs.delete(agent.id);
    }
  }

  /** Store a log entry for an agent. Caps at 100 entries (drops oldest). */
  addLog(agentId: string, message: string): void {
    const entries = this.logs.get(agentId);
    if (!entries) return; // no-op for nonexistent agent

    entries.push({ message, timestamp: Date.now() });

    if (entries.length > MAX_LOGS_PER_AGENT) {
      // Drop the oldest entries beyond the cap
      entries.splice(0, entries.length - MAX_LOGS_PER_AGENT);
    }
  }

  /** Return log entries for an agent. Returns empty array if agent doesn't exist. */
  getLogs(agentId: string): AgentLogEntry[] {
    return this.logs.get(agentId) ?? [];
  }
}

/** Strip keys with `undefined` values so they don't overwrite existing fields. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}
