import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { navigate } from "../router.js";

@customElement("vwp-business-view")
export class BusinessView extends LitElement {
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
      margin: 0 0 8px;
    }

    .page-sub {
      font-size: 14px;
      color: #6b7280;
      margin: 0 0 16px;
    }

    .info-banner {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 12px 16px;
      background: #fef9e7;
      border: 1px solid #fde68a;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #92400e;
      line-height: 1.5;
    }

    .info-banner .icon {
      flex-shrink: 0;
      font-size: 16px;
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

    .card-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      margin-bottom: 6px;
    }

    .card-label .icon {
      font-size: 16px;
    }

    .card-value {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    }

    .card-description {
      font-size: 14px;
      color: #374151;
      line-height: 1.5;
      margin-top: 8px;
      white-space: pre-wrap;
    }

    .type-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
    }

    .type-badge.it-consultancy {
      background: #ede9fe;
      color: #5b21b6;
    }

    .type-badge.ecommerce {
      background: #fef3c7;
      color: #92400e;
    }

    .type-badge.other {
      background: #e0f2fe;
      color: #0369a1;
    }

    .empty-state {
      text-align: center;
      padding: 48px 16px;
    }

    .empty-state .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state h2 {
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 8px;
    }

    .empty-state p {
      font-size: 14px;
      color: #9ca3af;
      margin: 0 0 16px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 20px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      min-height: 44px;
      transition: background 0.15s ease;
    }

    .btn-primary {
      background: #4a9c6d;
      color: #fff;
    }

    .btn-primary:hover {
      background: #3d8a5e;
    }

    .btn-outline {
      background: #fff;
      border: 1px solid #e5e7eb;
      color: #374151;
      margin-top: 16px;
      width: 100%;
    }

    .btn-outline:hover {
      background: #f9fafb;
    }
  `;

  @state() private _businessName = "";
  @state() private _businessType = "";
  @state() private _businessDescription = "";

  connectedCallback() {
    super.connectedCallback();
    this._loadData();
  }

  private _loadData() {
    try {
      this._businessName = localStorage.getItem("vwp-business-name") || "";
      this._businessType = localStorage.getItem("vwp-business-type") || "";
      this._businessDescription = localStorage.getItem("vwp-business-description") || "";
    } catch {
      // ignore
    }
  }

  private _typeLabel(type: string): string {
    switch (type) {
      case "it-consultancy":
        return "IT Consultancy";
      case "ecommerce":
        return "Ecommerce Business";
      case "other":
        return "Other Business";
      default:
        return type;
    }
  }

  private _hasData(): boolean {
    return !!(this._businessName || this._businessType || this._businessDescription);
  }

  render() {
    if (!this._hasData()) {
      return html`
        <h1>My Business Info</h1>
        <div class="empty-state">
          <div class="icon">\u{1F4BC}</div>
          <h2>No business info yet</h2>
          <p>Tell your AI assistant about your business so it can help you better.</p>
          <button
            class="btn btn-primary"
            @click=${() => {
              try {
                localStorage.removeItem("vwp-onboarding-complete");
              } catch {
                // ignore
              }
              navigate("onboarding");
            }}
          >
            Set up your business
          </button>
        </div>
      `;
    }

    return html`
      <h1>My Business Info</h1>
      <p class="page-sub">What your AI assistant knows about your business</p>

      <div class="info-banner">
        <span class="icon">\u{1F4A1}</span>
        <div>
          Your AI assistant uses this info to answer customer questions and help with tasks.
        </div>
      </div>

      <div class="sections">
        ${
          this._businessName
            ? html`
              <div class="card">
                <div class="card-label">
                  <span class="icon">\u{1F3E2}</span>
                  Business Name
                </div>
                <div class="card-value">${this._businessName}</div>
              </div>
            `
            : nothing
        }

        ${
          this._businessType
            ? html`
              <div class="card">
                <div class="card-label">
                  <span class="icon">\u{1F3F7}\uFE0F</span>
                  Business Type
                </div>
                <span class="type-badge ${this._businessType}">
                  ${this._typeLabel(this._businessType)}
                </span>
              </div>
            `
            : nothing
        }

        ${
          this._businessDescription
            ? html`
              <div class="card">
                <div class="card-label">
                  <span class="icon">\u{1F4DD}</span>
                  Description
                </div>
                <div class="card-description">${this._businessDescription}</div>
              </div>
            `
            : nothing
        }
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
        Update business info
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "vwp-business-view": BusinessView;
  }
}
