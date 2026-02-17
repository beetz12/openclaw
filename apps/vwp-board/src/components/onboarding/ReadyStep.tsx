"use client";

import { useRouter } from "next/navigation";
import { useOnboarding } from "./OnboardingProvider";

const SUGGESTED_TASKS: Record<string, string> = {
  "e-commerce": "Run a seasonal promotion campaign",
  "it-consultancy": "Draft a client status report",
  general: "Organize my upcoming tasks",
};

export function ReadyStep() {
  const {
    businessType,
    businessName,
    industry,
    description,
    apiUrl,
    completeOnboarding,
    back,
  } = useOnboarding();
  const router = useRouter();

  const suggestedTask = SUGGESTED_TASKS[businessType ?? "general"];

  const handleComplete = () => {
    completeOnboarding();
    router.push("/board");
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-success-bg)]">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
        You're all set!
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6 max-w-md">
        Your workspace is configured and ready to go.
      </p>

      {/* Summary */}
      <div className="w-full max-w-md mb-6 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
          Your Setup
        </h3>
        <dl className="space-y-2 text-sm">
          {businessName && (
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-secondary)]">Business</dt>
              <dd className="font-medium text-[var(--color-text)]" data-testid="summary-name">
                {businessName}
              </dd>
            </div>
          )}
          {businessType && (
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-secondary)]">Type</dt>
              <dd className="font-medium text-[var(--color-text)]" data-testid="summary-type">
                {businessType === "e-commerce"
                  ? "E-Commerce"
                  : businessType === "it-consultancy"
                    ? "IT Consultancy"
                    : "General"}
              </dd>
            </div>
          )}
          {industry && (
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-secondary)]">Industry</dt>
              <dd className="font-medium text-[var(--color-text)]">{industry}</dd>
            </div>
          )}
          {description && (
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-secondary)]">Description</dt>
              <dd className="font-medium text-[var(--color-text)] max-w-[200px] truncate">
                {description}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-secondary)]">Server</dt>
            <dd className="font-medium text-[var(--color-text)]">
              {apiUrl ? "Configured" : "Not set (using default)"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Suggested first task */}
      <div className="w-full max-w-md mb-8 rounded-[var(--radius-md)] border border-dashed border-[var(--color-primary-light)] bg-[var(--color-primary-bg)] p-4 text-left">
        <p className="text-xs font-semibold text-[var(--color-primary)] mb-1">
          Suggested first task
        </p>
        <p className="text-sm text-[var(--color-text)]" data-testid="suggested-task">
          {suggestedTask}
        </p>
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
          onClick={handleComplete}
          data-testid="go-to-board-btn"
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
        >
          Go to Board
        </button>
      </div>
    </div>
  );
}
