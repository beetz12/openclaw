import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Route } from "../router.js";
import { navigate } from "../router.js";
import { theme } from "../styles/theme.js";

type TabDef = {
  route: Route;
  label: string;
  icon: string;
};

const TABS: TabDef[] = [
  { route: "home", label: "Home", icon: "\u{1F3E0}" },
  { route: "queue", label: "Queue", icon: "\u{1F4E5}" },
  { route: "tasks", label: "Tasks", icon: "\u{1F4CB}" },
  { route: "business", label: "Business", icon: "\u{1F4BC}" },
  { route: "more", label: "More", icon: "\u22EF" },
];

@customElement("vwp-tab-bar")
export class VwpTabBar extends LitElement {
  static override styles = [
    theme,
    css`
      :host {
        display: block;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
        background: var(--color-surface);
        border-top: 1px solid var(--color-border);
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }

      nav {
        display: flex;
        height: var(--tab-bar-height);
      }

      button {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        border: none;
        background: transparent;
        cursor: pointer;
        padding: var(--space-1);
        color: var(--color-text-muted);
        font-family: var(--font-family);
        font-size: var(--font-size-xs);
        -webkit-tap-highlight-color: transparent;
        position: relative;
        min-width: 44px;
        min-height: 44px;
        transition: color 0.15s ease;
      }

      button[data-active] {
        color: var(--color-primary);
      }

      .icon {
        font-size: 22px;
        line-height: 1;
        position: relative;
      }

      .badge {
        position: absolute;
        top: -4px;
        right: -10px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: var(--radius-full);
        background: var(--color-danger);
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }

      .label {
        font-weight: 500;
      }
    `,
  ];

  @property({ type: String })
  activeRoute: Route = "home";

  @property({ type: Number })
  queueCount = 0;

  override render() {
    return html`
      <nav>
        ${TABS.map(
          (tab) => html`
            <button
              ?data-active=${this.activeRoute === tab.route}
              @click=${() => navigate(tab.route)}
              aria-label=${tab.label}
            >
              <span class="icon">
                ${tab.icon}
                ${
                  tab.route === "queue" && this.queueCount > 0
                    ? html`<span class="badge">${this.queueCount > 99 ? "99+" : this.queueCount}</span>`
                    : ""
                }
              </span>
              <span class="label">${tab.label}</span>
            </button>
          `,
        )}
      </nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-tab-bar": VwpTabBar;
  }
}
