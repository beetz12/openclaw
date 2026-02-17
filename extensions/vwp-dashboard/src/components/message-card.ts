import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { PendingMessage } from "../api/types.js";
import { channelIcon, check, pencil, x, chevronDown } from "../styles/icons.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";
import "./channel-badge.js";

@customElement("vwp-message-card")
export class MessageCard extends LitElement {
  static styles = [
    theme,
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .card {
        overflow: hidden;
        transition: box-shadow 0.15s ease;
      }

      .card:hover {
        box-shadow: var(--shadow-md);
      }

      .header {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-4);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .channel-icon {
        font-size: 20px;
        flex-shrink: 0;
        color: var(--color-text-secondary);
      }

      .channel-icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .meta {
        flex: 1;
        min-width: 0;
      }

      .recipient {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--color-text);
      }

      .preview {
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
      }

      .time {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        flex-shrink: 0;
      }

      .expand-indicator {
        font-size: 16px;
        color: var(--color-text-muted);
        transition: transform 0.15s ease;
      }

      .expand-indicator svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .expand-indicator.open {
        transform: rotate(180deg);
      }

      .body {
        padding: 0 var(--space-4) var(--space-4);
        border-top: 1px solid var(--color-border-light);
      }

      .full-content {
        font-size: var(--font-size-sm);
        color: var(--color-text-body);
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        padding: var(--space-3) 0;
      }

      .actions {
        display: flex;
        gap: var(--space-2);
      }

      .actions .btn svg {
        width: 16px;
        height: 16px;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn-approve {
        background: var(--color-success-light);
        color: var(--color-success-dark);
        flex: 1;
      }

      .btn-approve:hover:not(:disabled) {
        background: var(--color-success-light);
      }

      .btn-edit {
        background: var(--color-warning-light);
        color: var(--color-warning-dark);
        flex: 1;
      }

      .btn-edit:hover:not(:disabled) {
        background: var(--color-warning-border);
      }

      .btn-reject {
        background: var(--color-danger-light);
        color: var(--color-danger-dark);
        flex: 1;
      }

      .btn-reject:hover:not(:disabled) {
        background: var(--color-danger-border);
      }

      .edit-area {
        padding: var(--space-3) 0;
      }

      .edit-area textarea {
        width: 100%;
        min-height: 100px;
        padding: 10px;
        border: 1px solid var(--color-border-input);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        font-family: inherit;
        line-height: 1.5;
        resize: vertical;
        box-sizing: border-box;
      }

      .edit-area textarea:focus {
        outline: none;
        border-color: var(--color-action);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-action) 20%, transparent);
      }

      .edit-actions {
        display: flex;
        gap: var(--space-2);
        margin-top: var(--space-2);
      }

      .btn-send-edited {
        background: var(--color-action);
        color: var(--color-surface);
        flex: 1;
      }

      .btn-send-edited:hover:not(:disabled) {
        background: var(--color-action-hover);
      }

      .btn-cancel {
        background: var(--color-bg-muted);
        color: var(--color-text-body);
      }

      .btn-cancel:hover:not(:disabled) {
        background: var(--color-border);
      }

      .channel-tag {
        display: inline-block;
        font-size: var(--font-size-xs);
        font-weight: 600;
        color: var(--color-text-secondary);
        background: var(--color-bg-muted);
        padding: 2px var(--space-2);
        border-radius: var(--radius-sm);
        text-transform: uppercase;
        margin-top: var(--space-1);
      }
    `,
  ];

  @property({ type: Object }) message!: PendingMessage;
  @property({ type: Boolean }) busy = false;

  @state() private _expanded = false;
  @state() private _editing = false;
  @state() private _editContent = "";

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
          <span class="channel-icon">${channelIcon(m.channel)}</span>
          <div class="meta">
            <div class="recipient">To: ${m.to}</div>
            ${this._expanded ? nothing : html`<div class="preview">${preview}</div>`}
          </div>
          <span class="time">${this._formatTimeAgo(m.created_at)}</span>
          <span class="expand-indicator ${this._expanded ? "open" : ""}">
            ${chevronDown}
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
                          ${check} Approve
                        </button>
                        <button class="btn btn-edit" ?disabled=${this.busy} @click=${this._startEdit}>
                          ${pencil} Edit
                        </button>
                        <button class="btn btn-reject" ?disabled=${this.busy} @click=${this._handleReject}>
                          ${x} Reject
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
