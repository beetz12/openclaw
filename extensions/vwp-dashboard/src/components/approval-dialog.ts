import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";

@customElement("vwp-approval-dialog")
export class ApprovalDialog extends LitElement {
  static styles = [
    theme,
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: var(--space-4);
      }

      .dialog {
        background: var(--color-surface);
        border-radius: var(--radius-xl);
        padding: var(--space-6);
        width: 100%;
        max-width: 400px;
        box-shadow: var(--shadow-lg);
      }

      .title {
        font-size: var(--font-size-lg);
        font-weight: 700;
        color: var(--color-text);
        margin: 0 0 var(--space-2);
      }

      .subtitle {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-4);
      }

      textarea {
        width: 100%;
        min-height: 80px;
        padding: 10px;
        border: 1px solid var(--color-border-input);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        font-family: inherit;
        line-height: 1.5;
        resize: vertical;
        box-sizing: border-box;
      }

      textarea:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
      }

      .actions {
        display: flex;
        gap: var(--space-2);
        margin-top: var(--space-4);
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px var(--space-4);
        border-radius: var(--radius-md);
        border: none;
        font-size: var(--font-size-sm);
        font-weight: 600;
        cursor: pointer;
        min-height: 44px;
        flex: 1;
        transition: background 0.15s ease;
      }

      .btn-confirm {
        background: var(--color-danger-light);
        color: var(--color-danger-dark);
      }

      .btn-confirm:hover {
        background: var(--color-danger-border);
      }

      .btn-cancel {
        background: var(--color-bg-muted);
        color: var(--color-text-body);
      }

      .btn-cancel:hover {
        background: var(--color-border);
      }
    `,
  ];

  @property({ type: Boolean }) open = false;
  @property() messageId = "";

  @state() private _reason = "";

  private _handleConfirm() {
    this.dispatchEvent(
      new CustomEvent("confirm-reject", {
        detail: { id: this.messageId, reason: this._reason },
        bubbles: true,
        composed: true,
      }),
    );
    this._reason = "";
  }

  private _handleCancel() {
    this._reason = "";
    this.dispatchEvent(new CustomEvent("cancel-reject", { bubbles: true, composed: true }));
  }

  render() {
    if (!this.open) return nothing;

    return html`
      <div class="overlay" @click=${(e: Event) => {
        if (e.target === e.currentTarget) this._handleCancel();
      }}>
        <div class="dialog">
          <h2 class="title">Reject this message?</h2>
          <p class="subtitle">
            You can add a note about why you're rejecting it. This is optional.
          </p>
          <textarea
            placeholder="Optional: why are you rejecting this?"
            .value=${this._reason}
            @input=${(e: Event) => {
              this._reason = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
          <div class="actions">
            <button class="btn btn-cancel" @click=${this._handleCancel}>
              Go back
            </button>
            <button class="btn btn-confirm" @click=${this._handleConfirm}>
              Reject message
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-approval-dialog": ApprovalDialog;
  }
}
