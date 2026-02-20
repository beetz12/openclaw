"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const COMPLETE_KEY = "vwp-board-onboarding-complete";
const TOKEN_KEY = "vwp-dashboard-token";
const BASE_URL_KEY = "vwp-dashboard-base-url";

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [checked, setChecked] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const checkOnboarding = async () => {
      setHydrated(true);
      // Backend is the source of truth. localStorage is only a cache hint.
      let isComplete = false;

      try {
        const cfgRes = await fetch("/api/config", { cache: "no-store" });
        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) as { gatewayToken?: string; hasToken?: boolean };
          if (cfg.hasToken && cfg.gatewayToken && !localStorage.getItem(TOKEN_KEY)) {
            localStorage.setItem(TOKEN_KEY, cfg.gatewayToken);
          }
        }

        if (!localStorage.getItem(BASE_URL_KEY)) {
          localStorage.setItem(BASE_URL_KEY, window.location.origin);
        }

        const token = localStorage.getItem(TOKEN_KEY) ?? "";
        const base = localStorage.getItem(BASE_URL_KEY) ?? window.location.origin;
        const res = await fetch(new URL("/vwp/onboarding", base).toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });

        if (res.ok) {
          const data = (await res.json()) as { completed?: boolean };
          isComplete = Boolean(data.completed);
        }
      } catch {
        // If backend is temporarily unavailable, use cached localStorage as fallback.
        isComplete = localStorage.getItem(COMPLETE_KEY) === "true";
      }

      if (isComplete) {
        localStorage.setItem(COMPLETE_KEY, "true");
      } else {
        localStorage.removeItem(COMPLETE_KEY);
      }

      if (cancelled) {return;}

      if (!isComplete && pathname !== "/onboarding") {
        router.replace("/onboarding");
      } else if (isComplete && pathname === "/onboarding") {
        router.replace("/");
      }

      setChecked(true);
    };

    void checkOnboarding();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // Don't render until hydration + onboarding check to prevent redirect flicker/loops.
  if (!hydrated || !checked) {return null;}

  return <>{children}</>;
}
