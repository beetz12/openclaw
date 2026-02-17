"use client";

import { useEffect, useRef } from "react";
import { useOnboarding } from "./OnboardingProvider";

const INDUSTRIES = [
  "Retail & E-Commerce",
  "Technology & Software",
  "Consulting & Professional Services",
  "Marketing & Advertising",
  "Finance & Accounting",
  "Healthcare",
  "Education",
  "Real Estate",
  "Manufacturing",
  "Other",
];

export function BusinessBasicsStep() {
  const { businessName, setBusinessName, industry, setIndustry, description, setDescription, next, back } =
    useOnboarding();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const nameValid = businessName.trim().length > 0;

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2 text-center">
        Tell us about your business
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6 text-center max-w-md">
        We'll use this to personalize your experience.
      </p>

      <div className="w-full max-w-lg space-y-4 mb-8">
        {/* Business Name */}
        <div>
          <label
            htmlFor="business-name"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
          >
            Business Name <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            ref={nameRef}
            id="business-name"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Acme Corp"
            data-testid="business-name-input"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          />
        </div>

        {/* Industry */}
        <div>
          <label
            htmlFor="industry"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
          >
            Industry
          </label>
          <select
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            data-testid="industry-select"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          >
            <option value="">Select an industry...</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="business-desc"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
          >
            Brief Description
          </label>
          <textarea
            id="business-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does your business do? (optional)"
            rows={3}
            data-testid="business-desc-input"
            className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={back}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-subtle)]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!nameValid}
          data-testid="next-btn"
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
