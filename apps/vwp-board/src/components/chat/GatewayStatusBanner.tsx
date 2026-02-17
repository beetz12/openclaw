"use client";

interface GatewayStatusBannerProps {
  connected: boolean;
}

export function GatewayStatusBanner({ connected }: GatewayStatusBannerProps) {
  if (connected) {return null;}

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
        <span className="text-sm font-medium text-amber-800">
          OpenClaw Gateway is not running.
        </span>
        <span className="text-xs text-amber-600">
          Start it with:{" "}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-800">
            pnpm vwp:start
          </code>
        </span>
      </div>
    </div>
  );
}
