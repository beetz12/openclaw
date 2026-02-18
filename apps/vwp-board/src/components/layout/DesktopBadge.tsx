"use client";

import { useState, useEffect } from "react";

export function DesktopBadge() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(window.electronAPI?.isElectron === true);
  }, []);

  if (!isDesktop) {return null;}

  return (
    <span className="text-[10px] bg-[var(--color-accent)]/20 text-[var(--color-accent)] px-1.5 py-0.5 rounded-full ml-2">
      Desktop
    </span>
  );
}
