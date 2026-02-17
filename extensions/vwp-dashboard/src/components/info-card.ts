import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { chevronDown } from "../styles/icons.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";

@customElement("vwp-info-card")
export class InfoCard extends LitElement {
  static styles = [
    theme,
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .card {
        overflow: hidden;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px var(--space-4);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }

      .header:hover {
        background: var(--color-bg-subtle);
      }

      .title-area {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .title {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--color-text);
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .subtitle {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
      }

      .toggle {
        font-size: 16px;
        color: var(--color-text-muted);
        transition: transform 0.15s ease;
        flex-shrink: 0;
      }

      .toggle svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .toggle.open {
        transform: rotate(180deg);
      }

      .body {
        padding: 0 var(--space-4) var(--space-4);
        border-top: 1px solid var(--color-border-light);
      }

      ::slotted(*) {
        margin-top: var(--space-3);
      }
    `,
  ];

  @property() label = "";
  @property() icon = "";
  @property() subtitle = "";
  @property({ type: Boolean, attribute: "initially-open" }) initiallyOpen = false;

  @state() private _open = false;

  connectedCallback() {
    super.connectedCallback();
    this._open = this.initiallyOpen;
  }

  private _toggle() {
    this._open = !this._open;
  }

  render() {
    return html`
      <div class="card">
        <div class="header" @click=${this._toggle}>
          <div class="title-area">
            <span class="title">
              ${this.icon ? html`<span>${this.icon}</span>` : ""}
              ${this.label}
            </span>
            ${this.subtitle ? html`<span class="subtitle">${this.subtitle}</span>` : ""}
          </div>
          <span class="toggle ${this._open ? "open" : ""}">${chevronDown}</span>
        </div>
        ${
          this._open
            ? html`
                <div class="body"><slot></slot></div>
              `
            : ""
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-info-card": InfoCard;
  }
}
