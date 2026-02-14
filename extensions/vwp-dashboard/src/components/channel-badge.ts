import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

export type ChannelStatus = "connected" | "disconnected" | "warning";

const STATUS_DOT: Record<ChannelStatus, string> = {
  connected: "\u{1F7E2}",
  disconnected: "\u{1F534}",
  warning: "\u{1F7E1}",
};

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "\u{1F4AC}",
  telegram: "\u2708\uFE0F",
  email: "\u{1F4E7}",
};

@customElement("vwp-channel-badge")
export class ChannelBadge extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .icon {
      font-size: 18px;
      flex-shrink: 0;
    }

    .info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }

    .name {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
      text-transform: capitalize;
    }

    .detail {
      font-size: 12px;
      color: #9ca3af;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-dot {
      font-size: 12px;
      flex-shrink: 0;
    }
  `;

  @property() channel = "";
  @property() status: ChannelStatus = "disconnected";
  @property({ attribute: "last-message" }) lastMessage = "";

  render() {
    const icon = CHANNEL_ICON[this.channel.toLowerCase()] ?? "\u{1F4AC}";
    const dot = STATUS_DOT[this.status];
    const detail = this.lastMessage
      ? `Last message: ${this.lastMessage}`
      : this.status === "connected"
        ? "Active"
        : "Not connected";

    return html`
      <div class="badge">
        <span class="icon">${icon}</span>
        <div class="info">
          <span class="name">${this.channel}</span>
          <span class="detail">${detail}</span>
        </div>
        <span class="status-dot">${dot}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-channel-badge": ChannelBadge;
  }
}
