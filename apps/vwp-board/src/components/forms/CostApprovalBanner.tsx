"use client";

interface CostApprovalBannerProps {
  costEstimate: {
    estimatedTokens: number;
    estimatedCostUsd: number;
    breakdown: { analysis: number; perAgent: number; synthesis: number };
  };
  teamSize: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {return `~${(tokens / 1000).toFixed(1)}k tokens`;}
  return `~${tokens} tokens`;
}

export function CostApprovalBanner({
  costEstimate,
  teamSize,
  onConfirm,
  onCancel,
  loading = false,
}: CostApprovalBannerProps) {
  const isHighCost = costEstimate.estimatedCostUsd > 1.0;

  return (
    <div
      className={`rounded-xl border bg-white shadow-[var(--shadow-sm)] ${
        isHighCost
          ? "border-[var(--color-warning)] bg-[var(--color-warning-bg)]"
          : "border-[var(--color-border)]"
      }`}
    >
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        {/* Cost info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {isHighCost && (
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="var(--color-warning)"
                className="shrink-0"
              >
                <path d="M10 2L1 18h18L10 2zm0 3.5l6.5 11.5H3.5L10 5.5zM9 9v4h2V9H9zm0 5v2h2v-2H9z" />
              </svg>
            )}
            <span
              className="font-mono text-2xl font-bold text-[var(--color-text)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {formatCost(costEstimate.estimatedCostUsd)}
            </span>
            <span className="text-sm text-[var(--color-text-muted)]">estimated</span>
          </div>

          {/* Breakdown */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-secondary)]">
            <span>
              Analysis: {formatCost(costEstimate.breakdown.analysis)}
            </span>
            <span className="text-[var(--color-text-muted)]">|</span>
            <span>
              Agents (&times;{teamSize}): {formatCost(costEstimate.breakdown.perAgent * teamSize)}
            </span>
            <span className="text-[var(--color-text-muted)]">|</span>
            <span>
              Synthesis: {formatCost(costEstimate.breakdown.synthesis)}
            </span>
          </div>

          {/* Meta info */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-[var(--color-text-muted)]">
            <span>{formatTokens(costEstimate.estimatedTokens)}</span>
            <span>
              {teamSize} specialist agent{teamSize !== 1 ? "s" : ""} + 1 lead
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white px-5 font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex min-h-11 animate-pulse items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
            style={{ animationDuration: "2s" }}
          >
            {loading && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? "Confirming..." : "Confirm & Execute"}
          </button>
        </div>
      </div>
    </div>
  );
}
