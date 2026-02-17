"use client";

import { useRef, useEffect, useState } from "react";
import { OnboardingProvider, useOnboarding } from "./OnboardingProvider";
import { WelcomeStep } from "./WelcomeStep";
import { BusinessTypeStep } from "./BusinessTypeStep";
import { BusinessBasicsStep } from "./BusinessBasicsStep";
import { ConnectionStep } from "./ConnectionStep";
import { ReadyStep } from "./ReadyStep";

function ProgressBar() {
  const { currentStep, totalSteps } = useOnboarding();
  const pct = (currentStep / totalSteps) * 100;

  return (
    <div className="w-full max-w-lg mx-auto mb-8">
      <div className="flex justify-between mb-2">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          Step {currentStep} of {totalSteps}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[var(--color-bg-muted)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
        />
      </div>
    </div>
  );
}

function StepRenderer() {
  const { currentStep } = useOnboarding();
  const [direction, setDirection] = useState<"left" | "right">("right");
  const prevStep = useRef(currentStep);

  useEffect(() => {
    if (currentStep > prevStep.current) {
      setDirection("right");
    } else if (currentStep < prevStep.current) {
      setDirection("left");
    }
    prevStep.current = currentStep;
  }, [currentStep]);

  const step = (() => {
    switch (currentStep) {
      case 1:
        return <WelcomeStep />;
      case 2:
        return <BusinessTypeStep />;
      case 3:
        return <BusinessBasicsStep />;
      case 4:
        return <ConnectionStep />;
      case 5:
        return <ReadyStep />;
      default:
        return <WelcomeStep />;
    }
  })();

  return (
    <div
      key={currentStep}
      className={`animate-slide-in ${direction === "right" ? "slide-from-right" : "slide-from-left"}`}
    >
      {step}
    </div>
  );
}

function WizardInner() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-[var(--color-bg)]">
      <div className="w-full max-w-2xl">
        <ProgressBar />
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8 shadow-[var(--shadow-md)]">
          <StepRenderer />
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .slide-from-right { animation: slideInRight 0.25s var(--ease-out, ease-out) forwards; }
        .slide-from-left { animation: slideInLeft 0.25s var(--ease-out, ease-out) forwards; }
      `}</style>
    </div>
  );
}

export function OnboardingWizard() {
  return (
    <OnboardingProvider>
      <WizardInner />
    </OnboardingProvider>
  );
}
