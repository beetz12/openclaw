import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Route } from "../router.js";
import { navigate } from "../router.js";
import { home, inbox, listChecks, briefcase, settings } from "../styles/icons.js";
import { theme } from "../styles/theme.js";

type NavItem = {
  route: Route;
  label: string;
  icon: TemplateResult;
};

const NAV_ITEMS: NavItem[] = [
  { route: "home", label: "Home", icon: home },
  { route: "queue", label: "Queue", icon: inbox },
  { route: "tasks", label: "Tasks", icon: listChecks },
  { route: "business", label: "Business", icon: briefcase },
  { route: "more", label: "Settings", icon: settings },
];

@customElement("vwp-sidebar-nav")
export class SidebarNav extends LitElement {
  static override styles = [
    theme,
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 240px;
        min-height: 100dvh;
        background: var(--color-surface);
        border-right: 1px solid var(--color-border);
        padding: var(--space-4) 0;
        flex-shrink: 0;
      }

      .brand {
        padding: var(--space-4) var(--space-6);
        font-size: var(--font-size-lg);
        font-weight: 700;
        color: var(--color-primary);
        letter-spacing: -0.02em;
        margin-bottom: var(--space-4);
      }

      nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 0 var(--space-3);
      }

      button {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-3);
        border: none;
        background: transparent;
        border-radius: var(--radius-md);
        cursor: pointer;
        font-family: var(--font-family);
        font-size: var(--font-size-sm);
        font-weight: 500;
        color: var(--color-text-secondary);
        transition: all 0.15s ease;
        min-height: 44px;
        text-align: left;
        position: relative;
      }

      button:hover {
        background: var(--color-bg-muted);
        color: var(--color-text);
      }

      button[data-active] {
        background: var(--color-primary-bg);
        color: var(--color-primary);
        font-weight: 600;
      }

      .icon {
        font-size: 20px;
        line-height: 1;
        width: 24px;
        text-align: center;
        flex-shrink: 0;
        position: relative;
      }

      .icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .badge {
        position: absolute;
        top: -4px;
        right: -6px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: var(--radius-full);
        background: var(--color-danger);
        color: var(--color-surface);
        font-size: 10px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
    `,
  ];

  @property({ type: String })
  activeRoute: Route = "home";

  @property({ type: Number })
  queueCount = 0;

  @property({ type: Number })
  taskCount = 0;

  override render() {
    return html`
      <div class="brand">VWP</div>
      <nav>
        ${NAV_ITEMS.map(
          (item) => html`
            <button
              ?data-active=${this.activeRoute === item.route}
              @click=${() => navigate(item.route)}
              aria-label=${item.label}
            >
              <span class="icon">
                ${item.icon}
                ${
                  item.route === "queue" && this.queueCount > 0
                    ? html`<span class="badge">${this.queueCount > 99 ? "99+" : this.queueCount}</span>`
                    : ""
                }
                ${
                  item.route === "tasks" && this.taskCount > 0
                    ? html`<span class="badge">${this.taskCount > 99 ? "99+" : this.taskCount}</span>`
                    : ""
                }
              </span>
              ${item.label}
            </button>
          `,
        )}
      </nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-sidebar-nav": SidebarNav;
  }
}
