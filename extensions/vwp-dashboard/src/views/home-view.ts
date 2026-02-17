import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ApprovalStats, PendingMessage, SSEEvent } from "../api/types.js";
import { api } from "../api/client.js";
import { sseClient } from "../api/sse.js";
import { tasksApi, type Task } from "../api/tasks-client.js";
import { navigate } from "../router.js";
import { statusIcon, satelliteDish, chevronRight } from "../styles/icons.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";
import "../components/stat-card.js";
import "../components/channel-badge.js";

@customElement("vwp-home-view")
export class HomeView extends LitElement {
  static styles = [
    theme,
    sharedStyles,
    css`
      :host {
        display: block;
        padding: var(--space-4);
        max-width: 600px;
        margin: 0 auto;
      }

      .greeting {
        margin-bottom: var(--space-6);
      }

      .greeting h1 {
        font-size: var(--font-size-2xl);
        font-weight: 700;
        color: var(--color-text);
        margin: 0 0 var(--space-1) 0;
      }

      .greeting p {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin: 0;
      }

      .stats-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3);
        margin-bottom: var(--space-6);
      }

      @media (max-width: 480px) {
        .stats-row {
          grid-template-columns: 1fr;
        }
      }

      .section-title {
        font-size: var(--font-size-base);
        font-weight: 600;
        color: var(--color-text);
        margin: 0 0 var(--space-3) 0;
      }

      .channels {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin-bottom: var(--space-6);
      }

      .actions {
        display: flex;
        gap: var(--space-3);
        margin-bottom: var(--space-6);
      }

      .btn {
        padding: var(--space-3) 20px;
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        flex: 1;
      }

      .btn-primary {
        background: var(--color-action);
        color: var(--color-surface);
      }

      .btn-primary:hover {
        background: var(--color-action-hover);
      }

      .btn-primary.urgent {
        background: var(--color-primary);
      }

      .btn-primary.urgent:hover {
        background: var(--color-primary-dark);
      }

      .btn-secondary {
        background: var(--color-bg-muted);
        color: var(--color-text-body);
      }

      .btn-secondary:hover {
        background: var(--color-border);
      }

      .activity-list {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .activity-item {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: 10px 0;
        border-bottom: 1px solid var(--color-border-light);
        font-size: var(--font-size-xs);
        color: var(--color-text-body);
      }

      .activity-item:last-child {
        border-bottom: none;
      }

      .activity-status {
        font-size: 18px;
        color: var(--color-text-secondary);
        flex-shrink: 0;
      }

      .activity-status svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .activity-status.approved,
      .activity-status.auto_approved {
        color: var(--color-success);
      }
      .activity-status.rejected {
        color: var(--color-danger);
      }
      .activity-status.pending {
        color: var(--color-warning);
      }

      .activity-content {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .activity-time {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        flex-shrink: 0;
      }

      .empty-state {
        text-align: center;
        padding: var(--space-8) var(--space-4);
        color: var(--color-text-muted);
      }

      .empty-state p {
        margin: var(--space-2) 0 0;
        font-size: var(--font-size-sm);
      }

      .empty-state .icon {
        font-size: var(--font-size-2xl);
      }

      .empty-state .icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .loading {
        display: flex;
        justify-content: center;
        padding: var(--space-8);
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      .task-input-section {
        margin-bottom: var(--space-6);
      }

      .task-input-row {
        display: flex;
        gap: var(--space-2);
      }

      .task-input-row input {
        flex: 1;
        padding: var(--space-3) 14px;
        border: 1px solid var(--color-border-input);
        border-radius: var(--radius-md);
        font-size: var(--font-size-base);
        font-family: inherit;
        box-sizing: border-box;
        min-height: 44px;
      }

      .task-input-row input:focus {
        outline: none;
        border-color: var(--color-action);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-action) 20%, transparent);
      }

      .task-input-row button {
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-md);
        border: none;
        background: var(--color-action);
        color: var(--color-surface);
        font-size: var(--font-size-sm);
        font-weight: 600;
        cursor: pointer;
        min-height: 44px;
        white-space: nowrap;
        transition: background 0.15s ease;
      }

      .task-input-row button:hover {
        background: var(--color-action-hover);
      }

      .task-input-row button:disabled {
        background: var(--color-text-muted);
        cursor: not-allowed;
      }

      .suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
      }

      .suggestion-chip {
        padding: 6px var(--space-3);
        border-radius: 16px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        font-size: var(--font-size-xs);
        color: var(--color-text-body);
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.15s ease;
      }

      .suggestion-chip:hover {
        border-color: var(--color-action);
        background: var(--color-success-lighter);
        color: var(--color-success-dark);
      }

      .active-task-mini {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        background: var(--color-success-lighter);
        border: 1px solid var(--color-success-border);
        border-radius: var(--radius-md);
        margin-top: 10px;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .active-task-mini:hover {
        background: var(--color-success-lighter);
      }

      .active-task-mini .spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid var(--color-success-border);
        border-top-color: var(--color-action);
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
        font-size: var(--font-size-xs);
        color: var(--color-success-dark);
        font-weight: 500;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .active-task-mini .arrow {
        font-size: 18px;
        color: var(--color-action);
        flex-shrink: 0;
      }

      .arrow svg {
        display: block;
        width: 1em;
        height: 1em;
      }
    `,
  ];

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
      // API may not be ready yet; fail silently on background load
    } finally {
      this.loading = false;
    }
  }

  private _resolveChannels(stats: ApprovalStats[]): Array<{
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
      // Task API not critical for initial load; fail silently
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
      this.dispatchEvent(
        new CustomEvent("show-error", {
          detail: "Couldn't submit task — please try again",
          bubbles: true,
          composed: true,
        }),
      );
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
                        this._submitTask();
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
                <span class="arrow">${chevronRight}</span>
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
                  <div class="icon">${satelliteDish}</div>
                  <p>No channels set up yet. Tap 'More' to connect a channel.</p>
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
                    <span class="activity-status ${item.status}">${statusIcon(item.status)}</span>
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
