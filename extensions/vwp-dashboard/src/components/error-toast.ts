import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { theme } from "../styles/theme.js";

@customElement("vwp-error-toast")
export class ErrorToast extends LitElement {
  static styles = [
    theme,
    css`
      :host {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 200;
        display: flex;
        justify-content: center;
        pointer-events: none;
      }

      .toast {
        margin-top: var(--space-4);
        padding: var(--space-3) var(--space-4);
        background: var(--color-danger-dark);
        color: var(--color-surface);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        font-weight: 500;
        box-shadow: var(--shadow-lg);
        pointer-events: auto;
        animation: slide-down 0.25s ease-out;
        max-width: 90vw;
      }

      @keyframes slide-down {
        from {
          transform: translateY(-100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .toast.hiding {
        animation: slide-up 0.2s ease-in forwards;
      }

      @keyframes slide-up {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(-100%);
          opacity: 0;
        }
      }
    `,
  ];

  @state() private _message = "";
  @state() private _visible = false;
  @state() private _hiding = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string) {
    if (this._timer) clearTimeout(this._timer);
    this._message = message;
    this._visible = true;
    this._hiding = false;
    this._timer = setTimeout(() => this._dismiss(), 4000);
  }

  private _dismiss() {
    this._hiding = true;
    setTimeout(() => {
      this._visible = false;
      this._hiding = false;
      this._message = "";
    }, 200);
  }

  render() {
    if (!this._visible) return nothing;
    return html`
      <div class="toast ${this._hiding ? "hiding" : ""}">
        ${this._message}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-error-toast": ErrorToast;
  }
}
