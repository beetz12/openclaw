import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { PendingMessage } from "../api/types.js";
import "./channel-badge.js";

@customElement("vwp-message-card")
export class MessageCard extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      transition: box-shadow 0.15s ease;
    }

    .card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .channel-icon {
      font-size: 18px;
      flex-shrink: 0;
    }

    .meta {
      flex: 1;
      min-width: 0;
    }

    .recipient {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
    }

    .preview {
      font-size: 13px;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    .time {
      font-size: 12px;
      color: #9ca3af;
      flex-shrink: 0;
    }

    .expand-indicator {
      font-size: 12px;
      color: #9ca3af;
      transition: transform 0.15s ease;
    }

    .expand-indicator.open {
      transform: rotate(180deg);
    }

    .body {
      padding: 0 16px 16px;
      border-top: 1px solid #f3f4f6;
    }

    .full-content {
      font-size: 14px;
      color: #374151;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 12px 0;
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      transition: background 0.15s ease;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-approve {
      background: #d1fae5;
      color: #065f46;
      flex: 1;
    }

    .btn-approve:hover:not(:disabled) {
      background: #a7f3d0;
    }

    .btn-edit {
      background: #fef3c7;
      color: #92400e;
      flex: 1;
    }

    .btn-edit:hover:not(:disabled) {
      background: #fde68a;
    }

    .btn-reject {
      background: #fee2e2;
      color: #991b1b;
      flex: 1;
    }

    .btn-reject:hover:not(:disabled) {
      background: #fecaca;
    }

    .edit-area {
      padding: 12px 0;
    }

    .edit-area textarea {
      width: 100%;
      min-height: 100px;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      line-height: 1.5;
      resize: vertical;
      box-sizing: border-box;
    }

    .edit-area textarea:focus {
      outline: none;
      border-color: #4a9c6d;
      box-shadow: 0 0 0 2px rgba(74, 156, 109, 0.2);
    }

    .edit-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .btn-send-edited {
      background: #4a9c6d;
      color: #fff;
      flex: 1;
    }

    .btn-send-edited:hover:not(:disabled) {
      background: #3d8a5e;
    }

    .btn-cancel {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-cancel:hover:not(:disabled) {
      background: #e5e7eb;
    }

    .channel-tag {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      background: #f3f4f6;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      margin-top: 4px;
    }
  `;

  @property({ type: Object }) message!: PendingMessage;
  @property({ type: Boolean }) busy = false;

  @state() private _expanded = false;
  @state() private _editing = false;
  @state() private _editContent = "";

  private _channelIcon(channel: string): string {
    switch (channel.toLowerCase()) {
      case "whatsapp":
        return "\u{1F4AC}";
      case "telegram":
        return "\u2708\uFE0F";
      case "email":
        return "\u{1F4E7}";
      default:
        return "\u{1F4AC}";
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

  private _toggleExpand() {
    this._expanded = !this._expanded;
    if (!this._expanded) {
      this._editing = false;
    }
  }

  private _startEdit() {
    this._editing = true;
    this._editContent = this.message.content;
  }

  private _cancelEdit() {
    this._editing = false;
    this._editContent = "";
  }

  private _handleApprove() {
    this.dispatchEvent(
      new CustomEvent("approve", {
        detail: { id: this.message.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _handleSendEdited() {
    this.dispatchEvent(
      new CustomEvent("approve", {
        detail: { id: this.message.id, editedContent: this._editContent },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _handleReject() {
    this.dispatchEvent(
      new CustomEvent("reject", { detail: { id: this.message.id }, bubbles: true, composed: true }),
    );
  }

  render() {
    const m = this.message;
    const preview = m.content.length > 100 ? m.content.slice(0, 100) + "..." : m.content;

    return html`
      <div class="card">
        <div class="header" @click=${this._toggleExpand}>
          <span class="channel-icon">${this._channelIcon(m.channel)}</span>
          <div class="meta">
            <div class="recipient">To: ${m.to}</div>
            ${this._expanded ? nothing : html`<div class="preview">${preview}</div>`}
          </div>
          <span class="time">${this._formatTimeAgo(m.created_at)}</span>
          <span class="expand-indicator ${this._expanded ? "open" : ""}">
            \u25BC
          </span>
        </div>

        ${
          this._expanded
            ? html`
              <div class="body">
                <span class="channel-tag">${m.channel}</span>

                ${
                  this._editing
                    ? html`
                      <div class="edit-area">
                        <textarea
                          .value=${this._editContent}
                          @input=${(e: Event) => {
                            this._editContent = (e.target as HTMLTextAreaElement).value;
                          }}
                        ></textarea>
                        <div class="edit-actions">
                          <button class="btn btn-send-edited" ?disabled=${this.busy} @click=${this._handleSendEdited}>
                            Send edited
                          </button>
                          <button class="btn btn-cancel" @click=${this._cancelEdit}>Cancel</button>
                        </div>
                      </div>
                    `
                    : html`<div class="full-content">${m.content}</div>`
                }

                ${
                  !this._editing
                    ? html`
                      <div class="actions">
                        <button class="btn btn-approve" ?disabled=${this.busy} @click=${this._handleApprove}>
                          \u2705 Approve
                        </button>
                        <button class="btn btn-edit" ?disabled=${this.busy} @click=${this._startEdit}>
                          \u270F\uFE0F Edit
                        </button>
                        <button class="btn btn-reject" ?disabled=${this.busy} @click=${this._handleReject}>
                          \u274C Reject
                        </button>
                      </div>
                    `
                    : nothing
                }
              </div>
            `
            : nothing
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-message-card": MessageCard;
  }
}
