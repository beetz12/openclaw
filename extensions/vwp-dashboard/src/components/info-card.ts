import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("vwp-info-card")
export class InfoCard extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    .header:hover {
      background: #fafafa;
    }

    .title-area {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .title {
      font-size: 15px;
      font-weight: 600;
      color: #1f2937;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .subtitle {
      font-size: 12px;
      color: #9ca3af;
    }

    .toggle {
      font-size: 12px;
      color: #9ca3af;
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }

    .toggle.open {
      transform: rotate(180deg);
    }

    .body {
      padding: 0 16px 16px;
      border-top: 1px solid #f3f4f6;
    }

    ::slotted(*) {
      margin-top: 12px;
    }
  `;

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
          <span class="toggle ${this._open ? "open" : ""}">\u25BC</span>
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
