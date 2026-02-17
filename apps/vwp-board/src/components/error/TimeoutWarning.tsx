"use client";

import { useState, useEffect, useRef } from "react";

interface TimeoutWarningProps {
  /** When the task started, in ms since epoch */
  startedAt: number;
  /** Estimated duration in ms (if known) */
  estimatedDurationMs: number | null;
  onCancel: () => void;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {return `${seconds}s`;}
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) {return `${minutes}m ${secs}s`;}
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export function TimeoutWarning({
  startedAt,
  estimatedDurationMs,
  onCancel,
}: TimeoutWarningProps) {
  const [elapsed, setElapsed] = useState(Date.now() - startedAt);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => {
      if (intervalRef.current) {clearInterval(intervalRef.current);}
    };
  }, [startedAt]);

  // Only show warning if we've exceeded the estimate
  if (!estimatedDurationMs || elapsed < estimatedDurationMs) {return null;}

  const ratio = elapsed / estimatedDurationMs;
  const showCancel = ratio >= 2;

  return (
    <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <span className="text-xs font-medium text-amber-800">
            Still running...
          </span>
          <span className="text-xs text-amber-600">
            {formatElapsed(elapsed)} elapsed
            {estimatedDurationMs && (
              <> (est. {formatElapsed(estimatedDurationMs)})</>
            )}
          </span>
        </div>
        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
          >
            Cancel Task
          </button>
        )}
      </div>
    </div>
  );
}
