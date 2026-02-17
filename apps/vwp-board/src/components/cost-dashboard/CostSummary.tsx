"use client";

interface CostSummaryProps {
  totalSpend: number;
  tasksCompleted: number;
  avgCostPerTask: number;
  totalTokens: number;
  spendTrend: number | null; // percentage, positive = up
  tasksTrend: number | null;
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) {return null;}
  const isUp = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isUp ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        {isUp ? (
          <path d="M6 2l4 5H2l4-5z" />
        ) : (
          <path d="M6 10l4-5H2l4 5z" />
        )}
      </svg>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function StatCard({
  label,
  value,
  mono,
  trend,
}: {
  label: string;
  value: string;
  mono?: boolean;
  trend?: number | null;
}) {
  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <p className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
        {label}
      </p>
      <div className="flex items-end gap-2">
        <p
          className={`text-xl font-bold text-[var(--color-text)] ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </p>
        {trend !== undefined && <TrendBadge value={trend ?? null} />}
      </div>
    </div>
  );
}

export function CostSummary({
  totalSpend,
  tasksCompleted,
  avgCostPerTask,
  totalTokens,
  spendTrend,
  tasksTrend,
}: CostSummaryProps) {
  const formatUsd = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatTokens = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : String(n);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="cost-summary">
      <StatCard
        label="Total Spend"
        value={formatUsd(totalSpend)}
        mono
        trend={spendTrend}
      />
      <StatCard
        label="Tasks Completed"
        value={String(tasksCompleted)}
        trend={tasksTrend}
      />
      <StatCard
        label="Avg Cost Per Task"
        value={formatUsd(avgCostPerTask)}
        mono
      />
      <StatCard
        label="Total Tokens"
        value={formatTokens(totalTokens)}
        mono
      />
    </div>
  );
}
