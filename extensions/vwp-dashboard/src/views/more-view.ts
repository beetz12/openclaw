import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { navigate } from "../router.js";

@customElement("vwp-more-view")
export class MoreView extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 16px;
      max-width: 600px;
      margin: 0 auto;
    }

    h1 {
      font-size: 20px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 20px;
    }

    .sections {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      padding: 16px;
    }

    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: #1f2937;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .setting-row:last-child {
      border-bottom: none;
    }

    .setting-label {
      font-size: 14px;
      color: #374151;
    }

    .setting-note {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 2px;
    }

    .toggle {
      position: relative;
      width: 48px;
      height: 28px;
      flex-shrink: 0;
    }

    .toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-track {
      position: absolute;
      inset: 0;
      background: #d1d5db;
      border-radius: 14px;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .toggle input:checked + .toggle-track {
      background: #4a9c6d;
    }

    .toggle-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 24px;
      height: 24px;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: transform 0.2s ease;
      pointer-events: none;
    }

    .toggle input:checked ~ .toggle-thumb {
      transform: translateX(20px);
    }

    .select-wrap {
      position: relative;
    }

    .select-wrap select {
      appearance: none;
      padding: 8px 32px 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      background: #fff;
      cursor: pointer;
      min-height: 36px;
    }

    .select-wrap select:focus {
      outline: none;
      border-color: #4a9c6d;
      box-shadow: 0 0 0 2px rgba(74, 156, 109, 0.2);
    }

    .select-wrap::after {
      content: "\u25BC";
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 10px;
      color: #9ca3af;
      pointer-events: none;
    }

    .channel-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .channel-row:last-child {
      border-bottom: none;
    }

    .channel-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .channel-name {
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      flex: 1;
    }

    .channel-status {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 500;
    }

    .channel-status.connected {
      background: #d1fae5;
      color: #065f46;
    }

    .channel-status.disconnected {
      background: #fee2e2;
      color: #991b1b;
    }

    .about-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .about-row:last-child {
      border-bottom: none;
    }

    .about-label {
      font-size: 14px;
      color: #374151;
    }

    .about-value {
      font-size: 14px;
      color: #9ca3af;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      min-height: 44px;
      transition: background 0.15s ease;
    }

    .btn-link {
      background: none;
      color: #4a9c6d;
      padding: 0;
      min-height: auto;
      font-size: 14px;
    }

    .btn-link:hover {
      color: #3d8a5e;
    }

    .btn-danger {
      background: #fee2e2;
      color: #991b1b;
      width: 100%;
      margin-top: 8px;
    }

    .btn-danger:hover {
      background: #fecaca;
    }

    .btn-outline {
      background: #fff;
      border: 1px solid #e5e7eb;
      color: #374151;
      width: 100%;
      margin-top: 8px;
    }

    .btn-outline:hover {
      background: #f9fafb;
    }
  `;

  @state() private _autoApprove = false;
  @state() private _notifyVia = "none";

  render() {
    return html`
      <h1>Settings</h1>

      <div class="sections">
        <div class="card">
          <div class="card-title">\u{1F512} Trust Settings</div>
          <div class="setting-row">
            <div>
              <div class="setting-label">Auto-approve common responses</div>
              <div class="setting-note">
                Messages like order confirmations and shipping updates will be sent automatically
              </div>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                .checked=${this._autoApprove}
                @change=${(e: Event) => {
                  this._autoApprove = (e.target as HTMLInputElement).checked;
                }}
              />
              <span class="toggle-track"></span>
              <span class="toggle-thumb"></span>
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-title">\u{1F514} Notifications</div>
          <div class="setting-row">
            <div class="setting-label">Notify me via</div>
            <div class="select-wrap">
              <select
                .value=${this._notifyVia}
                @change=${(e: Event) => {
                  this._notifyVia = (e.target as HTMLSelectElement).value;
                }}
              >
                <option value="none">None</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="email">Email</option>
              </select>
            </div>
          </div>
          <div class="setting-note" style="padding-top: 4px;">
            Coming soon - notification preferences will be available in a future update.
          </div>
        </div>

        <div class="card">
          <div class="card-title">\u{1F517} Channel Connections</div>
          <div class="channel-row">
            <span class="channel-icon">\u{1F4AC}</span>
            <span class="channel-name">WhatsApp</span>
            <span class="channel-status connected">Connected</span>
          </div>
          <div class="channel-row">
            <span class="channel-icon">\u2708\uFE0F</span>
            <span class="channel-name">Telegram</span>
            <span class="channel-status disconnected">Not connected</span>
          </div>
          <div class="channel-row">
            <span class="channel-icon">\u{1F4E7}</span>
            <span class="channel-name">Email</span>
            <span class="channel-status disconnected">Not connected</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">\u2139\uFE0F About</div>
          <div class="about-row">
            <span class="about-label">Version</span>
            <span class="about-value">Phase 1.0</span>
          </div>
          <div class="about-row">
            <span class="about-label">Need help?</span>
            <button class="btn btn-link">View documentation</button>
          </div>

          <button
            class="btn btn-outline"
            @click=${() => {
              try {
                localStorage.removeItem("vwp-onboarding-complete");
              } catch {
                // ignore
              }
              navigate("onboarding");
            }}
          >
            Replay welcome tour
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-more-view": MoreView;
  }
}
