"use client";

export interface DailyCost {
  date: string; // e.g. "2026-02-14"
  cost: number;
  status: "success" | "failed" | "mixed";
}

interface CostChartProps {
  data: DailyCost[];
}

export function CostChart({ data }: CostChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-48 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
        data-testid="cost-chart-empty"
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          No cost data available
        </p>
      </div>
    );
  }

  const maxCost = Math.max(...data.map((d) => d.cost), 0.01);

  const barColor = (status: DailyCost["status"]) => {
    switch (status) {
      case "success":
        return "var(--color-primary)";
      case "failed":
        return "var(--color-danger)";
      case "mixed":
        return "var(--color-warning)";
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 overflow-y-auto"
      style={{ maxHeight: "420px" }}
      data-testid="cost-chart"
    >
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">
        Daily Cost
      </h3>
      <div className="space-y-2">
        {data.map((d) => {
          const widthPct = Math.max((d.cost / maxCost) * 100, 2);
          return (
            <div key={d.date} className="flex items-center gap-3">
              <span className="shrink-0 w-16 text-xs text-[var(--color-text-secondary)] text-right">
                {formatDate(d.date)}
              </span>
              <div className="flex-1 h-6 bg-[var(--color-bg-subtle)] rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: barColor(d.status),
                  }}
                  data-testid="cost-bar"
                />
              </div>
              <span className="shrink-0 w-16 text-xs font-mono text-[var(--color-text)] text-right">
                ${d.cost.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
