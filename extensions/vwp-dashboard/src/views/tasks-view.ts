import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { tasksApi, type Task, type SubTask } from "../api/tasks-client.js";
import { navigate } from "../router.js";

@customElement("vwp-tasks-view")
export class TasksView extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 16px;
      max-width: 600px;
      margin: 0 auto;
    }

    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 4px;
    }

    .page-sub {
      font-size: 14px;
      color: #6b7280;
      margin: 0 0 20px;
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      margin: 24px 0 12px;
    }

    .task-card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      padding: 16px;
      margin-bottom: 12px;
    }

    .task-card.active {
      border-left: 4px solid #4a9c6d;
    }

    .task-card.failed {
      border-left: 4px solid #d14343;
    }

    .task-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .task-text {
      font-size: 15px;
      font-weight: 600;
      color: #1f2937;
      flex: 1;
      min-width: 0;
    }

    .task-status {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .task-status.running {
      background: #d1fae5;
      color: #065f46;
    }

    .task-status.pending {
      background: #fef3c7;
      color: #92400e;
    }

    .task-status.completed {
      background: #dbeafe;
      color: #1e40af;
    }

    .task-status.failed {
      background: #fee2e2;
      color: #991b1b;
    }

    .task-status.cancelled {
      background: #f3f4f6;
      color: #6b7280;
    }

    .task-time {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 4px;
    }

    .progress-bar {
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
      margin-top: 12px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #4a9c6d;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .progress-fill.failed {
      background: #d14343;
    }

    .sub-tasks {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sub-task {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: #f9fafb;
      border-radius: 6px;
      font-size: 13px;
      color: #374151;
    }

    .sub-task-icon {
      font-size: 14px;
      flex-shrink: 0;
    }

    .sub-task-label {
      flex: 1;
      min-width: 0;
    }

    .sub-task-result {
      font-size: 12px;
      color: #6b7280;
      margin-top: 2px;
    }

    .sub-task-error {
      font-size: 12px;
      color: #991b1b;
      margin-top: 2px;
    }

    .task-error {
      margin-top: 8px;
      padding: 10px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      font-size: 13px;
      color: #991b1b;
      line-height: 1.4;
    }

    .task-result {
      margin-top: 8px;
      padding: 10px 12px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      font-size: 13px;
      color: #166534;
      line-height: 1.4;
    }

    .expand-toggle {
      background: none;
      border: none;
      font-size: 13px;
      color: #4a9c6d;
      cursor: pointer;
      padding: 4px 0;
      margin-top: 8px;
      font-weight: 500;
    }

    .expand-toggle:hover {
      color: #3d8a5e;
    }

    .empty-state {
      text-align: center;
      padding: 48px 16px;
    }

    .empty-state .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state h2 {
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 8px;
    }

    .empty-state p {
      font-size: 14px;
      color: #9ca3af;
      margin: 0 0 16px;
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
    }

    .btn-primary {
      background: #4a9c6d;
      color: #fff;
    }

    .btn-primary:hover {
      background: #3d8a5e;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 32px;
      color: #9ca3af;
      font-size: 14px;
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
      border: 2px solid #d1d5db;
      border-top-color: #4a9c6d;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }
  `;

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
    } catch {
      // API not ready
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

  private _subTaskIcon(status: string): string {
    switch (status) {
      case "completed":
        return "\u2705";
      case "running":
        return "\u{1F7E1}";
      case "failed":
        return "\u274C";
      case "cancelled":
        return "\u23F9\uFE0F";
      default:
        return "\u2B55";
    }
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
            : html`<span class="sub-task-icon">${this._subTaskIcon(sub.status)}</span>`
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
          <div class="icon">\u{1F4CB}</div>
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
