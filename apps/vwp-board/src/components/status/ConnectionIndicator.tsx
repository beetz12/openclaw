"use client";

interface ConnectionIndicatorProps {
  sseConnected: boolean;
  sseStale: boolean;
  gatewayConnected: boolean;
}

export function ConnectionIndicator({
  sseConnected,
  sseStale,
  gatewayConnected,
}: ConnectionIndicatorProps) {
  const sseStatus = !sseConnected
    ? { color: "bg-rose-500", label: "Offline" }
    : sseStale
      ? { color: "bg-amber-400", label: "Stale" }
      : { color: "bg-emerald-500", label: "Live" };

  const gwStatus = gatewayConnected
    ? { color: "bg-emerald-500", label: "Gateway" }
    : { color: "bg-slate-300", label: "Gateway offline" };

  return (
    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
      <div className="flex items-center gap-1.5" title={`SSE: ${sseStatus.label}`}>
        <span className={`h-2 w-2 rounded-full ${sseStatus.color}`} />
        {sseStatus.label}
      </div>
      <div className="flex items-center gap-1.5" title={`Gateway: ${gwStatus.label}`}>
        <span className={`h-2 w-2 rounded-full ${gwStatus.color}`} />
        {gwStatus.label}
      </div>
    </div>
  );
}
