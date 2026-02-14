import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getCurrentRoute, onRouteChange, type Route } from "./router.js";
import { sharedStyles } from "./styles/shared.js";
import { theme } from "./styles/theme.js";
import "./components/tab-bar.js";
import "./components/page-header.js";
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

  private _removeRouteListener?: () => void;

  override connectedCallback() {
    super.connectedCallback();
    this._removeRouteListener = onRouteChange((route) => {
      this._route = route;
    });

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

    return html`
      <div class="page-content">
        ${this._renderView()}
      </div>
      <vwp-tab-bar
        .activeRoute=${this._route}
        .queueCount=${this._queueCount}
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
          <vwp-tasks-view></vwp-tasks-view>
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
        <div class="icon">\u{1F6A7}</div>
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
