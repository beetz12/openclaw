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
import { kanbanApi } from "@/lib/api-client";

export type BusinessType = "ecommerce" | "consulting" | "custom";

export interface OnboardingState {
  currentStep: number;
  businessType: BusinessType | null;
  userName: string;
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
  setUserName: (name: string) => void;
  setBusinessName: (name: string) => void;
  setIndustry: (industry: string) => void;
  setDescription: (desc: string) => void;
  setApiUrl: (url: string) => void;
  setApiToken: (token: string) => void;
  completeOnboarding: () => Promise<void>;
  totalSteps: number;
}

const STORAGE_KEY = "vwp-board-onboarding-state";
const COMPLETE_KEY = "vwp-board-onboarding-complete";
const TOTAL_STEPS = 5;

const defaultState: OnboardingState = {
  currentStep: 1,
  businessType: null,
  userName: "",
  businessName: "",
  industry: "",
  description: "",
  apiUrl: "",
  apiToken: "",
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function migrateBusinessType(type: string | null): BusinessType | null {
  if (!type) {return null;}
  const migrations: Record<string, BusinessType> = {
    "e-commerce": "ecommerce",
    "it-consultancy": "consulting",
    "general": "custom",
  };
  return (migrations[type]) ?? (type as BusinessType);
}

function loadState(): OnboardingState {
  if (typeof window === "undefined") {return defaultState;}
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = { ...defaultState, ...JSON.parse(raw) };
      parsed.businessType = migrateBusinessType(parsed.businessType);
      return parsed;
    }
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
  const setUserName = useCallback(
    (name: string) => setState((s) => ({ ...s, userName: name })),
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

  const completeOnboarding = useCallback(async () => {
    if (typeof window === "undefined") {return;}

    // Save credentials if provided
    if (state.apiUrl) {localStorage.setItem("vwp-dashboard-base-url", state.apiUrl);}
    if (state.apiToken) {localStorage.setItem("vwp-dashboard-token", state.apiToken);}

    // Attempt backend API call (backend derives team from businessType)
    try {
      await kanbanApi.completeOnboarding({
        businessType: state.businessType ?? "custom",
        businessName: state.businessName,
        userName: state.userName,
        team: [],
      });
    } catch {
      // fallback: localStorage only
    }

    // Save profile to localStorage as fallback/cache
    localStorage.setItem(
      "vwp-board-profile",
      JSON.stringify({
        businessType: state.businessType,
        userName: state.userName,
        businessName: state.businessName,
        industry: state.industry,
        description: state.description,
      }),
    );

    // Mark onboarding complete and clean up wizard state
    localStorage.setItem(COMPLETE_KEY, "true");
    localStorage.removeItem(STORAGE_KEY);
  }, [state]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      ...state,
      setStep,
      next,
      back,
      setBusinessType,
      setUserName,
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
      setUserName,
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
