import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

type BusinessType = "it-consultancy" | "ecommerce" | "other" | "";

const TOTAL_STEPS = 4;

@customElement("vwp-onboarding-view")
export class OnboardingView extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 16px;
      max-width: 480px;
      margin: 0 auto;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .container {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
      padding: 32px 24px;
      text-align: center;
    }

    .step-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 8px;
    }

    p {
      font-size: 15px;
      color: #6b7280;
      line-height: 1.6;
      margin: 0 0 24px;
    }

    .type-cards {
      display: flex;
      flex-direction: column;
      gap: 10px;
      text-align: left;
      margin-bottom: 24px;
    }

    .type-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: #f9fafb;
      border: 2px solid #e5e7eb;
      border-radius: 10px;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
      min-height: 44px;
    }

    .type-card:hover {
      border-color: #d1d5db;
      background: #f3f4f6;
    }

    .type-card.selected {
      border-color: #4a9c6d;
      background: #f0fdf4;
    }

    .type-card-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .type-card-content {
      flex: 1;
    }

    .type-card-content strong {
      display: block;
      font-size: 15px;
      color: #1f2937;
    }

    .type-card-content span {
      font-size: 13px;
      color: #6b7280;
    }

    .input-group {
      margin-bottom: 16px;
      text-align: left;
    }

    .input-group label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;
    }

    .input-group input,
    .input-group textarea {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 16px;
      font-family: inherit;
      box-sizing: border-box;
    }

    .input-group input:focus,
    .input-group textarea:focus {
      outline: none;
      border-color: #4a9c6d;
      box-shadow: 0 0 0 2px rgba(74, 156, 109, 0.2);
    }

    .input-group textarea {
      min-height: 80px;
      resize: vertical;
    }

    .dots {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 24px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #d1d5db;
      transition: background 0.2s ease;
    }

    .dot.active {
      background: #4a9c6d;
      width: 24px;
      border-radius: 4px;
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 20px;
      border-radius: 8px;
      border: none;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      flex: 1;
      transition: background 0.15s ease;
    }

    .btn-primary {
      background: #4a9c6d;
      color: #fff;
    }

    .btn-primary:hover {
      background: #3d8a5e;
    }

    .btn-primary:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover {
      background: #e5e7eb;
    }

    .skip {
      font-size: 13px;
      color: #9ca3af;
      cursor: pointer;
      background: none;
      border: none;
      margin-top: 12px;
    }

    .skip:hover {
      color: #6b7280;
    }
  `;

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
          <div class="step-icon">\u{1F44B}</div>
          <h1>Welcome to your AI Assistant</h1>
          <p>
            Your assistant can help with everyday business tasks -- answering messages, looking things up, and
            keeping things organized. Let's get started.
          </p>
        `;

      case 1:
        return html`
          <div class="step-icon">\u{1F3E2}</div>
          <h1>What type of business?</h1>
          <p>This helps your assistant give better suggestions.</p>
          <div class="type-cards">
            <div
              class="type-card ${this._businessType === "it-consultancy" ? "selected" : ""}"
              @click=${() => this._selectType("it-consultancy")}
            >
              <span class="type-card-icon">\u{1F4BB}</span>
              <div class="type-card-content">
                <strong>IT Consultancy</strong>
                <span>Tech services, consulting, software</span>
              </div>
            </div>
            <div
              class="type-card ${this._businessType === "ecommerce" ? "selected" : ""}"
              @click=${() => this._selectType("ecommerce")}
            >
              <span class="type-card-icon">\u{1F6D2}</span>
              <div class="type-card-content">
                <strong>Ecommerce Business</strong>
                <span>Online store, products, shipping</span>
              </div>
            </div>
            <div
              class="type-card ${this._businessType === "other" ? "selected" : ""}"
              @click=${() => this._selectType("other")}
            >
              <span class="type-card-icon">\u{1F4BC}</span>
              <div class="type-card-content">
                <strong>Other Business</strong>
                <span>Services, retail, hospitality, etc.</span>
              </div>
            </div>
          </div>
        `;

      case 2:
        return html`
          <div class="step-icon">\u2728</div>
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
          <div class="step-icon">\u{1F389}</div>
          <h1>You're ready!</h1>
          <p>
            ${this._businessName.trim() ? `${this._businessName.trim()}, your` : "Your"}
            AI assistant is ready to help with basic tasks.
            You can submit tasks, review messages, and manage your business info from the dashboard.
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
