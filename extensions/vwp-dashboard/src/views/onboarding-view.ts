import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  hand,
  building2,
  sparkles,
  partyPopper,
  laptop,
  shoppingCart,
  briefcase,
} from "../styles/icons.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";

type BusinessType = "it-consultancy" | "ecommerce" | "other" | "";

const TOTAL_STEPS = 4;

@customElement("vwp-onboarding-view")
export class OnboardingView extends LitElement {
  static styles = [
    theme,
    sharedStyles,
    css`
      :host {
        display: block;
        padding: var(--space-4);
        max-width: 480px;
        margin: 0 auto;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .container {
        background: var(--color-surface);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        padding: var(--space-8) var(--space-6);
        text-align: center;
      }

      .step-icon {
        font-size: 3rem;
        color: var(--color-primary);
        margin-bottom: var(--space-4);
      }

      .step-icon svg {
        display: block;
        width: 1em;
        height: 1em;
        margin: 0 auto;
      }

      h1 {
        font-size: var(--font-size-xl);
        font-weight: 700;
        color: var(--color-text);
        margin: 0 0 var(--space-2);
      }

      p {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        line-height: 1.6;
        margin: 0 0 var(--space-6);
      }

      .channel-hint {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        line-height: 1.5;
        margin: 0 0 var(--space-6);
        font-style: italic;
      }

      .type-cards {
        display: flex;
        flex-direction: column;
        gap: 10px;
        text-align: left;
        margin-bottom: var(--space-6);
      }

      .type-card {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: 14px var(--space-4);
        background: var(--color-bg-subtle);
        border: 2px solid var(--color-border);
        border-radius: 10px;
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
        min-height: 44px;
      }

      .type-card:hover {
        border-color: var(--color-border-input);
        background: var(--color-bg-muted);
      }

      .type-card.selected {
        border-color: var(--color-action);
        background: var(--color-success-lighter);
      }

      .type-card-icon {
        font-size: var(--font-size-2xl);
        flex-shrink: 0;
        color: var(--color-text-secondary);
      }

      .type-card-icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .type-card.selected .type-card-icon {
        color: var(--color-action);
      }

      .type-card-content {
        flex: 1;
      }

      .type-card-content strong {
        display: block;
        font-size: var(--font-size-sm);
        color: var(--color-text);
      }

      .type-card-content span {
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
      }

      .input-group {
        margin-bottom: var(--space-4);
        text-align: left;
      }

      .input-group label {
        display: block;
        font-size: var(--font-size-sm);
        font-weight: 500;
        color: var(--color-text-body);
        margin-bottom: 6px;
      }

      .input-group input,
      .input-group textarea {
        width: 100%;
        padding: var(--space-3) 14px;
        border: 1px solid var(--color-border-input);
        border-radius: var(--radius-md);
        font-size: var(--font-size-base);
        font-family: inherit;
        box-sizing: border-box;
      }

      .input-group input:focus,
      .input-group textarea:focus {
        outline: none;
        border-color: var(--color-action);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-action) 20%, transparent);
      }

      .input-group textarea {
        min-height: 80px;
        resize: vertical;
      }

      .dots {
        display: flex;
        justify-content: center;
        gap: var(--space-2);
        margin-bottom: var(--space-6);
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-border-input);
        transition: background 0.2s ease;
      }

      .dot.active {
        background: var(--color-action);
        width: 24px;
        border-radius: var(--radius-sm);
      }

      .actions {
        display: flex;
        gap: var(--space-2);
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-3) 20px;
        border-radius: var(--radius-md);
        border: none;
        font-size: var(--font-size-sm);
        font-weight: 600;
        cursor: pointer;
        min-height: 44px;
        flex: 1;
        transition: background 0.15s ease;
      }

      .btn-primary {
        background: var(--color-action);
        color: var(--color-surface);
      }

      .btn-primary:hover {
        background: var(--color-action-hover);
      }

      .btn-primary:disabled {
        background: var(--color-text-muted);
        cursor: not-allowed;
      }

      .btn-secondary {
        background: var(--color-bg-muted);
        color: var(--color-text-body);
      }

      .btn-secondary:hover {
        background: var(--color-border);
      }

      .skip {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        cursor: pointer;
        background: none;
        border: none;
        margin-top: var(--space-3);
      }

      .skip:hover {
        color: var(--color-text-secondary);
      }
    `,
  ];

  @state() private _step = 0;
  @state() private _businessType: BusinessType = "";
  @state() private _businessName = "";
  @state() private _businessDescription = "";

  connectedCallback() {
    super.connectedCallback();
    try {
      this._businessType = (localStorage.getItem("vwp-business-type") || "") as BusinessType;
      this._businessName = localStorage.getItem("vwp-business-name") || "";
      this._businessDescription = localStorage.getItem("vwp-business-description") || "";
    } catch {
      // ignore
    }
  }

  private _next() {
    if (this._step === 2) {
      this._saveBusinessInfo();
    }
    if (this._step < TOTAL_STEPS - 1) {
      this._step++;
    } else {
      this._finish();
    }
  }

  private _back() {
    if (this._step > 0) {
      this._step--;
    }
  }

