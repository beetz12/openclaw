"use client";

import type {
  KanbanColumnId,
  KanbanTask,
  BoardState,
} from "@/types/kanban";

const TOKEN_KEY = "vwp-dashboard-token";
const BASE_URL_KEY = "vwp-dashboard-base-url";

export interface ActivityEntry {
  id: string;
  taskId: string;
  timestamp: number;
  type: "agent_action" | "status_change" | "subtask_update" | "approval_gate";
  agentName?: string;
  action: string;
  detail: string;
}

export interface SubtaskEdit {
  id?: string;
  description: string;
  domain: string;
}

export interface ApiError {
  error: string;
  status: number;
  code?: string;
}

function isRetryableRouteMismatch(err: unknown): err is ApiError {
  if (!err || typeof err !== "object" || !("status" in err)) {
    return false;
  }
  const status = Number((err as { status?: unknown }).status);
  return status === 404 || status === 405;
}

function extractSubmittedTaskId(data: { taskId?: string; id?: string }): string {
  const id = data.taskId ?? data.id;
  if (!id) {
    throw new Error("Invalid task submission response");
  }
  return id;
}

export class KanbanApiClient {
  get token(): string {
    return typeof localStorage !== "undefined"
      ? (localStorage.getItem(TOKEN_KEY) ?? "")
      : "";
  }

  get baseUrl(): string {
    return typeof localStorage !== "undefined"
      ? (localStorage.getItem(BASE_URL_KEY) ?? "")
      : "";
  }

