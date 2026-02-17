"use client";

import { useOnboarding } from "./OnboardingProvider";

const FEATURES = [
  {
    title: "Describe goals in plain language",
    desc: "Tell the system what you want to accomplish, and it figures out how.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: "AI breaks them into tasks",
    desc: "Complex goals are decomposed into clear, actionable subtasks automatically.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    title: "Review and approve results",
    desc: "Stay in control. Nothing runs without your approval first.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

export function WelcomeStep() {
  const { next } = useOnboarding();

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2">
        Welcome to VWP
      </h1>
      <p className="text-base text-[var(--color-text-secondary)] mb-8 max-w-md">
        Your AI-powered business assistant
      </p>

      <div className="grid gap-4 w-full max-w-lg mb-8">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex items-start gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left"
          >
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
              {f.icon}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">
                {f.title}
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={next}
        data-testid="get-started-btn"
        className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
      >
        Get Started
      </button>
    </div>
  );
}
