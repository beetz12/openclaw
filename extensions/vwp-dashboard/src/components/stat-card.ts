import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";

@customElement("vwp-stat-card")
export class StatCard extends LitElement {
  static styles = [
    theme,
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .card.highlight {
        border-left: 4px solid var(--color-accent);
      }

      .label {
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
        font-weight: 500;
      }

      .value {
        font-size: var(--font-size-2xl);
        font-weight: 700;
        color: var(--color-text);
        line-height: 1.2;
        font-family: var(--font-mono);
        letter-spacing: -0.02em;
      }

      .card.highlight .value {
        color: var(--color-accent);
      }

      .sub {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        margin-top: 2px;
      }

      .trend {
        font-size: var(--font-size-xs);
        margin-top: 2px;
      }

      .trend.up {
        color: var(--color-action);
      }

      .trend.down {
        color: var(--color-accent);
      }
    `,
  ];

  @property() label = "";
  @property() value = "";
  @property() sub = "";
  @property() trend = "";
  @property({ attribute: "trend-direction" }) trendDirection: "up" | "down" | "" = "";
  @property({ type: Boolean }) highlight = false;

  render() {
    return html`
      <div class="card ${this.highlight ? "highlight" : ""}">
        <span class="label">${this.label}</span>
        <span class="value">${this.value}</span>
        ${this.sub ? html`<span class="sub">${this.sub}</span>` : nothing}
        ${
          this.trend
            ? html`<span class="trend ${this.trendDirection}">${this.trend}</span>`
            : nothing
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-stat-card": StatCard;
  }
}
