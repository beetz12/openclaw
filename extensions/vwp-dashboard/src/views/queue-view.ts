import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { PendingMessage, SSEEvent } from "../api/types.js";
import { api } from "../api/client.js";
import { sseClient } from "../api/sse.js";
import "../components/message-card.js";
import "../components/approval-dialog.js";

type ChannelFilter = "all" | "whatsapp" | "telegram" | "email";

@customElement("vwp-queue-view")
export class QueueView extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 16px;
      max-width: 600px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .header h1 {
      font-size: 20px;
      font-weight: 700;
      color: #1f2937;
      margin: 0;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 6px;
      border-radius: 12px;
      background: #e07a5f;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
    }

    .badge.zero {
      background: #d1d5db;
      color: #6b7280;
    }

    .filters {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .filters::-webkit-scrollbar {
      display: none;
    }

    .filter-pill {
      padding: 8px 16px;
      border-radius: 20px;
      border: 1px solid #e5e7eb;
      background: #fff;
      font-size: 13px;
      font-weight: 500;
      color: #6b7280;
      cursor: pointer;
      white-space: nowrap;
      min-height: 36px;
      transition: all 0.15s ease;
    }

    .filter-pill:hover {
      border-color: #d1d5db;
      background: #f9fafb;
    }

    .filter-pill.active {
      background: #4a9c6d;
      color: #fff;
      border-color: #4a9c6d;
    }

    .messages {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .new-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: #1d4ed8;
      cursor: pointer;
      margin-bottom: 12px;
      min-height: 44px;
    }

    .new-banner:hover {
      background: #dbeafe;
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
      margin: 0;
    }

    .load-more {
      display: flex;
      justify-content: center;
      padding: 16px;
    }

    .btn-load-more {
      padding: 10px 24px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      background: #fff;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      min-height: 44px;
      transition: background 0.15s ease;
    }

    .btn-load-more:hover:not(:disabled) {
      background: #f9fafb;
    }

    .btn-load-more:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 32px;
      color: #9ca3af;
      font-size: 14px;
    }

    .skeleton {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .skeleton-card {
      background: #fff;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .skeleton-line {
      height: 14px;
      background: #f3f4f6;
      border-radius: 4px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-line.short {
      width: 40%;
    }

    .skeleton-line.medium {
      width: 70%;
      margin-top: 8px;
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
  `;

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
      // API not ready
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
      // Handle error silently for now
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
      // Handle error silently for now
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
              \u{1F514} New messages arrived - tap to refresh
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
                  <div class="icon">\u2728</div>
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
