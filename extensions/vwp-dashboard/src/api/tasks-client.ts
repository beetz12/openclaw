import type { ApiError } from "./types.js";

const TOKEN_KEY = "vwp-dashboard-token";
const BASE_URL_KEY = "vwp-dashboard-base-url";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type SubTask = {
  id: string;
  label: string;
  status: TaskStatus;
  result?: string;
  error?: string;
};

export type Task = {
  id: string;
  text: string;
  status: TaskStatus;
  subTasks: SubTask[];
  createdAt: number;
  updatedAt: number;
  result?: string;
  error?: string;
};

export type TaskListResponse = {
  tasks: Task[];
  total: number;
};

export type SubmitTaskResponse = {
  taskId: string;
};

export class VwpTasksClient {
  private _baseUrl: string;
  private _token: string;

  constructor() {
    this._baseUrl = localStorage.getItem(BASE_URL_KEY) ?? "";
    this._token = localStorage.getItem(TOKEN_KEY) ?? "";
  }

  get token(): string {
    return this._token;
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  private _url(path: string, params?: Record<string, string | number | undefined>): string {
    const base = this._baseUrl || window.location.origin;
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
    if (this._token) {
      headers["Authorization"] = `Bearer ${this._token}`;
    }

    const res = await fetch(path, {
      ...init,
      headers,
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) errorMsg = body.error;
      } catch {
        // use status text
      }
      const err: ApiError = { error: errorMsg, status: res.status };
      throw err;
    }

    return (await res.json()) as T;
  }

  async submitTask(text: string): Promise<SubmitTaskResponse> {
    const url = this._url("/vwp/dispatch/tasks");
    return this._fetch<SubmitTaskResponse>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  async getTaskStatus(id: string): Promise<Task> {
    const url = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}`);
    return this._fetch<Task>(url);
  }

  async listTasks(): Promise<TaskListResponse> {
    const url = this._url("/vwp/dispatch/tasks");
    return this._fetch<TaskListResponse>(url);
  }

  async cancelTask(id: string): Promise<void> {
    const url = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}/cancel`);
    await this._fetch<{ ok: boolean }>(url, { method: "POST" });
  }

  async confirmTask(id: string): Promise<void> {
    const url = this._url(`/vwp/dispatch/tasks/${encodeURIComponent(id)}/confirm`);
    await this._fetch<{ ok: boolean }>(url, { method: "POST" });
  }
}

/** Singleton tasks client instance */
export const tasksApi = new VwpTasksClient();
