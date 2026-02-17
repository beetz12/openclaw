"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface NetworkErrorProps {
  connected: boolean;
  onRetry: () => void;
}

export function NetworkError({ connected, onRetry }: NetworkErrorProps) {
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const retryAttempt = useRef(0);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  }, []);

  const startCountdown = useCallback(
    (seconds: number) => {
      clearCountdown();
      setCountdown(seconds);
      countdownTimer.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearCountdown();
            onRetry();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearCountdown, onRetry],
  );

  useEffect(() => {
    if (connected) {
      setVisible(false);
      retryAttempt.current = 0;
      clearCountdown();
    } else {
      setVisible(true);
      // Exponential backoff: 5s, 10s, 20s, 30s max
      const delay = Math.min(5 * Math.pow(2, retryAttempt.current), 30);
      retryAttempt.current += 1;
      startCountdown(delay);
    }
  }, [connected, clearCountdown, startCountdown]);

  useEffect(() => {
    return () => clearCountdown();
  }, [clearCountdown]);

  if (!visible) {return null;}

  const statusColor = countdown > 0 ? "bg-amber-400" : "bg-rose-500";

  return (
    <div className="border-b border-[var(--color-border)] bg-amber-50 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
          <span className="text-sm font-medium text-amber-800">
            Connection lost
          </span>
          {countdown > 0 && (
            <span className="text-xs text-amber-600">
              Retrying in {countdown}s...
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            clearCountdown();
            retryAttempt.current = 0;
            onRetry();
          }}
          className="rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
        >
          Retry Now
        </button>
      </div>
    </div>
  );
}
