import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("vwp-stat-card")
export class StatCard extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .card {
      background: #fff;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .card.highlight {
      border-left: 4px solid #e07a5f;
    }

    .label {
      font-size: 13px;
      color: #6b7280;
      font-weight: 500;
    }

    .value {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
      line-height: 1.2;
    }

    .card.highlight .value {
      color: #e07a5f;
    }

    .sub {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 2px;
    }

    .trend {
      font-size: 12px;
      margin-top: 2px;
    }

    .trend.up {
      color: #4a9c6d;
    }

    .trend.down {
      color: #e07a5f;
    }
  `;

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
