"use client";

import { useOnboarding, type BusinessType } from "./OnboardingProvider";

const TYPES: Array<{
  id: BusinessType;
  label: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    id: "ecommerce",
    label: "E-Commerce",
    desc: "Online store, product catalog, orders, shipping, and promotions.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
  },
  {
    id: "consulting",
    label: "IT Consultancy",
    desc: "Client projects, reports, proposals, and technical deliverables.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: "custom",
    label: "General / Other",
    desc: "Flexible workspace for any kind of business or personal tasks.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

export function BusinessTypeStep() {
  const { businessType, setBusinessType, next, back } = useOnboarding();

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2 text-center">
        What type of business do you run?
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6 text-center max-w-md">
        This helps us tailor suggestions and workflows to your needs.
      </p>

      <div className="grid gap-3 w-full max-w-lg mb-8">
        {TYPES.map((t) => {
          const selected = businessType === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setBusinessType(t.id)}
              data-testid={`type-${t.id}`}
              className={`flex items-start gap-4 rounded-[var(--radius-md)] border-2 p-4 text-left transition-colors ${
                selected
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-bg)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary-light)]"
              }`}
            >
              <div
                className={`shrink-0 flex items-center justify-center w-12 h-12 rounded-[var(--radius-sm)] ${
                  selected
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]"
                }`}
              >
                {t.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">
                    {t.label}
                  </h3>
                  {selected && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="var(--color-primary)"
                    >
                      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.78 5.22a.75.75 0 0 0-1.06 0L7 8.94 5.28 7.22a.75.75 0 1 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0 0-1.06Z" />
                    </svg>
                  )}
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                  {t.desc}
                </p>
              </div>
            </button>
          );
        })}
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
          disabled={!businessType}
          data-testid="next-btn"
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
