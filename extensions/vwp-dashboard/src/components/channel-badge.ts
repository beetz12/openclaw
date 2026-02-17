import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { channelIcon } from "../styles/icons.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";

export type ChannelStatus = "connected" | "disconnected" | "warning";

@customElement("vwp-channel-badge")
export class ChannelBadge extends LitElement {
  static styles = [
    theme,
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .badge {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
      }

      .icon {
        font-size: 22px;
        flex-shrink: 0;
        color: var(--color-text-secondary);
      }

      .icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }

      .name {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--color-text);
        text-transform: capitalize;
      }

      .detail {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .status-dot.connected {
        background: var(--color-success);
      }

      .status-dot.disconnected {
        background: var(--color-danger);
      }

      .status-dot.warning {
        background: var(--color-warning);
      }
    `,
  ];

  @property() channel = "";
  @property() status: ChannelStatus = "disconnected";
  @property({ attribute: "last-message" }) lastMessage = "";

  render() {
    const detail = this.lastMessage
      ? `Last message: ${this.lastMessage}`
      : this.status === "connected"
        ? "Active"
        : "Not connected";

    return html`
      <div class="badge">
        <span class="icon">${channelIcon(this.channel)}</span>
        <div class="info">
          <span class="name">${this.channel}</span>
          <span class="detail">${detail}</span>
        </div>
        <span class="status-dot ${this.status}"></span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-channel-badge": ChannelBadge;
  }
}