  private _url(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): string {
    const base = this.baseUrl || window.location.origin;
    const url = new URL(path, base);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async _fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string>),
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(path, { ...init, headers });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      let errorCode: string | undefined;
      try {
        const body = (await res.json()) as { error?: string; code?: string };
        if (body.error) {errorMsg = body.error;}
        if (body.code) {errorCode = body.code;}
      } catch {
        // use status text
      }
      const err: ApiError = { error: errorMsg, status: res.status, code: errorCode };
      throw err;
    }

    return (await res.json()) as T;
  }

  async getQueueState(): Promise<{ active: { id: string; text: string } | null; pending: Array<{ id: string; text: string }>; length: number }> {
    const url = this._url("/vwp/dispatch/queue");
    return this._fetch(url);
  }

  async getPendingApprovals(limit = 50, offset = 0): Promise<{ items: Array<{ id: string; to: string; content: string; channel: string; status: string; created_at: number }>; total: number; hasMore: boolean; limit: number; offset: number }> {
    const url = this._url('/vwp/pending', { limit, offset });
    return this._fetch(url);
  }

  async approvePendingMessage(id: string, editedContent?: string): Promise<{ id: string; status: string }> {
    const url = this._url(`/vwp/approve/${encodeURIComponent(id)}`);
    return this._fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editedContent ? { editedContent } : {}),
    });
  }

  async rejectPendingMessage(id: string, reason?: string): Promise<{ id: string; status: string }> {
    const url = this._url(`/vwp/reject/${encodeURIComponent(id)}`);
    return this._fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason ? { reason } : {}),
    });
  }

  async getBoard(): Promise<BoardState> {
    const url = this._url("/vwp/dispatch/board");
    const data = await this._fetch<{
      columns: Record<KanbanColumnId, Array<{
        id: string;
        text: string | null;
        priority?: "low" | "medium" | "high" | "urgent";
        status: string;
        subtaskCount: number;
        assignment?: {
          assignedAgentId: string | null;
          assignedRole: string | null;
          assignmentMode: "auto" | "manual-lock";
        };
      }>>;
      updatedAt: number;
    }>(url);

    // Transform the board response into full BoardState.
    // The backend returns lightweight task stubs. We map them into KanbanTask
    // shapes with sensible defaults for fields not returned by the board endpoint.
    const columns = {} as Record<KanbanColumnId, KanbanTask[]>;
    const columnIds: KanbanColumnId[] = [
      "backlog",
      "todo",
      "in_progress",
      "review",
      "done",
    ];

    for (const col of columnIds) {
      const tasks = data.columns[col] ?? [];
      columns[col] = tasks.map((t, i) => ({
        id: t.id,
        text: t.text ?? "",
        assignment: t.assignment ?? { assignedAgentId: null, assignedRole: null, assignmentMode: "auto" },
        userId: "",
        createdAt: 0,
        updatedAt: data.updatedAt,
        column: col,
        position: i,
        priority: (t.priority) ?? ("medium" as const),
        decomposition: null,
        subtasks: [],
        status: (t.status as KanbanTask["status"]) ?? "queued",
        teamSpec: null,
        costEstimate: null,
        actualCost: null,
        result: null,
        error: null,
        domain: "",
        tags: [],
      }));
    }

    return { columns, loading: false, error: null };
  }

  async getTaskDetail(id: string): Promise<KanbanTask> {
    const url = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}`);
    const raw = await this._fetch<Record<string, unknown>>(url);

    const request = (raw.request as Record<string, unknown> | undefined) ?? {};
    const final = (raw.final as Record<string, unknown> | undefined) ?? {};
    const assignment = (raw.assignment as Record<string, unknown> | undefined) ?? {};
    const decomposition = (raw.decomposition as KanbanTask["decomposition"] | null | undefined) ?? null;

    const finalSubtasks = Array.isArray(final.subtasks)
      ? (final.subtasks as Array<Record<string, unknown>>)
      : [];

    const str = (v: unknown, fallback: string): string =>
      typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;

    const subtasks: KanbanTask["subtasks"] = finalSubtasks.map((st, i) => ({
      id: str(st.id, `${id}-subtask-${i}`),
      taskId: str(raw.id, id),
      description: str(st.description, `Subtask ${i + 1}`),
      domain: str(st.domain, "general"),
      skillPlugin: str(st.skillPlugin, ""),
      skillName: str(st.skillName, ""),
      status: (st.status as KanbanTask["subtasks"][number]["status"]) ?? "pending",
      assignedAgent: (st.assignedAgent as string | null | undefined) ?? null,
      result: (st.result as string | null | undefined) ?? null,
      error: (st.error as string | null | undefined) ?? null,
      startedAt: (st.startedAt as number | null | undefined) ?? null,
      completedAt: (st.completedAt as number | null | undefined) ?? null,
      position: Number(st.position ?? i),
    }));

    const column = (raw.column as KanbanTask["column"] | null | undefined) ?? "todo";

    let status = (raw.status as KanbanTask["status"] | undefined)
      ?? (final.status as KanbanTask["status"] | undefined)
      ?? (decomposition ? "confirming" : "queued");

    if ((column === "backlog" || column === "todo") && status === "failed") {
      status = decomposition ? "confirming" : "queued";
    }
    if (column === "done" && status === "failed") {
      status = "completed";
    }

    const synthesized = (final.synthesizedResult as string | undefined) ?? null;
    const result = status === "completed" ? synthesized : null;
    const error = status === "failed" ? (synthesized ?? "Task failed") : null;

    return {
      id: str(raw.id, id),
      text: str(raw.text ?? request.text, "Untitled task"),
      assignment: {
        assignedAgentId: (assignment.assignedAgentId as string | null | undefined) ?? null,
        assignedRole: (assignment.assignedRole as string | null | undefined) ?? null,
        assignmentMode: (assignment.assignmentMode as "auto" | "manual-lock" | undefined) ?? "auto",
      },
      userId: str(raw.userId, ""),
      createdAt: Number(raw.createdAt ?? request.createdAt ?? Date.now()),
      updatedAt: Number(raw.updatedAt ?? Date.now()),
      column,
      position: Number(raw.position ?? 0),
      priority: (raw.priority as KanbanTask["priority"]) ?? "medium",
      decomposition,
      subtasks,
      status,
      teamSpec: (raw.teamSpec as KanbanTask["teamSpec"]) ?? null,
      costEstimate: (raw.costEstimate as KanbanTask["costEstimate"]) ?? null,
      actualCost: (raw.actualCost as KanbanTask["actualCost"]) ?? null,
      result,
      error,
      domain: str(raw.domain, ""),
      tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    };
  }

  async moveToColumn(id: string, column: KanbanColumnId): Promise<void> {
    const url = this._url(
      `/vwp/dispatch/tasks/${encodeURIComponent(id)}/column`,
    );
    await this._fetch<{ id: string; column: string }>(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column }),
    });
  }

  async reorder(id: string, position: number): Promise<void> {
    const url = this._url(
      `/vwp/dispatch/tasks/${encodeURIComponent(id)}/position`,
    );
    await this._fetch<{ id: string; position: number }>(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position }),
    });
  }

  async updateSubtasks(id: string, subtasks: SubtaskEdit[]): Promise<void> {
    const url = this._url(
      `/vwp/dispatch/tasks/${encodeURIComponent(id)}/subtasks`,
    );
    await this._fetch<{ id: string }>(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtasks }),
    });
  }

  async getActivity(id: string): Promise<ActivityEntry[]> {
    const url = this._url(
      `/vwp/dispatch/tasks/${encodeURIComponent(id)}/activity`,
    );
    const data = await this._fetch<{ entries: ActivityEntry[] }>(url);
    return data.entries;
  }

  async getAutonomyTimeline(limit = 200): Promise<ActivityEntry[]> {
    const url = this._url('/vwp/dispatch/activity', { limit });
    const data = await this._fetch<{ entries: ActivityEntry[] }>(url);
    return data.entries;
  }

  async submitGoal(text: string, priority: "low" | "medium" | "high" | "urgent" = "medium"): Promise<{ id: string }> {
    const body = JSON.stringify({ text, priority });
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    };
    try {
      const primaryUrl = this._url("/vwp/dispatch/tasks");
      const data = await this._fetch<{ taskId?: string; id?: string }>(primaryUrl, init);
      return { id: extractSubmittedTaskId(data) };
    } catch (err) {
      if (!isRetryableRouteMismatch(err)) {
        throw err;
      }
      const fallbackUrl = this._url("/vwp/dispatch/submit");
      const data = await this._fetch<{ taskId?: string; id?: string }>(fallbackUrl, init);
      return { id: extractSubmittedTaskId(data) };
    }
  }

  async confirmExecution(id: string): Promise<void> {
    const canonicalUrl = this._url(`/vwp/dispatch/confirm/${encodeURIComponent(id)}`);
    try {
      await this._fetch<{ ok?: boolean; status?: string }>(canonicalUrl, { method: "POST" });
    } catch (err) {
      if (!isRetryableRouteMismatch(err)) {
        throw err;
      }
      const fallbackUrl = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}/confirm`);
      await this._fetch<{ ok?: boolean; status?: string }>(fallbackUrl, { method: "POST" });
    }
  }

  async cancelTask(id: string): Promise<void> {
    const canonicalUrl = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}`);
    try {
      await this._fetch<{ ok?: boolean; status?: string }>(canonicalUrl, { method: "DELETE" });
    } catch (err) {
      if (!isRetryableRouteMismatch(err)) {
        throw err;
      }
      const fallbackUrl = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}/cancel`);
      await this._fetch<{ ok?: boolean; status?: string }>(fallbackUrl, { method: "POST" });
    }
  }

  async retryTask(id: string): Promise<void> {
    const url = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}/retry`);
    await this._fetch<{ id: string; status: string }>(url, { method: "POST" });
  }

  async assignTask(id: string, payload: {
    agentId: string;
    role?: string;
    requiredSkills?: string[];
    mode?: "auto" | "manual-lock";
    reason?: string;
  }): Promise<{ assignment: { assignedAgentId: string | null; assignedRole: string | null; assignmentMode: "auto" | "manual-lock" } }> {
    const url = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}/assign`);
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async autoAssignTask(id: string, params?: { role?: string; skills?: string[] }): Promise<{ assignment: { assignedAgentId: string | null; assignedRole: string | null; assignmentMode: "auto" | "manual-lock" }; explain?: unknown }> {
    const url = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}/auto-assign`, {
      role: params?.role,
      skills: params?.skills?.join(","),
    });
    return this._fetch(url, { method: "POST" });
  }

  async unlockTaskAssignment(id: string): Promise<{ assignment: { assignedAgentId: string | null; assignedRole: string | null; assignmentMode: "auto" | "manual-lock" } }> {
    const url = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}/unlock-assignment`);
    return this._fetch(url, { method: "POST" });
  }

  async getTaskAssignmentExplain(id: string): Promise<{
    id: string;
    assignment: {
      assignedAgentId: string | null;
      assignedRole: string | null;
      assignmentMode: "auto" | "manual-lock";
      requiredSkills?: string[];
      assignmentReason?: string | null;
    };
    explain: {
      assignedAgentId: string | null;
      assignedRole: string | null;
      assignmentMode: "auto" | "manual-lock";
      assignmentReason: string | null;
      scoreBreakdown: Array<{ agentId: string; score: number; reasons: string[] }>;
    };
  }> {
    const url = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}/assignment-explain`);
    return this._fetch(url, { method: "GET" });
  }
  // --- Tool API ---

  async listTools(): Promise<{
    tools: Array<{
      name: string;
      label: string;
      description: string;
      category: string;
      args_schema: Record<string, { type: string; values?: string[]; required?: boolean; label: string }>;
      runtime: string;
      timeout_seconds?: number;
    }>;
    warning?: string;
  }> {
    const url = this._url("/vwp/tools");
    return this._fetch(url);
  }

  async runTool(toolName: string, args: Record<string, string>): Promise<{ runId: string; status: string }> {
    const url = this._url(`/vwp/tools/${encodeURIComponent(toolName)}/run`);
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  }

  async listToolRuns(): Promise<{
    active: Array<import("@/types/kanban").ToolRunInfo>;
    completed: Array<import("@/types/kanban").ToolRunInfo>;
  }> {
    const url = this._url("/vwp/tools/runs");
    return this._fetch(url);
  }

  async getToolRun(runId: string): Promise<import("@/types/kanban").ToolRunInfo> {
    const url = this._url(`/vwp/tools/runs/${encodeURIComponent(runId)}`);
    return this._fetch(url);
  }

  async cancelToolRun(runId: string): Promise<{ cancelled: boolean }> {
    const url = this._url(`/vwp/tools/runs/${encodeURIComponent(runId)}`);
    return this._fetch(url, { method: "DELETE" });
  }

  // --- Chat API ---

  async sendChatMessage(message: string, conversationId?: string): Promise<{ messageId: string; conversationId: string }> {
    const url = this._url("/vwp/chat/send");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversationId }),
    });
  }

  async getChatHistory(opts?: { conversationId?: string; limit?: number; before?: string }): Promise<{ messages: Array<{ id: string; role: string; content: string; timestamp: number }> }> {
    const url = this._url("/vwp/chat/history", {
      conversationId: opts?.conversationId,
      limit: opts?.limit,
      before: opts?.before,
    });
    return this._fetch(url);
  }

  async getChatStatus(): Promise<{ connected: boolean }> {
    const url = this._url("/vwp/chat/status");
    return this._fetch(url);
  }

  async cancelChat(): Promise<{ cancelled: boolean }> {
    const url = this._url("/vwp/chat/cancel");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  // --- Team API ---

  async getTeam(): Promise<{ team: { businessType: string; businessName: string; members: Array<{ id: string; name: string; role: string; description: string; skills: string[]; required: boolean; active: boolean }>; updatedAt: number } }> {
    const url = this._url("/vwp/team");
    return this._fetch(url);
  }

  async addTeamMember(member: { id: string; name: string; role: string; description: string; skills: string[]; required: boolean; active: boolean }): Promise<{ member: unknown }> {
    const url = this._url("/vwp/team/members");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(member),
    });
  }

  async updateTeamMember(id: string, data: Record<string, unknown>): Promise<{ member: unknown }> {
    const url = this._url(`/vwp/team/members/${encodeURIComponent(id)}`);
    return this._fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async deleteTeamMember(id: string): Promise<{ deleted: boolean }> {
    const url = this._url(`/vwp/team/members/${encodeURIComponent(id)}`);
    return this._fetch(url, { method: "DELETE" });
  }

  // --- Onboarding API ---

  async getOnboarding(): Promise<{ completed: boolean; completedAt?: number; businessType?: string }> {
    const url = this._url("/vwp/onboarding");
    return this._fetch(url);
  }

  async completeOnboarding(payload: { businessType: string; businessName: string; userName: string; team: unknown[] }): Promise<{ ok: boolean }> {
    const url = this._url("/vwp/onboarding/complete");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async resetOnboarding(): Promise<{ reset: boolean }> {
    const url = this._url("/vwp/onboarding");
    return this._fetch<{ reset: boolean }>(url, { method: "DELETE" });
  }

  // --- Project API ---

  async getProjects(): Promise<{ projects: Array<{ id: string; name: string; rootPath: string; mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>; createdAt: number }> }> {
    const url = this._url("/vwp/projects");
    return this._fetch(url);
  }

  async registerProject(name: string, rootPath: string): Promise<{ project: { id: string; name: string; rootPath: string; mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>; createdAt: number } }> {
    const url = this._url("/vwp/projects");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, rootPath }),
    });
  }

  async removeProject(id: string): Promise<{ deleted: boolean }> {
    const url = this._url(`/vwp/projects/${encodeURIComponent(id)}`);
    return this._fetch(url, { method: "DELETE" });
  }

  async validateProject(id: string): Promise<{ valid: boolean; error?: string }> {
    const url = this._url(`/vwp/projects/${encodeURIComponent(id)}/validate`);
    return this._fetch(url, { method: "POST" });
  }

  // --- CoWork API ---

  async startCowork(projectId: string, prompt: string, options?: { model?: string; permissionMode?: string; maxBudgetUsd?: number; maxTurns?: number }): Promise<{ sessionId: string }> {
    const url = this._url("/vwp/cowork/start");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, prompt, ...options }),
    });
  }

  async sendCoworkMessage(message: string): Promise<{ ok: boolean }> {
    const url = this._url("/vwp/cowork/send");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  }

  async cancelCowork(): Promise<{ cancelled: boolean }> {
    const url = this._url("/vwp/cowork/cancel");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  }

  async getCoworkStatus(): Promise<{ session: { id: string; projectId: string; status: string; startedAt: number } | null }> {
    const url = this._url("/vwp/cowork/status");
    return this._fetch(url);
  }

  async updateProjectMcpServers(projectId: string, servers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>): Promise<{ project: { id: string; name: string; rootPath: string; mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>; createdAt: number } }> {
    const url = this._url(`/vwp/projects/${encodeURIComponent(projectId)}/mcp-servers`);
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servers }),
    });
  }

  async undoCoworkSession(sessionId: string): Promise<{ undone: boolean }> {
    const url = this._url(`/vwp/cowork/${encodeURIComponent(sessionId)}/undo`);
    return this._fetch(url, { method: "POST" });
  }

  // --- Cron API (gateway bridge) ---

  async getCronStatus(): Promise<{ enabled: boolean; storePath: string; jobs: number; nextWakeAtMs: number | null }> {
    const url = this._url("/vwp/cron/status");
    return this._fetch(url);
  }

  async getCronJobs(): Promise<{ jobs: Array<{
    id: string; name: string; description?: string; enabled: boolean;
    schedule: { kind: string; expr?: string; at?: string; everyMs?: number };
    payload: { kind: string; message?: string; text?: string };
    state: { nextRunAtMs?: number; lastRunAtMs?: number; lastStatus?: string; lastError?: string; lastDurationMs?: number };
  }> }> {
    const url = this._url("/vwp/cron/jobs");
    return this._fetch(url);
  }

  async createCronJob(job: Record<string, unknown>): Promise<unknown> {
    const url = this._url("/vwp/cron/jobs");
    return this._fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });
  }

  async updateCronJob(id: string, patch: Record<string, unknown>): Promise<unknown> {
    const url = this._url(`/vwp/cron/jobs/${encodeURIComponent(id)}`);
    return this._fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async deleteCronJob(id: string): Promise<{ ok: boolean; removed: boolean }> {
    const url = this._url(`/vwp/cron/jobs/${encodeURIComponent(id)}`);
    return this._fetch(url, { method: "DELETE" });
  }

  async runCronJob(id: string): Promise<{ ok: boolean; ran: boolean; reason?: string }> {
    const url = this._url(`/vwp/cron/jobs/${encodeURIComponent(id)}/run`);
    return this._fetch(url, { method: "POST" });
  }

  async getCronJobRuns(id: string, limit = 50): Promise<{ entries: Array<{
    ts: number; jobId: string; status?: string; error?: string; summary?: string; durationMs?: number;
  }> }> {
    const url = this._url(`/vwp/cron/jobs/${encodeURIComponent(id)}/runs`, { limit });
    return this._fetch(url);
  }

  // --- Usage/Sessions API (gateway bridge) ---

  async getUsageCost(opts?: { days?: number; startDate?: string; endDate?: string }): Promise<{
    updatedAt: number; days: number;
    totals: { totalTokens: number; totalCost: number; input: number; output: number };
    daily: Array<{ date: string; totalTokens: number; totalCost: number }>;
  }> {
    const url = this._url("/vwp/usage/cost", {
      days: opts?.days,
      startDate: opts?.startDate,
      endDate: opts?.endDate,
    });
    return this._fetch(url);
  }

  async getSessionUsage(opts?: { startDate?: string; endDate?: string; limit?: number }): Promise<unknown> {
    const url = this._url("/vwp/usage/sessions", {
      startDate: opts?.startDate,
      endDate: opts?.endDate,
      limit: opts?.limit,
    });
    return this._fetch(url);
  }

  async getSessions(opts?: { limit?: number; search?: string; activeMinutes?: number }): Promise<{
    sessions: Array<{ key: string; kind: string; derivedTitle?: string; lastMessagePreview?: string; updatedAt: number | null; totalTokens?: number; model?: string }>;
    count: number;
  }> {
    const url = this._url("/vwp/sessions", {
      limit: opts?.limit,
      search: opts?.search,
      activeMinutes: opts?.activeMinutes,
    });
    return this._fetch(url);
  }

  async getSessionHistory(sessionKey: string, limit = 80): Promise<{
    sessionKey: string;
    messages: Array<{ role?: string; content?: unknown; tool_name?: string; tool_result?: unknown; ts?: number }>;
  }> {
    const url = this._url(`/vwp/sessions/${encodeURIComponent(sessionKey)}/history`, {
      limit,
    });
    return this._fetch(url);
  }

  async getGatewayHealth(): Promise<{ ok: boolean; ts: number; agents: unknown[]; sessions: unknown }> {
    const url = this._url("/vwp/health");
    return this._fetch(url);
  }

  async getGatewayConfig(): Promise<{ path: string; exists: boolean; config: unknown }> {
    const url = this._url("/vwp/gateway/config");
    return this._fetch(url);
  }

  async getChannelsStatus(probe = false): Promise<{
    ts: number; channelOrder: string[];
    channelAccounts: Record<string, Array<{ accountId: string; name?: string; connected?: boolean; enabled?: boolean; configured?: boolean; lastError?: string }>>;
  }> {
    const url = this._url("/vwp/channels/status", { probe: probe ? "true" : undefined });
    return this._fetch(url);
  }
}

/** Singleton API client instance */
export const kanbanApi = new KanbanApiClient();
