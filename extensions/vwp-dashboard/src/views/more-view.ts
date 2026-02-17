import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { navigate } from "../router.js";
import { shield, bell, link2, info, channelIcon } from "../styles/icons.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";

@customElement("vwp-more-view")
export class MoreView extends LitElement {
  static styles = [
    theme,
    sharedStyles,
    css`
      :host {
        display: block;
        padding: var(--space-4);
        max-width: 600px;
        margin: 0 auto;
      }

      h1 {
        font-size: var(--font-size-xl);
        font-weight: 700;
        color: var(--color-text);
        margin: 0 0 20px;
      }

      .sections {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .card {
        background: var(--color-surface);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        padding: var(--space-4);
      }

      .card-title {
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--color-text);
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
      }

      .card-title svg {
        width: 18px;
        height: 18px;
      }

      .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid var(--color-border-light);
      }

      .setting-row:last-child {
        border-bottom: none;
      }

      .setting-label {
        font-size: var(--font-size-sm);
        color: var(--color-text-body);
      }

      .setting-note {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        margin-top: 2px;
      }

      .coming-soon-label {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        font-style: italic;
        margin-left: var(--space-2);
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
        background: var(--color-border-input);
        border-radius: 14px;
        cursor: not-allowed;
        transition: background 0.2s ease;
        opacity: 0.5;
      }

      .toggle-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 24px;
        height: 24px;
        background: var(--color-surface);
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        transition: transform 0.2s ease;
        pointer-events: none;
      }

      .select-wrap {
        position: relative;
      }

      .select-wrap select {
        appearance: none;
        padding: var(--space-2) var(--space-8) var(--space-2) var(--space-3);
        border: 1px solid var(--color-border-input);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        background: var(--color-surface);
        cursor: not-allowed;
        min-height: 36px;
        opacity: 0.5;
      }

      .select-wrap::after {
        content: "\u25BC";
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 10px;
        color: var(--color-text-muted);
        pointer-events: none;
      }

      .channel-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: 10px 0;
        border-bottom: 1px solid var(--color-border-light);
      }

      .channel-row:last-child {
        border-bottom: none;
      }

      .channel-icon {
        font-size: var(--font-size-base);
        flex-shrink: 0;
      }

      .channel-icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .channel-name {
        font-size: var(--font-size-sm);
        font-weight: 500;
        color: var(--color-text-body);
        flex: 1;
      }

      .channel-status {
        font-size: var(--font-size-xs);
        padding: 2px var(--space-2);
        border-radius: var(--radius-sm);
        font-weight: 500;
      }

      .channel-status.setup-required {
        background: var(--color-warning-light);
        color: var(--color-warning-dark);
      }

      .channel-admin-note {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        padding-top: var(--space-2);
        font-style: italic;
      }

      .about-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid var(--color-border-light);
      }

      .about-row:last-child {
        border-bottom: none;
      }

      .about-label {
        font-size: var(--font-size-sm);
        color: var(--color-text-body);
      }

      .about-value {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
      }

      .docs-note {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        font-style: italic;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px var(--space-4);
        border-radius: var(--radius-md);
        border: none;
        font-size: var(--font-size-sm);
        font-weight: 500;
        cursor: pointer;
        min-height: 44px;
        transition: background 0.15s ease;
      }

      .btn-outline {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        color: var(--color-text-body);
        width: 100%;
        margin-top: var(--space-2);
      }

      .btn-outline:hover {
        background: var(--color-bg-subtle);
      }
    `,
  ];

  render() {
    return html`
      <h1>Settings</h1>

      <div class="sections">
        <div class="card">
          <div class="card-title">${shield} Trust Settings</div>
          <div class="setting-row">
            <div>
              <div class="setting-label">
                Auto-approve common responses
                <span class="coming-soon-label">(coming soon)</span>
              </div>
              <div class="setting-note">
                Messages like order confirmations and shipping updates will be sent automatically
              </div>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                disabled
              />
              <span class="toggle-track"></span>
              <span class="toggle-thumb"></span>
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-title">${bell} Notifications</div>
          <div class="setting-row">
            <div class="setting-label">Notify me via</div>
            <div class="select-wrap">
              <select disabled>
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
          <div class="card-title">${link2} Channel Connections</div>
          <div class="channel-row">
            <span class="channel-icon">${channelIcon("whatsapp")}</span>
            <span class="channel-name">WhatsApp</span>
            <span class="channel-status setup-required">Setup required</span>
          </div>
          <div class="channel-row">
            <span class="channel-icon">${channelIcon("telegram")}</span>
            <span class="channel-name">Telegram</span>
            <span class="channel-status setup-required">Setup required</span>
          </div>
          <div class="channel-row">
            <span class="channel-icon">${channelIcon("email")}</span>
            <span class="channel-name">Email</span>
            <span class="channel-status setup-required">Setup required</span>
          </div>
          <div class="channel-admin-note">
            Channel connections will be configured by your admin.
          </div>
        </div>

        <div class="card">
          <div class="card-title">${info} About</div>
          <div class="about-row">
            <span class="about-label">Version</span>
            <span class="about-value">Phase 1.0</span>
          </div>
          <div class="about-row">
            <span class="about-label">Need help?</span>
            <span class="docs-note">Documentation coming soon</span>
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
