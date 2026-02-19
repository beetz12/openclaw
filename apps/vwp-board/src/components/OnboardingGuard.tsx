"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setHydrated(true);
    const isComplete =
      localStorage.getItem("vwp-board-onboarding-complete") === "true";

    if (!isComplete && pathname !== "/onboarding") {
      router.replace("/onboarding");
    } else if (isComplete && pathname === "/onboarding") {
      router.replace("/");
    }
  }, [pathname, router]);

  // Don't render anything until hydrated to prevent flash
  if (!hydrated) {return null;}

  return <>{children}</>;
}
