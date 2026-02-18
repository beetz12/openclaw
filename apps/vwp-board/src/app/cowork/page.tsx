"use client";

import { CoworkPanel } from "@/components/cowork/CoworkPanel";
import { CoworkStream } from "@/components/cowork/CoworkStream";

export default function CoworkPage() {
  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Left panel: project selector + controls */}
      <div className="w-full border-b border-[var(--color-border)] p-4 md:w-80 md:border-b-0 md:border-r md:overflow-auto">
        <h2 className="text-lg font-bold text-[var(--color-text)] mb-4">
          CoWork
        </h2>
        <CoworkPanel />
      </div>

      {/* Right panel: streaming output */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CoworkStream />
      </div>
    </div>
  );
}
