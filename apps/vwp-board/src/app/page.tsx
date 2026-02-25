"use client";

import { ChatView } from "@/components/chat";
import { AgentStatusPanel } from "@/components/dashboard/AgentStatusPanel";
import { ScratchpadBox } from "@/components/dashboard/ScratchpadBox";
import { NorthStarBanner } from "@/components/dashboard/NorthStarBanner";
import { getMissionControlFeatures } from "@/lib/features";

export default function HomePage() {
  const features = getMissionControlFeatures();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
        Mission Control Scaffold • enabled: {Object.entries(features).filter(([, v]) => v).map(([k]) => k).join(", ")}
      </div>
      <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {features.statusPanel && <AgentStatusPanel />}
          {features.northStar && <NorthStarBanner />}
        </div>
      </div>
      <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <ScratchpadBox />
      </div>
      <div className="min-h-0 flex-1">
        <ChatView />
      </div>
    </div>
  );
}
