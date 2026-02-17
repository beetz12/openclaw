import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { tasksApi, type Task, type SubTask } from "../api/tasks-client.js";
import { navigate } from "../router.js";
import { statusIcon, listChecks } from "../styles/icons.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";

@customElement("vwp-tasks-view")
export class TasksView extends LitElement {
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

      h1 {
        font-size: var(--font-size-xl);
        font-weight: 700;
        color: var(--color-text);
        margin: 0 0 var(--space-1);
      }

      .page-sub {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin: 0 0 20px;
      }

      .section-title {
        font-size: var(--font-size-base);
        font-weight: 600;
        color: var(--color-text);
        margin: var(--space-6) 0 var(--space-3);
      }

      .task-card {
        background: var(--color-surface);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        padding: var(--space-4);
        margin-bottom: var(--space-3);
      }

      .task-card.active {
        border-left: 4px solid var(--color-action);
      }

      .task-card.failed {
        border-left: 4px solid var(--color-danger);
      }

      .task-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-2);
      }

      .task-text {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--color-text);
        flex: 1;
        min-width: 0;
      }

      .task-status {
        font-size: var(--font-size-xs);
        font-weight: 600;
        padding: 2px var(--space-2);
        border-radius: var(--radius-sm);
        white-space: nowrap;
        flex-shrink: 0;
      }

      .task-status.running {
        background: var(--color-success-light);
        color: var(--color-success-dark);
      }

      .task-status.pending {
        background: var(--color-warning-light);
        color: var(--color-warning-dark);
      }

      .task-status.completed {
        background: var(--color-info-light);
        color: var(--color-info-dark);
      }

      .task-status.failed {
        background: var(--color-danger-light);
        color: var(--color-danger-dark);
      }

      .task-status.cancelled {
        background: var(--color-bg-muted);
        color: var(--color-text-secondary);
      }

      .task-time {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        margin-top: var(--space-1);
      }

      .progress-bar {
        height: 4px;
        background: var(--color-border);
        border-radius: 2px;
        margin-top: var(--space-3);
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: var(--color-action);
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      .progress-fill.failed {
        background: var(--color-danger);
      }

      .sub-tasks {
        margin-top: var(--space-3);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .sub-task {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) 10px;
        background: var(--color-bg-subtle);
        border-radius: 6px;
        font-size: var(--font-size-xs);
        color: var(--color-text-body);
      }

      .sub-task-icon {
        font-size: var(--font-size-sm);
        flex-shrink: 0;
        color: var(--color-text-muted);
      }

      .sub-task-icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .sub-task-icon.completed {
        color: var(--color-success);
      }
      .sub-task-icon.failed {
        color: var(--color-danger);
      }
      .sub-task-icon.cancelled {
        color: var(--color-text-muted);
      }

      .sub-task-label {
        flex: 1;
        min-width: 0;
      }

      .sub-task-result {
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
        margin-top: 2px;
      }

      .sub-task-error {
        font-size: var(--font-size-xs);
        color: var(--color-danger-dark);
        margin-top: 2px;
      }

      .task-error {
        margin-top: var(--space-2);
        padding: 10px var(--space-3);
        background: var(--color-danger-lighter);
        border: 1px solid var(--color-danger-border);
        border-radius: 6px;
        font-size: var(--font-size-xs);
        color: var(--color-danger-dark);
        line-height: 1.4;
      }

      .task-result {
        margin-top: var(--space-2);
        padding: 10px var(--space-3);
        background: var(--color-success-lighter);
        border: 1px solid var(--color-success-border);
        border-radius: 6px;
        font-size: var(--font-size-xs);
        color: var(--color-success-dark);
        line-height: 1.4;
      }

      .expand-toggle {
        background: none;
        border: none;
        font-size: var(--font-size-xs);
        color: var(--color-action);
        cursor: pointer;
        padding: var(--space-1) 0;
        margin-top: var(--space-2);
        font-weight: 500;
      }

      .expand-toggle:hover {
        color: var(--color-action-hover);
      }

      .empty-state {
        text-align: center;
        padding: 48px var(--space-4);
      }

      .empty-state .icon {
        font-size: 48px;
        margin-bottom: var(--space-4);
      }

      .empty-state .icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .empty-state h2 {
        font-size: var(--font-size-lg);
        font-weight: 600;
        color: var(--color-text);
        margin: 0 0 var(--space-2);
      }

      .empty-state p {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        margin: 0 0 var(--space-4);
      }

      .btn {
        padding: var(--space-3) 20px;
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
      }

      .btn-primary {
        background: var(--color-action);
        color: var(--color-surface);
      }

      .btn-primary:hover {
        background: var(--color-action-hover);
      }

      .loading {
        display: flex;
        justify-content: center;
        padding: var(--space-8);
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid var(--color-border-input);
        border-top-color: var(--color-action);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
      }
    `,
  ];

  @state() private _loading = true;
  @state() private _tasks: Task[] = [];
  @state() private _expandedIds = new Set<string>();
  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._loadTasks();
    this._pollTimer = setInterval(() => this._loadTasks(), 5000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer !== null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  private async _loadTasks() {
    try {
      const res = await tasksApi.listTasks();
      this._tasks = res.tasks;
      const activeCount = res.tasks.filter(
        (t) => t.status === "running" || t.status === "pending",
      ).length;
      this.dispatchEvent(
        new CustomEvent("task-count-change", {
          detail: activeCount,
          bubbles: true,
          composed: true,
        }),
      );
    } catch {
      // API may not be ready yet; fail silently on background load
    } finally {
      this._loading = false;
    }
  }

  private _toggleExpand(id: string) {
    const next = new Set(this._expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._expandedIds = next;
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

  private _calcProgress(task: Task): number {
    if (task.subTasks.length === 0) {
      if (task.status === "completed") return 100;
      if (task.status === "running") return 50;
      return 0;
    }
    const done = task.subTasks.filter(
      (s) => s.status === "completed" || s.status === "failed",
    ).length;
    return Math.round((done / task.subTasks.length) * 100);
  }

  private _renderSubTask(sub: SubTask) {
    return html`
      <div class="sub-task">
        ${
          sub.status === "running"
            ? html`
                <span class="spinner"></span>
              `
            : html`<span class="sub-task-icon ${sub.status}">${statusIcon(sub.status)}</span>`
        }
        <div class="sub-task-label">
          ${sub.label}
          ${sub.result ? html`<div class="sub-task-result">${sub.result}</div>` : nothing}
          ${sub.error ? html`<div class="sub-task-error">${sub.error}</div>` : nothing}
        </div>
      </div>
    `;
  }

  private _renderTask(task: Task) {
    const isActive = task.status === "running" || task.status === "pending";
    const isExpanded = this._expandedIds.has(task.id);
    const hasDetails = task.subTasks.length > 0 || task.error || task.result;
    const progress = this._calcProgress(task);

    return html`
      <div class="task-card ${isActive ? "active" : ""} ${task.status === "failed" ? "failed" : ""}">
        <div class="task-header">
          <span class="task-text">${task.text}</span>
          <span class="task-status ${task.status}">${task.status}</span>
        </div>
        <div class="task-time">${this._formatTimeAgo(task.createdAt)}</div>

        ${
          isActive
            ? html`
              <div class="progress-bar">
                <div
                  class="progress-fill ${task.status === "failed" ? "failed" : ""}"
                  style="width: ${progress}%"
                ></div>
              </div>
            `
            : nothing
        }

        ${task.error ? html`<div class="task-error">${task.error}</div>` : nothing}

        ${task.result ? html`<div class="task-result">${task.result}</div>` : nothing}

        ${
          hasDetails && !isActive
            ? html`
              <button class="expand-toggle" @click=${() => this._toggleExpand(task.id)}>
                ${isExpanded ? "Hide details" : "Show details"}
              </button>
            `
            : nothing
        }

        ${
          (isActive || isExpanded) && task.subTasks.length > 0
            ? html`<div class="sub-tasks">${task.subTasks.map((s) => this._renderSubTask(s))}</div>`
            : nothing
        }
      </div>
    `;
  }

  render() {
    if (this._loading) {
      return html`
        <div class="loading">Loading tasks...</div>
      `;
    }

    if (this._tasks.length === 0) {
      return html`
        <h1>Tasks</h1>
        <div class="empty-state">
          <div class="icon">${listChecks}</div>
          <h2>No tasks yet</h2>
          <p>Submit one from the home screen to get started.</p>
          <button class="btn btn-primary" @click=${() => navigate("home")}>
            Go to Home
          </button>
        </div>
      `;
    }

    const active = this._tasks.filter((t) => t.status === "running" || t.status === "pending");
    const completed = this._tasks.filter(
      (t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled",
    );

    return html`
      <h1>Tasks</h1>
      <p class="page-sub">Your assistant is working on these</p>

      ${
        active.length > 0
          ? html`
            <h2 class="section-title">Active</h2>
            ${active.map((t) => this._renderTask(t))}
          `
          : nothing
      }

      ${
        completed.length > 0
          ? html`
            <h2 class="section-title">Completed</h2>
            ${completed.map((t) => this._renderTask(t))}
          `
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-tasks-view": TasksView;
  }
}
