import type {
  PendingListResponse,
  StatsResponse,
  ApproveResult,
  RejectResult,
  ApiError,
} from "./types.js";

const TOKEN_KEY = "vwp-dashboard-token";
const BASE_URL_KEY = "vwp-dashboard-base-url";

export class VwpApiClient {
  private _baseUrl: string;
  private _token: string;

  constructor() {
    this._baseUrl = localStorage.getItem(BASE_URL_KEY) ?? "";
    this._token = localStorage.getItem(TOKEN_KEY) ?? "";
  }

  get token(): string {
    return this._token;
  }

  set token(value: string) {
    this._token = value;
    localStorage.setItem(TOKEN_KEY, value);
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  set baseUrl(value: string) {
    this._baseUrl = value;
    localStorage.setItem(BASE_URL_KEY, value);
  }

  get isConfigured(): boolean {
    return this._token.length > 0;
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

  async getPending(opts?: {
    channel?: string;
    limit?: number;
    offset?: number;
  }): Promise<PendingListResponse> {
    const url = this._url("/vwp/pending", {
      channel: opts?.channel,
      limit: opts?.limit,
      offset: opts?.offset,
    });
    return this._fetch<PendingListResponse>(url);
  }

  async getStats(): Promise<StatsResponse> {
    const url = this._url("/vwp/stats");
    return this._fetch<StatsResponse>(url);
  }

  async getHistory(opts?: { limit?: number; offset?: number }): Promise<PendingListResponse> {
    const url = this._url("/vwp/history", {
      limit: opts?.limit,
      offset: opts?.offset,
    });
    return this._fetch<PendingListResponse>(url);
  }

  async approve(id: string, editedContent?: string): Promise<ApproveResult> {
    const url = this._url(`/vwp/approve/${encodeURIComponent(id)}`);
    const body = editedContent !== undefined ? JSON.stringify({ editedContent }) : undefined;
    return this._fetch<ApproveResult>(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
    });
  }

  async reject(id: string, reason?: string): Promise<RejectResult> {
    const url = this._url(`/vwp/reject/${encodeURIComponent(id)}`);
    const body = reason !== undefined ? JSON.stringify({ reason }) : undefined;
    return this._fetch<RejectResult>(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
    });
  }
}

/** Singleton API client instance */
export const api = new VwpApiClient();
