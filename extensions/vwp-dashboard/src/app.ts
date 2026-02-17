import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ErrorToast } from "./components/error-toast.js";
import { getCurrentRoute, onRouteChange, type Route } from "./router.js";
import { wrench } from "./styles/icons.js";
import { sharedStyles } from "./styles/shared.js";
import "./components/tab-bar.js";
import "./components/page-header.js";
import "./components/error-toast.js";
import "./components/sidebar-nav.js";
import { theme } from "./styles/theme.js";
import "./views/home-view.js";
import "./views/queue-view.js";
import "./views/tasks-view.js";
import "./views/business-view.js";
import "./views/more-view.js";
import "./views/onboarding-view.js";

const ONBOARDING_KEY = "vwp-onboarding-complete";

@customElement("vwp-app")
export class VwpApp extends LitElement {
  static override styles = [
    theme,
    sharedStyles,
    css`
      :host {
        display: block;
        min-height: 100dvh;
        background: var(--color-bg);
        font-family: var(--font-family);
        font-size: var(--font-size-base);
        color: var(--color-text);
      }

      .desktop-layout {
        display: flex;
        min-height: 100dvh;
      }

      .desktop-layout .page-content {
        flex: 1;
        min-width: 0;
        max-width: 800px;
        padding: var(--space-4);
      }

      .page-content {
        padding-bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px) + var(--space-4));
        max-width: 600px;
        margin: 0 auto;
      }

      .view-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8);
        text-align: center;
        color: var(--color-text-secondary);
      }

      .view-placeholder .icon {
        font-size: 48px;
        margin-bottom: var(--space-4);
        color: var(--color-text-muted);
      }

      .view-placeholder .icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .view-placeholder h2 {
        margin: 0 0 var(--space-2);
        font-size: var(--font-size-xl);
        color: var(--color-text);
      }

      .view-placeholder p {
        margin: 0;
        font-size: var(--font-size-sm);
      }
    `,
  ];

  @state()
  private _route: Route = getCurrentRoute();

  @state()
  private _needsOnboarding = false;

  @state()
  private _queueCount = 0;

  @state()
  private _taskCount = 0;

  @state()
  private _isDesktop = false;

  private _removeRouteListener?: () => void;
  private _mediaQuery?: MediaQueryList;

  private _boundShowError = (e: Event) => {
    const toast = this.renderRoot.querySelector("vwp-error-toast") as ErrorToast | null;
    toast?.show((e as CustomEvent<string>).detail);
  };

  private _onMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
    this._isDesktop = e.matches;
  };

  override connectedCallback() {
    super.connectedCallback();
    this._removeRouteListener = onRouteChange((route) => {
      this._route = route;
    });
    this.addEventListener("show-error", this._boundShowError);

    // Responsive breakpoint: 768px+
    this._mediaQuery = window.matchMedia("(min-width: 768px)");
    this._isDesktop = this._mediaQuery.matches;
    this._mediaQuery.addEventListener("change", this._onMediaChange);

    // Check onboarding state
    this._needsOnboarding = !localStorage.getItem(ONBOARDING_KEY);
    if (this._needsOnboarding && this._route !== "onboarding") {
      this._route = "onboarding";
      window.location.hash = "#/onboarding";
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._removeRouteListener?.();
    this.removeEventListener("show-error", this._boundShowError);
    this._mediaQuery?.removeEventListener("change", this._onMediaChange);
  }

  override render() {
    if (this._route === "onboarding") {
      return html`
        <div class="page-content">
          <vwp-onboarding-view
            @onboarding-complete=${this._onOnboardingComplete}
          ></vwp-onboarding-view>
        </div>
      `;
    }

    if (this._isDesktop) {
      return html`
        <vwp-error-toast></vwp-error-toast>
        <div class="desktop-layout">
          <vwp-sidebar-nav
            .activeRoute=${this._route}
            .queueCount=${this._queueCount}
            .taskCount=${this._taskCount}
          ></vwp-sidebar-nav>
          <div class="page-content">
            ${this._renderView()}
          </div>
        </div>
      `;
    }

    return html`
      <vwp-error-toast></vwp-error-toast>
      <div class="page-content">
        ${this._renderView()}
      </div>
      <vwp-tab-bar
        .activeRoute=${this._route}
        .queueCount=${this._queueCount}
        .taskCount=${this._taskCount}
      ></vwp-tab-bar>
    `;
  }

  private _renderView() {
    switch (this._route) {
      case "home":
        return html`
          <vwp-home-view></vwp-home-view>
        `;
      case "queue":
        return html`<vwp-queue-view
          @queue-count-change=${(e: CustomEvent<number>) => {
            this._queueCount = e.detail;
          }}
        ></vwp-queue-view>`;
      case "tasks":
        return html`
          <vwp-tasks-view
            @task-count-change=${(e: CustomEvent<number>) => {
              this._taskCount = e.detail;
            }}
          ></vwp-tasks-view>
        `;
      case "business":
        return html`
          <vwp-business-view></vwp-business-view>
        `;
      case "more":
        return html`
          <vwp-more-view></vwp-more-view>
        `;
      default:
        return this._renderPlaceholder();
    }
  }

  private _renderPlaceholder() {
    return html`
      <div class="view-placeholder">
        <div class="icon">${wrench}</div>
        <h2>Coming Soon</h2>
        <p>This page is under construction.</p>
      </div>
    `;
  }

  private _onOnboardingComplete() {
    localStorage.setItem(ONBOARDING_KEY, "true");
    this._needsOnboarding = false;
    this._route = "home";
    window.location.hash = "#/";
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-app": VwpApp;
  }
}
