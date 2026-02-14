import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("vwp-approval-dialog")
export class ApprovalDialog extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
    }

    .dialog {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
    }

    .title {
      font-size: 18px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 8px;
    }

    .subtitle {
      font-size: 14px;
      color: #6b7280;
      margin: 0 0 16px;
    }

    textarea {
      width: 100%;
      min-height: 80px;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      line-height: 1.5;
      resize: vertical;
      box-sizing: border-box;
    }

    textarea:focus {
      outline: none;
      border-color: #e07a5f;
      box-shadow: 0 0 0 2px rgba(224, 122, 95, 0.2);
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      flex: 1;
      transition: background 0.15s ease;
    }

    .btn-confirm {
      background: #fee2e2;
      color: #991b1b;
    }

    .btn-confirm:hover {
      background: #fecaca;
    }

    .btn-cancel {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-cancel:hover {
      background: #e5e7eb;
    }
  `;

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
          <h2 class="title">Skip this message?</h2>
          <p class="subtitle">
            You can add a note about why you're skipping it. This is optional.
          </p>
          <textarea
            placeholder="Optional: why are you skipping this?"
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
              Skip message
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
