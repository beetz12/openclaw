"use client";

import { useCallback, useEffect, useState } from "react";
import { useOnboarding } from "./OnboardingProvider";

type DetectState = "probing" | "connected" | "failed";

export function ConnectionStep() {
  const { apiUrl, setApiUrl, apiToken, setApiToken, next, back } = useOnboarding();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testError, setTestError] = useState("");
  const [detectState, setDetectState] = useState<DetectState>("probing");

  // Auto-detect the local gateway on mount
  useEffect(() => {
    let cancelled = false;

    async function autoDetect() {
      try {
        // 1. Fetch the gateway token from the Next.js server
        const configRes = await fetch("/api/config");
        if (!configRes.ok || cancelled) {
          setDetectState("failed");
          return;
        }
        const { gatewayToken, hasToken } = await configRes.json();
        if (!hasToken || cancelled) {
          setDetectState("failed");
          return;
        }

        // 2. Test connectivity to the gateway via the proxy
        const testRes = await fetch("/vwp/onboarding", {
          headers: { Authorization: `Bearer ${gatewayToken}` },
        });
        if (cancelled) {return;}

        if (testRes.ok) {
          // Auto-configure: save the token and advance past this step
          setApiToken(gatewayToken);
          localStorage.setItem("vwp-dashboard-token", gatewayToken);
          setDetectState("connected");
          // Brief flash so the user sees it connected, then advance
          setTimeout(() => {
            if (!cancelled) {next();}
          }, 600);
        } else {
          setDetectState("failed");
        }
      } catch {
        if (!cancelled) {setDetectState("failed");}
      }
    }

    void autoDetect();
    return () => { cancelled = true; };
    // Only run on mount — deps intentionally excluded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    setTestError("");

    try {
      const base = apiUrl || window.location.origin;
      const res = await fetch(new URL("/vwp/dispatch/board", base).toString(), {
        headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
      });

      if (res.ok) {
        setTestResult("success");
        // Also persist the token for future API calls
        if (apiToken) {
          localStorage.setItem("vwp-dashboard-token", apiToken);
        }
      } else {
        setTestResult("error");
        setTestError(`Server responded with status ${res.status}`);
      }
    } catch {
      setTestResult("error");
      setTestError("Could not connect. Check the URL and try again.");
    } finally {
      setTesting(false);
    }
  }, [apiUrl, apiToken]);

  // Show probing state while auto-detecting
  if (detectState === "probing") {
    return (
      <div className="flex flex-col items-center text-center py-8" data-testid="detecting-server">
        <div className="mb-4 flex items-center justify-center w-16 h-16">
          <svg
            className="animate-spin"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
          Detecting server...
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Looking for a running OpenClaw gateway.
        </p>
      </div>
    );
  }

  // Brief success flash before auto-advancing
  if (detectState === "connected") {
    return (
      <div className="flex flex-col items-center text-center py-8" data-testid="auto-connected">
        <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-success-bg)]">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-success)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
          Server connected
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Your OpenClaw gateway was detected automatically.
        </p>
      </div>
    );
  }

  // Manual fallback form (detectState === "failed")
  return (
    <div className="flex flex-col items-center">
      <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2 text-center">
        Connect to your server
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] mb-6 text-center max-w-md">
        We couldn&apos;t detect a running gateway automatically.
        Enter your server details below, or skip this step to set it up later.
      </p>

      <div className="w-full max-w-lg space-y-4 mb-6">
        {/* Server URL */}
        <div>
          <label
            htmlFor="api-url"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
          >
            Server URL
          </label>
          <input
            id="api-url"
            type="url"
            value={apiUrl}
            onChange={(e) => {
              setApiUrl(e.target.value);
              setTestResult(null);
            }}
            placeholder="https://your-server.example.com"
            data-testid="api-url-input"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          />
        </div>

        {/* API Token */}
        <div>
          <label
            htmlFor="api-token"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
          >
            API Token
          </label>
          <input
            id="api-token"
            type="password"
            value={apiToken}
            onChange={(e) => {
              setApiToken(e.target.value);
              setTestResult(null);
            }}
            placeholder="Bearer token"
            data-testid="api-token-input"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-4 py-2.5 text-sm font-mono text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] placeholder:font-sans focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
          />
        </div>

        {/* Test Connection */}
        <button
          type="button"
          onClick={testConnection}
          disabled={testing}
          data-testid="test-connection-btn"
          className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
        >
          {testing && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {testing ? "Testing..." : "Test Connection"}
        </button>

        {/* Result */}
        {testResult === "success" && (
          <div
            data-testid="connection-success"
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success-dark)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.78 5.22a.75.75 0 0 0-1.06 0L7 8.94 5.28 7.22a.75.75 0 1 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0 0-1.06Z" />
            </svg>
            Connection successful
          </div>
        )}
        {testResult === "error" && (
          <div
            data-testid="connection-error"
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-dark)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.354 5.354a.5.5 0 0 0 0 .707L7.293 8l-1.94 1.94a.5.5 0 1 0 .708.706L8 8.707l1.94 1.94a.5.5 0 0 0 .706-.708L8.707 8l1.94-1.94a.5.5 0 0 0-.708-.706L8 7.293 6.06 5.354a.5.5 0 0 0-.707 0Z" />
            </svg>
            {testError}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={back}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-subtle)]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={next}
          data-testid="skip-btn"
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-subtle)]"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={next}
          data-testid="next-btn"
          className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
        >
          Next
        </button>
      </div>
    </div>
  );
}