  private _selectType(type: BusinessType) {
    this._businessType = type;
  }

  private _saveBusinessInfo() {
    try {
      if (this._businessType) {
        localStorage.setItem("vwp-business-type", this._businessType);
      }
      const name = this._businessName.trim();
      if (name) {
        localStorage.setItem("vwp-business-name", name);
        localStorage.setItem("vwp-user-name", name);
      }
      const desc = this._businessDescription.trim();
      if (desc) {
        localStorage.setItem("vwp-business-description", desc);
      }
    } catch {
      // ignore
    }
  }

  private _finish() {
    this._saveBusinessInfo();
    this.dispatchEvent(new CustomEvent("onboarding-complete", { bubbles: true, composed: true }));
  }

  private _skip() {
    this._finish();
  }

  private _businessNameLabel(): string {
    switch (this._businessType) {
      case "it-consultancy":
        return "Company name";
      case "ecommerce":
        return "Store name";
      default:
        return "Business name";
    }
  }

  private _businessNamePlaceholder(): string {
    switch (this._businessType) {
      case "it-consultancy":
        return "e.g., Acme IT Solutions";
      case "ecommerce":
        return "e.g., Sunrise Shop";
      default:
        return "e.g., My Business";
    }
  }

  private _renderStep() {
    switch (this._step) {
      case 0:
        return html`
          <div class="step-icon">${hand}</div>
          <h1>Welcome to your AI Assistant</h1>
          <p>
            Your assistant can help with everyday business tasks -- answering messages, looking things up, and
            keeping things organized. Let's get started.
          </p>
        `;

      case 1:
        return html`
          <div class="step-icon">${building2}</div>
          <h1>What type of business?</h1>
          <p>This helps your assistant give better suggestions.</p>
          <div class="type-cards">
            <div
              class="type-card ${this._businessType === "it-consultancy" ? "selected" : ""}"
              @click=${() => this._selectType("it-consultancy")}
            >
              <span class="type-card-icon">${laptop}</span>
              <div class="type-card-content">
                <strong>IT Consultancy</strong>
                <span>Tech services, consulting, software</span>
              </div>
            </div>
            <div
              class="type-card ${this._businessType === "ecommerce" ? "selected" : ""}"
              @click=${() => this._selectType("ecommerce")}
            >
              <span class="type-card-icon">${shoppingCart}</span>
              <div class="type-card-content">
                <strong>Ecommerce Business</strong>
                <span>Online store, products, shipping</span>
              </div>
            </div>
            <div
              class="type-card ${this._businessType === "other" ? "selected" : ""}"
              @click=${() => this._selectType("other")}
            >
              <span class="type-card-icon">${briefcase}</span>
              <div class="type-card-content">
                <strong>Other Business</strong>
                <span>Services, retail, hospitality, etc.</span>
              </div>
            </div>
          </div>
        `;

      case 2:
        return html`
          <div class="step-icon">${sparkles}</div>
          <h1>Tell us about your business</h1>
          <p>Your assistant will use this to help answer questions.</p>
          <div class="input-group">
            <label for="biz-name">${this._businessNameLabel()}</label>
            <input
              id="biz-name"
              type="text"
              placeholder="${this._businessNamePlaceholder()}"
              .value=${this._businessName}
              @input=${(e: Event) => {
                this._businessName = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <div class="input-group">
            <label for="biz-desc">Anything else about your business?</label>
            <textarea
              id="biz-desc"
              placeholder="e.g., We specialize in..."
              .value=${this._businessDescription}
              @input=${(e: Event) => {
                this._businessDescription = (e.target as HTMLTextAreaElement).value;
              }}
            ></textarea>
          </div>
        `;

      case 3:
        return html`
          <div class="step-icon">${partyPopper}</div>
          <h1>You're ready!</h1>
          <p>
            ${this._businessName.trim() ? `${this._businessName.trim()}, your` : "Your"}
            AI assistant is ready to help with basic tasks.
            You can submit tasks, review messages, and manage your business info from the dashboard.
          </p>
          <p class="channel-hint">
            Next, ask your admin to connect a messaging channel (WhatsApp, Telegram, or Email) so your assistant can start helping.
          </p>
        `;

      default:
        return nothing;
    }
  }

  render() {
    const isFirst = this._step === 0;
    const isLast = this._step === TOTAL_STEPS - 1;
    const canProceed = this._step !== 1 || this._businessType !== "";

    return html`
      <div class="container">
        ${this._renderStep()}

        <div class="dots">
          ${Array.from(
            { length: TOTAL_STEPS },
            (_, i) => html`<div class="dot ${i === this._step ? "active" : ""}"></div>`,
          )}
        </div>

        <div class="actions">
          ${
            !isFirst
              ? html`<button class="btn btn-secondary" @click=${this._back}>Back</button>`
              : nothing
          }
          <button
            class="btn btn-primary"
            ?disabled=${!canProceed}
            @click=${this._next}
          >
            ${isLast ? "Go to Dashboard" : "Next"}
          </button>
        </div>

        ${!isLast ? html`<button class="skip" @click=${this._skip}>Skip for now</button>` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-onboarding-view": OnboardingView;
  }
}
