import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { api } from "../api/client.js";
import { sseClient } from "../api/sse.js";
import type { PendingMessage, SSEEvent } from "../api/types.js";
import { bell, sparkles } from "../styles/icons.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";
import "../components/message-card.js";
import "../components/approval-dialog.js";

type ChannelFilter = "all" | "whatsapp" | "telegram" | "email";

@customElement("vwp-queue-view")
export class QueueView extends LitElement {
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

      .header {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
      }

      .header h1 {
        font-size: var(--font-size-xl);
        font-weight: 700;
        color: var(--color-text);
        margin: 0;
      }

      .badge {
        min-width: 24px;
        height: 24px;
        padding: 0 6px;
        border-radius: var(--radius-lg);
        background: var(--color-primary);
        font-size: var(--font-size-xs);
      }

      .badge.zero {
        background: var(--color-border-input);
        color: var(--color-text-secondary);
      }

      .filters {
        display: flex;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .filters::-webkit-scrollbar {
        display: none;
      }

      .filter-pill {
        padding: var(--space-2) var(--space-4);
        border-radius: 20px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        font-size: var(--font-size-xs);
        font-weight: 500;
        color: var(--color-text-secondary);
        cursor: pointer;
        white-space: nowrap;
        min-height: 36px;
        transition: all 0.15s ease;
      }

      .filter-pill:hover {
        border-color: var(--color-border-input);
        background: var(--color-bg-subtle);
      }

      .filter-pill.active {
        background: var(--color-action);
        color: var(--color-surface);
        border-color: var(--color-action);
      }

      .messages {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .new-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px;
        background: var(--color-info-bg);
        border: 1px solid var(--color-info-border);
        border-radius: var(--radius-md);
        font-size: var(--font-size-xs);
        font-weight: 600;
        color: var(--color-info);
        cursor: pointer;
        margin-bottom: var(--space-3);
        min-height: 44px;
      }

      .new-banner svg {
        width: 16px;
        height: 16px;
      }

      .new-banner:hover {
        background: var(--color-info-light);
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
        margin: 0;
      }

      .load-more {
        display: flex;
        justify-content: center;
        padding: var(--space-4);
      }

      .btn-load-more {
        padding: 10px var(--space-6);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        font-size: var(--font-size-sm);
        font-weight: 500;
        color: var(--color-text-body);
        cursor: pointer;
        min-height: 44px;
        transition: background 0.15s ease;
      }

      .btn-load-more:hover:not(:disabled) {
        background: var(--color-bg-subtle);
      }

      .btn-load-more:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .loading {
        display: flex;
        justify-content: center;
        padding: var(--space-8);
        color: var(--color-text-muted);
        font-size: var(--font-size-sm);
      }

      .skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .skeleton-card {
        background: var(--color-surface);
        border-radius: var(--radius-md);
        padding: var(--space-4);
        box-shadow: var(--shadow-sm);
      }

      .skeleton-line {
        height: 14px;
        background: var(--color-bg-muted);
        border-radius: var(--radius-sm);
        animation: pulse 1.5s ease-in-out infinite;
      }

      .skeleton-line.short {
        width: 40%;
      }

      .skeleton-line.medium {
        width: 70%;
        margin-top: var(--space-2);
      }

      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }
    `,
  ];

  @state() private _loading = true;
  @state() private _messages: PendingMessage[] = [];
  @state() private _total = 0;
  @state() private _hasMore = false;
  @state() private _filter: ChannelFilter = "all";
  @state() private _busyIds = new Set<string>();
  @state() private _newAvailable = false;
  @state() private _loadingMore = false;

  @state() private _rejectDialogOpen = false;
  @state() private _rejectMessageId = "";

  private _unsubscribers: Array<() => void> = [];
  private _offset = 0;
  private readonly _pageSize = 20;

  connectedCallback() {
    super.connectedCallback();
    this._loadMessages();
    this._unsubscribers.push(
      sseClient.onEvent((event: SSEEvent) => {
        switch (event.type) {
          case "message_queued":
            this._newAvailable = true;
            break;
          case "message_approved":
            this._messages = this._messages.filter((m) => m.id !== event.id);
            this._total = Math.max(0, this._total - 1);
            this._emitCount();
            break;
          case "message_rejected":
            this._messages = this._messages.filter((m) => m.id !== event.id);
            this._total = Math.max(0, this._total - 1);
            this._emitCount();
            break;
        }
      }),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
  }

  private async _loadMessages(append = false) {
    if (!append) {
      this._loading = true;
      this._offset = 0;
    } else {
      this._loadingMore = true;
    }

    try {
      const channelParam = this._filter === "all" ? undefined : this._filter;
      const res = await api.getPending({
        channel: channelParam,
        limit: this._pageSize,
        offset: this._offset,
      });

      if (append) {
        this._messages = [...this._messages, ...res.messages];
      } else {
        this._messages = res.messages;
      }
      this._total = res.total;
      this._hasMore = res.hasMore;
      this._newAvailable = false;
      this._emitCount();
    } catch {
      // API may not be ready yet; fail silently on background load
    } finally {
      this._loading = false;
      this._loadingMore = false;
    }
  }

  private _handleFilterChange(filter: ChannelFilter) {
    this._filter = filter;
    this._loadMessages();
  }

  private _handleRefresh() {
    this._loadMessages();
  }

  private _handleLoadMore() {
    this._offset += this._pageSize;
    this._loadMessages(true);
  }

  private async _handleApprove(e: CustomEvent<{ id: string; editedContent?: string }>) {
    const { id, editedContent } = e.detail;
    this._busyIds = new Set([...this._busyIds, id]);

    try {
      await api.approve(id, editedContent);
      this._messages = this._messages.filter((m) => m.id !== id);
      this._total = Math.max(0, this._total - 1);
      this._emitCount();
    } catch {
      this.dispatchEvent(
        new CustomEvent("show-error", {
          detail: "Couldn't approve message — please try again",
          bubbles: true,
          composed: true,
        }),
      );
    } finally {
      const next = new Set(this._busyIds);
      next.delete(id);
      this._busyIds = next;
    }
  }

  private _handleReject(e: CustomEvent<{ id: string }>) {
    this._rejectMessageId = e.detail.id;
    this._rejectDialogOpen = true;
  }

  private async _handleConfirmReject(e: CustomEvent<{ id: string; reason: string }>) {
    const { id, reason } = e.detail;
    this._rejectDialogOpen = false;
    this._busyIds = new Set([...this._busyIds, id]);

    try {
      await api.reject(id, reason || undefined);
      this._messages = this._messages.filter((m) => m.id !== id);
      this._total = Math.max(0, this._total - 1);
      this._emitCount();
    } catch {
      this.dispatchEvent(
        new CustomEvent("show-error", {
          detail: "Couldn't reject message — please try again",
          bubbles: true,
          composed: true,
        }),
      );
    } finally {
      const next = new Set(this._busyIds);
      next.delete(id);
      this._busyIds = next;
    }
  }

  private _emitCount() {
    this.dispatchEvent(
      new CustomEvent("queue-count-change", {
        detail: this._total,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _handleCancelReject() {
    this._rejectDialogOpen = false;
    this._rejectMessageId = "";
  }

  render() {
    return html`
      <div class="header">
        <h1>Messages to review</h1>
        <span class="badge ${this._total === 0 ? "zero" : ""}">${this._total}</span>
      </div>

