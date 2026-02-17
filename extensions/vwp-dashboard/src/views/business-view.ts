import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { building2, tag, fileText, lightbulb, briefcase } from "../styles/icons.js";
import { sharedStyles } from "../styles/shared.js";
import { theme } from "../styles/theme.js";

@customElement("vwp-business-view")
export class BusinessView extends LitElement {
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
        margin: 0 0 var(--space-2);
      }

      .page-sub {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-4);
      }

      .info-banner {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-4);
        background: var(--color-warning-lighter);
        border: 1px solid var(--color-warning-border);
        border-radius: var(--radius-md);
        margin-bottom: 20px;
        font-size: var(--font-size-xs);
        color: var(--color-warning-dark);
        line-height: 1.5;
      }

      .info-banner .icon {
        flex-shrink: 0;
        font-size: var(--font-size-base);
      }

      .info-banner .icon svg {
        display: block;
        width: 1em;
        height: 1em;
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

      .card-label {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--font-size-sm);
        font-weight: 600;
        color: var(--color-text-secondary);
        margin-bottom: 6px;
      }

      .card-label .icon {
        font-size: 18px;
        color: var(--color-primary);
      }

      .card-label .icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .card-value {
        font-size: var(--font-size-base);
        font-weight: 600;
        color: var(--color-text);
      }

      .card-description {
        font-size: var(--font-size-sm);
        color: var(--color-text-body);
        line-height: 1.5;
        margin-top: var(--space-2);
        white-space: pre-wrap;
      }

      .type-badge {
        display: inline-block;
        padding: var(--space-1) 10px;
        border-radius: var(--radius-lg);
        font-size: var(--font-size-xs);
        font-weight: 500;
      }

      .type-badge.it-consultancy {
        background: #ede9fe;
        color: #5b21b6;
      }

      .type-badge.ecommerce {
        background: var(--color-warning-light);
        color: var(--color-warning-dark);
      }

      .type-badge.other {
        background: #e0f2fe;
        color: #0369a1;
      }

      .empty-state {
        text-align: center;
        padding: 48px var(--space-4);
      }

      .empty-state .icon {
        font-size: 3rem;
        margin-bottom: var(--space-4);
      }

      .empty-state .icon svg {
        display: block;
        width: 1em;
        height: 1em;
      }

      .empty-state h2 {
        font-size: var(--font-size-lg);
        font-weight: 600;
        color: var(--color-text);
        margin: 0 0 var(--space-2);
      }

      .empty-state p {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        margin: 0 0 var(--space-4);
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
        transition: background 0.15s ease;
      }

      .btn-primary {
        background: var(--color-action);
        color: var(--color-surface);
      }

      .btn-primary:hover {
        background: var(--color-action-hover);
      }

      .btn-outline {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        color: var(--color-text-body);
        margin-top: var(--space-4);
        width: 100%;
      }

      .btn-outline:hover {
        background: var(--color-bg-subtle);
      }

      /* Inline edit styles */
      .edit-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .input-group {
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
      .input-group textarea,
      .input-group select {
        width: 100%;
        padding: var(--space-3) 14px;
        border: 1px solid var(--color-border-input);
        border-radius: var(--radius-md);
        font-size: var(--font-size-base);
        font-family: inherit;
        box-sizing: border-box;
      }

      .input-group input:focus,
      .input-group textarea:focus,
      .input-group select:focus {
        outline: none;
        border-color: var(--color-action);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-action) 20%, transparent);
      }

      .input-group textarea {
        min-height: 80px;
        resize: vertical;
      }

      .edit-actions {
        display: flex;
        gap: var(--space-2);
      }

      .edit-actions .btn {
        flex: 1;
      }

      .btn-secondary {
        background: var(--color-bg-muted);
        color: var(--color-text-body);
      }

      .btn-secondary:hover {
        background: var(--color-border);
      }
    `,
  ];

  @state() private _businessName = "";
  @state() private _businessType = "";
  @state() private _businessDescription = "";
  @state() private _editing = false;
  @state() private _editName = "";
  @state() private _editType = "";
  @state() private _editDescription = "";

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

  private _startEditing() {
    this._editName = this._businessName;
    this._editType = this._businessType;
    this._editDescription = this._businessDescription;
    this._editing = true;
  }

  private _cancelEditing() {
    this._loadData();
    this._editing = false;
  }

  private _saveEditing() {
    try {
      const name = this._editName.trim();
      if (name) {
        localStorage.setItem("vwp-business-name", name);
        localStorage.setItem("vwp-user-name", name);
      }
      if (this._editType) {
        localStorage.setItem("vwp-business-type", this._editType);
      }
      const desc = this._editDescription.trim();
      if (desc) {
        localStorage.setItem("vwp-business-description", desc);
      }
    } catch {
      // ignore
    }
    this._loadData();
    this._editing = false;
  }

  private _renderEditForm() {
    return html`
      <div class="edit-form">
        <div class="input-group">
          <label for="edit-name">Business name</label>
          <input
            id="edit-name"
            type="text"
            placeholder="e.g., My Business"
            .value=${this._editName}
            @input=${(e: Event) => {
              this._editName = (e.target as HTMLInputElement).value;
            }}
          />
        </div>
        <div class="input-group">
          <label for="edit-type">Business type</label>
          <select
            id="edit-type"
            .value=${this._editType}
            @change=${(e: Event) => {
              this._editType = (e.target as HTMLSelectElement).value;
            }}
          >
            <option value="">Select a type</option>
            <option value="it-consultancy">IT Consultancy</option>
            <option value="ecommerce">Ecommerce Business</option>
            <option value="other">Other Business</option>
          </select>
        </div>
        <div class="input-group">
          <label for="edit-desc">Description</label>
          <textarea
            id="edit-desc"
            placeholder="Describe your business..."
            .value=${this._editDescription}
            @input=${(e: Event) => {
              this._editDescription = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
        </div>
        <div class="edit-actions">
          <button class="btn btn-secondary" @click=${this._cancelEditing}>Cancel</button>
          <button class="btn btn-primary" @click=${this._saveEditing}>Save</button>
        </div>
      </div>
    `;
  }

  render() {
    if (!this._hasData()) {
      return html`
        <h1>My Business Info</h1>
        <div class="empty-state">
          <div class="icon">${briefcase}</div>
          <h2>No business info yet</h2>
          <p>Tell your AI assistant about your business so it can help you better.</p>
          <button
            class="btn btn-primary"
            @click=${this._startEditing}
          >
            Set up your business
          </button>
        </div>
        ${this._editing ? this._renderEditForm() : nothing}
      `;
    }

    if (this._editing) {
      return html`
        <h1>My Business Info</h1>
        <p class="page-sub">Edit your business details below</p>
        ${this._renderEditForm()}
      `;
    }

    return html`
      <h1>My Business Info</h1>
      <p class="page-sub">What your AI assistant knows about your business</p>

      <div class="info-banner">
        <span class="icon">${lightbulb}</span>
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
                  <span class="icon">${building2}</span>
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
                  <span class="icon">${tag}</span>
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
                  <span class="icon">${fileText}</span>
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
        @click=${this._startEditing}
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
