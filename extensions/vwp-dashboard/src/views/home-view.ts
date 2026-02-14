import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ApprovalStats, PendingMessage, SSEEvent } from "../api/types.js";
import { api } from "../api/client.js";
import { sseClient } from "../api/sse.js";
import { tasksApi, type Task } from "../api/tasks-client.js";
import { navigate } from "../router.js";
import "../components/stat-card.js";
import "../components/channel-badge.js";

@customElement("vwp-home-view")
export class HomeView extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 16px;
      max-width: 600px;
      margin: 0 auto;
    }

    .greeting {
      margin-bottom: 24px;
    }

    .greeting h1 {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 4px 0;
    }

    .greeting p {
      font-size: 14px;
      color: #6b7280;
      margin: 0;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }

    @media (max-width: 480px) {
      .stats-row {
        grid-template-columns: 1fr;
      }
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 12px 0;
    }

    .channels {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }

    .actions {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 20px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      transition: background 0.15s ease;
      flex: 1;
    }

    .btn-primary {
      background: #4a9c6d;
      color: #fff;
    }

    .btn-primary:hover {
      background: #3d8a5e;
    }

    .btn-primary.urgent {
      background: #e07a5f;
    }

    .btn-primary.urgent:hover {
      background: #cc6b52;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover {
      background: #e5e7eb;
    }

    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .activity-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
      font-size: 13px;
      color: #374151;
    }

    .activity-item:last-child {
      border-bottom: none;
    }

    .activity-status {
      font-size: 14px;
      flex-shrink: 0;
    }

    .activity-content {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .activity-time {
      font-size: 12px;
      color: #9ca3af;
      flex-shrink: 0;
    }

    .empty-state {
      text-align: center;
      padding: 32px 16px;
      color: #9ca3af;
    }

    .empty-state p {
      margin: 8px 0 0;
      font-size: 14px;
    }

    .empty-state .icon {
      font-size: 32px;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 32px;
      color: #9ca3af;
      font-size: 14px;
    }

    .task-input-section {
      margin-bottom: 24px;
    }

    .task-input-row {
      display: flex;
      gap: 8px;
    }

    .task-input-row input {
      flex: 1;
      padding: 12px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 16px;
      font-family: inherit;
      box-sizing: border-box;
      min-height: 44px;
    }

    .task-input-row input:focus {
      outline: none;
      border-color: #4a9c6d;
      box-shadow: 0 0 0 2px rgba(74, 156, 109, 0.2);
    }

    .task-input-row button {
      padding: 12px 16px;
      border-radius: 8px;
      border: none;
      background: #4a9c6d;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      white-space: nowrap;
      transition: background 0.15s ease;
    }

    .task-input-row button:hover {
      background: #3d8a5e;
    }

    .task-input-row button:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }

    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }

    .suggestion-chip {
      padding: 6px 12px;
      border-radius: 16px;
      border: 1px solid #e5e7eb;
      background: #fff;
      font-size: 13px;
      color: #374151;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .suggestion-chip:hover {
      border-color: #4a9c6d;
      background: #f0fdf4;
      color: #065f46;
    }

    .active-task-mini {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      margin-top: 10px;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .active-task-mini:hover {
      background: #dcfce7;
    }

    .active-task-mini .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid #bbf7d0;
      border-top-color: #4a9c6d;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .active-task-mini .text {
      flex: 1;
      font-size: 13px;
      color: #166534;
      font-weight: 500;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .active-task-mini .arrow {
      font-size: 14px;
      color: #4a9c6d;
      flex-shrink: 0;
    }
  `;

  @state() private loading = true;
  @state() private pendingCount = 0;
  @state() private todayCount = 0;
  @state() private approvalRate = 0;
  @state() private _taskInput = "";
  @state() private _submitting = false;
  @state() private _activeTask: Task | null = null;
  @state() private channels: Array<{
    name: string;
    status: "connected" | "disconnected" | "warning";
    lastMessage: string;
  }> = [];
  @state() private recentActivity: Array<{
    id: string;
    content: string;
    status: string;
    time: number;
  }> = [];

  private _unsubscribers: Array<() => void> = [];

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
    this._loadActiveTask();
    this._unsubscribers.push(
      sseClient.onEvent((event: SSEEvent) => {
        if (
          event.type === "message_queued" ||
          event.type === "message_approved" ||
          event.type === "message_rejected"
        ) {
          this._loadData();
        }
      }),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
  }

  private async _loadData() {
    try {
      const [pendingRes, statsRes, historyRes] = await Promise.all([
        api.getPending({ limit: 0 }),
        api.getStats(),
        api.getHistory({ limit: 5 }),
      ]);

      this.pendingCount = pendingRes.total;

      const allStats = statsRes.stats;
      let totalAll = 0;
      let totalApproved = 0;
      let totalToday = 0;
      for (const s of allStats) {
        totalAll += s.total;
        totalApproved += s.approved;
        totalToday += s.pending + s.approved + s.rejected;
      }
      this.todayCount = totalToday;
      this.approvalRate = totalAll > 0 ? Math.round((totalApproved / totalAll) * 100) : 0;

      this.channels = this._resolveChannels(allStats);

      this.recentActivity = historyRes.messages.map((m: PendingMessage) => ({
        id: m.id,
        content: m.content,
        status: m.status,
        time: m.created_at,
      }));
    } catch {
      // API may not be ready yet; keep loading state
    } finally {
      this.loading = false;
    }
  }

  private _resolveChannels(
    stats: ApprovalStats[],
  ): Array<{
    name: string;
    status: "connected" | "disconnected" | "warning";
    lastMessage: string;
  }> {
    const known = ["whatsapp", "telegram", "email"];
    const channelMap = new Map<string, ApprovalStats>();
    for (const s of stats) {
      channelMap.set(s.channel.toLowerCase(), s);
    }
    return known.map((name) => {
      const s = channelMap.get(name);
      if (!s) {
        return { name, status: "disconnected" as const, lastMessage: "" };
      }
      const hasActivity = s.total > 0;
      const hasPending = s.pending > 0;
      return {
        name,
        status: hasActivity ? ("connected" as const) : ("disconnected" as const),
        lastMessage: hasPending ? `${s.pending} waiting` : "",
      };
    });
  }

  private async _loadActiveTask() {
    try {
      const res = await tasksApi.listTasks();
      const active = res.tasks.find((t) => t.status === "running" || t.status === "pending");
      this._activeTask = active ?? null;
    } catch {
      // API not ready
    }
  }

  private async _submitTask() {
    const text = this._taskInput.trim();
    if (!text || this._submitting) return;
    this._submitting = true;
    try {
      await tasksApi.submitTask(text);
      this._taskInput = "";
      this._loadActiveTask();
    } catch {
      // task API not available yet
    } finally {
      this._submitting = false;
    }
  }

  private _getSuggestions(): string[] {
    try {
      const type = localStorage.getItem("vwp-business-type") || "";
      switch (type) {
        case "it-consultancy":
          return [
            "Draft a project status update",
            "Summarize open support tickets",
            "Write a meeting follow-up email",
          ];
        case "ecommerce":
          return [
            "Check order status for a customer",
            "Draft a shipping delay notice",
            "Write a product description",
          ];
        default:
          return [
            "Draft a reply to a customer",
            "Summarize today's messages",
            "Write a quick update email",
          ];
      }
    } catch {
      return [];
    }
  }

  private _getUserName(): string {
    try {
      return localStorage.getItem("vwp-user-name") || "there";
    } catch {
      return "there";
    }
  }

  private _formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  private _statusIcon(status: string): string {
    switch (status) {
      case "approved":
      case "auto_approved":
        return "\u2705";
      case "rejected":
        return "\u274C";
      case "pending":
        return "\u{1F7E1}";
      default:
        return "\u2B55";
    }
  }

  render() {
    if (this.loading) {
      return html`
        <div class="loading">Loading your dashboard...</div>
      `;
    }

    const name = this._getUserName();
    const hasPending = this.pendingCount > 0;
    const suggestions = this._getSuggestions();

    return html`
      <div class="greeting">
        <h1>Hi ${name}!</h1>
        <p>Here's what's happening with your messages</p>
      </div>

      <div class="task-input-section">
        <div class="task-input-row">
          <input
            type="text"
            placeholder="What would you like help with?"
            .value=${this._taskInput}
            @input=${(e: Event) => {
              this._taskInput = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") this._submitTask();
            }}
          />
          <button
            ?disabled=${!this._taskInput.trim() || this._submitting}
            @click=${this._submitTask}
          >
            ${this._submitting ? "Sending..." : "Submit"}
          </button>
        </div>
        ${
          suggestions.length > 0 && !this._taskInput
            ? html`
              <div class="suggestions">
                ${suggestions.map(
                  (s) => html`
                    <button
                      class="suggestion-chip"
                      @click=${() => {
                        this._taskInput = s;
                      }}
                    >
                      ${s}
                    </button>
                  `,
                )}
              </div>
            `
            : nothing
        }
        ${
          this._activeTask
            ? html`
              <div class="active-task-mini" @click=${() => navigate("tasks")}>
                <span class="spinner"></span>
                <span class="text">${this._activeTask.text}</span>
                <span class="arrow">\u203A</span>
              </div>
            `
            : nothing
        }
      </div>

      <div class="stats-row">
        <vwp-stat-card
          label="Waiting for review"
          value="${this.pendingCount}"
          sub="${hasPending ? "needs attention" : "all clear"}"
          ?highlight=${hasPending}
        ></vwp-stat-card>
        <vwp-stat-card
          label="Messages today"
          value="${this.todayCount}"
        ></vwp-stat-card>
        <vwp-stat-card
          label="Approval rate"
          value="${this.approvalRate}%"
        ></vwp-stat-card>
      </div>

      <h2 class="section-title">Your channels</h2>
      <div class="channels">
        ${
          this.channels.length > 0
            ? this.channels.map(
                (ch) => html`
                <vwp-channel-badge
                  channel="${ch.name}"
                  status="${ch.status}"
                  last-message="${ch.lastMessage}"
                ></vwp-channel-badge>
              `,
              )
            : html`
                <div class="empty-state">
                  <div class="icon">\u{1F4E1}</div>
                  <p>No channels set up yet. Head to settings to connect one.</p>
                </div>
              `
        }
      </div>

      <div class="actions">
        <button
          class="btn btn-primary ${hasPending ? "urgent" : ""}"
          @click=${() => navigate("queue")}
        >
          ${hasPending ? `Review ${this.pendingCount} message${this.pendingCount > 1 ? "s" : ""}` : "View queue"}
        </button>
        <button
          class="btn btn-secondary"
          @click=${() => navigate("business")}
        >
          Your business info
        </button>
      </div>

      ${
        this.recentActivity.length > 0
          ? html`
            <h2 class="section-title">Recent activity</h2>
            <div class="activity-list">
              ${this.recentActivity.map(
                (item) => html`
                  <div class="activity-item">
                    <span class="activity-status">${this._statusIcon(item.status)}</span>
                    <span class="activity-content">${item.content}</span>
                    <span class="activity-time">${this._formatTimeAgo(item.time)}</span>
                  </div>
                `,
              )}
            </div>
          `
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-home-view": HomeView;
  }
}