      <div class="filters">
        ${(["all", "whatsapp", "telegram", "email"] as ChannelFilter[]).map(
          (f) => html`
            <button
              class="filter-pill ${this._filter === f ? "active" : ""}"
              @click=${() => this._handleFilterChange(f)}
            >
              ${f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          `,
        )}
      </div>

      ${
        this._newAvailable
          ? html`
            <div class="new-banner" @click=${this._handleRefresh}>
              ${bell} New messages arrived - tap to refresh
            </div>
          `
          : nothing
      }

      ${
        this._loading
          ? html`
            <div class="skeleton">
              ${[1, 2, 3].map(
                () => html`
                  <div class="skeleton-card">
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line medium"></div>
                  </div>
                `,
              )}
            </div>
          `
          : this._messages.length === 0
            ? html`
                <div class="empty-state">
                  <div class="icon">${sparkles}</div>
                  <h2>All caught up!</h2>
                  <p>No messages waiting for review. Your AI assistant will notify you when new ones arrive.</p>
                </div>
              `
            : html`
              <div class="messages">
                ${this._messages.map(
                  (m) => html`
                    <vwp-message-card
                      .message=${m}
                      ?busy=${this._busyIds.has(m.id)}
                      @approve=${this._handleApprove}
                      @reject=${this._handleReject}
                    ></vwp-message-card>
                  `,
                )}
              </div>

              ${
                this._hasMore
                  ? html`
                    <div class="load-more">
                      <button
                        class="btn-load-more"
                        ?disabled=${this._loadingMore}
                        @click=${this._handleLoadMore}
                      >
                        ${this._loadingMore ? "Loading..." : "Load more"}
                      </button>
                    </div>
                  `
                  : nothing
              }
            `
      }

      <vwp-approval-dialog
        ?open=${this._rejectDialogOpen}
        messageId=${this._rejectMessageId}
        @confirm-reject=${this._handleConfirmReject}
        @cancel-reject=${this._handleCancelReject}
      ></vwp-approval-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-queue-view": QueueView;
  }
}
