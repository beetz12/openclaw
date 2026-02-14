import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { theme } from "../styles/theme.js";

@customElement("vwp-page-header")
export class VwpPageHeader extends LitElement {
  static override styles = [
    theme,
    css`
      :host {
        display: block;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        padding: var(--space-3) var(--space-4);
        position: sticky;
        top: 0;
        z-index: 50;
      }

      .header {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        max-width: 600px;
        margin: 0 auto;
      }

      .back-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: var(--font-size-xl);
        color: var(--color-primary);
        border-radius: var(--radius-md);
        -webkit-tap-highlight-color: transparent;
        padding: 0;
      }

      .back-btn:active {
        background: var(--color-primary-bg);
      }

      h1 {
        margin: 0;
        font-size: var(--font-size-xl);
        font-weight: 700;
        color: var(--color-text);
        flex: 1;
      }

      .subtitle {
        margin: 2px 0 0;
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }

      .title-group {
        flex: 1;
        min-width: 0;
      }

      .actions {
        display: flex;
        gap: var(--space-2);
      }
    `,
  ];

  @property()
  heading = "";

  @property()
  subtitle = "";

  @property({ type: Boolean })
  showBack = false;

  override render() {
    return html`
      <div class="header">
        ${
          this.showBack
            ? html`<button class="back-btn" @click=${this._onBack} aria-label="Go back">\u2190</button>`
            : ""
        }
        <div class="title-group">
          <h1>${this.heading}</h1>
          ${this.subtitle ? html`<p class="subtitle">${this.subtitle}</p>` : ""}
        </div>
        <div class="actions">
          <slot name="actions"></slot>
        </div>
      </div>
    `;
  }

  private _onBack() {
    this.dispatchEvent(new CustomEvent("back", { bubbles: true, composed: true }));
    window.history.back();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-page-header": VwpPageHeader;
  }
}
