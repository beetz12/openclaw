"use client";

import type {
  KanbanColumnId,
  KanbanTask,
  KanbanSubtask,
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
}

export class KanbanApiClient {
  private _baseUrl: string | null = null;
  private _token: string | null = null;

  get token(): string {
    if (this._token === null) {
      this._token =
        typeof localStorage !== "undefined"
          ? (localStorage.getItem(TOKEN_KEY) ?? "")
          : "";
    }
    return this._token;
  }

  get baseUrl(): string {
    if (this._baseUrl === null) {
      this._baseUrl =
        typeof localStorage !== "undefined"
          ? (localStorage.getItem(BASE_URL_KEY) ?? "")
          : "";
    }
    return this._baseUrl;
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
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) {errorMsg = body.error;}
      } catch {
        // use status text
      }
      const err: ApiError = { error: errorMsg, status: res.status };
      throw err;
    }

    return (await res.json()) as T;
  }

  async getBoard(): Promise<BoardState> {
    const url = this._url("/vwp/dispatch/board");
    const data = await this._fetch<{
      columns: Record<KanbanColumnId, Array<{
        id: string;
        text: string | null;
        status: string;
        subtaskCount: number;
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
        userId: "",
        createdAt: 0,
        updatedAt: data.updatedAt,
        column: col,
        position: i,
        priority: "medium" as const,
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
    return this._fetch<KanbanTask>(url);
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

  async submitGoal(text: string): Promise<{ id: string }> {
    const url = this._url("/vwp/dispatch/tasks");
    const data = await this._fetch<{ taskId: string }>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return { id: data.taskId };
  }

  async confirmExecution(id: string): Promise<void> {
    const url = this._url(
      `/vwp/dispatch/tasks/${encodeURIComponent(id)}/confirm`,
    );
    await this._fetch<{ ok: boolean }>(url, { method: "POST" });
  }

  async cancelTask(id: string): Promise<void> {
    const url = this._url(
      `/vwp/dispatch/tasks/${encodeURIComponent(id)}/cancel`,
    );
    await this._fetch<{ ok: boolean }>(url, { method: "POST" });
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
    }>;
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
}

/** Singleton API client instance */
export const kanbanApi = new KanbanApiClient();
