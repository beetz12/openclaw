"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type BusinessType = "e-commerce" | "it-consultancy" | "general";

export interface OnboardingState {
  currentStep: number;
  businessType: BusinessType | null;
  businessName: string;
  industry: string;
  description: string;
  apiUrl: string;
  apiToken: string;
}

interface OnboardingContextValue extends OnboardingState {
  setStep: (step: number) => void;
  next: () => void;
  back: () => void;
  setBusinessType: (type: BusinessType) => void;
  setBusinessName: (name: string) => void;
  setIndustry: (industry: string) => void;
  setDescription: (desc: string) => void;
  setApiUrl: (url: string) => void;
  setApiToken: (token: string) => void;
  completeOnboarding: () => void;
  totalSteps: number;
}

const STORAGE_KEY = "vwp-board-onboarding-state";
const COMPLETE_KEY = "vwp-board-onboarding-complete";
const TOTAL_STEPS = 5;

const defaultState: OnboardingState = {
  currentStep: 1,
  businessType: null,
  businessName: "",
  industry: "",
  description: "",
  apiUrl: "",
  apiToken: "",
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function loadState(): OnboardingState {
  if (typeof window === "undefined") {return defaultState;}
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {return { ...defaultState, ...JSON.parse(raw) };}
  } catch {
    // corrupt data, start fresh
  }
  return defaultState;
}

function saveState(state: OnboardingState) {
  if (typeof window === "undefined") {return;}
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  // Persist on change (after hydration)
  useEffect(() => {
    if (hydrated) {saveState(state);}
  }, [state, hydrated]);

  const setStep = useCallback(
    (step: number) =>
      setState((s) => ({ ...s, currentStep: Math.max(1, Math.min(step, TOTAL_STEPS)) })),
    [],
  );
  const next = useCallback(
    () =>
      setState((s) => ({
        ...s,
        currentStep: Math.min(s.currentStep + 1, TOTAL_STEPS),
      })),
    [],
  );
  const back = useCallback(
    () =>
      setState((s) => ({
        ...s,
        currentStep: Math.max(s.currentStep - 1, 1),
      })),
    [],
  );
  const setBusinessType = useCallback(
    (type: BusinessType) => setState((s) => ({ ...s, businessType: type })),
    [],
  );
  const setBusinessName = useCallback(
    (name: string) => setState((s) => ({ ...s, businessName: name })),
    [],
  );
  const setIndustry = useCallback(
    (industry: string) => setState((s) => ({ ...s, industry })),
    [],
  );
  const setDescription = useCallback(
    (desc: string) => setState((s) => ({ ...s, description: desc })),
    [],
  );
  const setApiUrl = useCallback(
    (url: string) => setState((s) => ({ ...s, apiUrl: url })),
    [],
  );
  const setApiToken = useCallback(
    (token: string) => setState((s) => ({ ...s, apiToken: token })),
    [],
  );

  const completeOnboarding = useCallback(() => {
    if (typeof window !== "undefined") {
      // Save credentials if provided
      if (state.apiUrl) {localStorage.setItem("vwp-dashboard-base-url", state.apiUrl);}
      if (state.apiToken) {localStorage.setItem("vwp-dashboard-token", state.apiToken);}

      // Save profile
      localStorage.setItem(
        "vwp-board-profile",
        JSON.stringify({
          businessType: state.businessType,
          businessName: state.businessName,
          industry: state.industry,
          description: state.description,
        }),
      );

      // Mark onboarding complete and clean up wizard state
      localStorage.setItem(COMPLETE_KEY, "true");
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [state]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      ...state,
      setStep,
      next,
      back,
      setBusinessType,
      setBusinessName,
      setIndustry,
      setDescription,
      setApiUrl,
      setApiToken,
      completeOnboarding,
      totalSteps: TOTAL_STEPS,
    }),
    [
      state,
      setStep,
      next,
      back,
      setBusinessType,
      setBusinessName,
      setIndustry,
      setDescription,
      setApiUrl,
      setApiToken,
      completeOnboarding,
    ],
  );

  if (!hydrated) {return null;}

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}

export function isOnboardingComplete(): boolean {
  if (typeof window === "undefined") {return false;}
  return localStorage.getItem(COMPLETE_KEY) === "true";
}
