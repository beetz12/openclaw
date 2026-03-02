"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kanbanApi } from "@/lib/api-client";
import type { KanbanTask } from "@/types/kanban";
import { CostSummary } from "./CostSummary";
import { CostChart, type DailyCost } from "./CostChart";
import { CostBreakdown, type TaskCostEntry } from "./CostBreakdown";

type DateRange = "7d" | "30d" | "all";

function filterByRange(tasks: KanbanTask[], range: DateRange): KanbanTask[] {
  if (range === "all") {return tasks;}
  const now = Date.now();
  const days = range === "7d" ? 7 : 30;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return tasks.filter((t) => t.updatedAt >= cutoff || t.createdAt >= cutoff);
}

function buildDailyCosts(tasks: KanbanTask[]): DailyCost[] {
  const byDate = new Map<string, { cost: number; hasSuccess: boolean; hasFailed: boolean }>();

  for (const t of tasks) {
    if (!t.actualCost) {continue;}
    const dateStr = new Date(t.updatedAt || t.createdAt).toISOString().slice(0, 10);
    const entry = byDate.get(dateStr) ?? { cost: 0, hasSuccess: false, hasFailed: false };
    entry.cost += t.actualCost.usd;
    if (t.status === "completed") {entry.hasSuccess = true;}
    if (t.status === "failed") {entry.hasFailed = true;}
    byDate.set(dateStr, entry);
  }

  return Array.from(byDate.entries())
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      cost: d.cost,
      status: d.hasSuccess && d.hasFailed ? "mixed" : d.hasFailed ? "failed" : "success",
    }));
}

function buildEntries(tasks: KanbanTask[]): TaskCostEntry[] {
  return tasks
    .filter((t) => t.actualCost)
    .map((t) => ({
      id: t.id,
      text: t.text,
      date: new Date(t.updatedAt || t.createdAt).toISOString().slice(0, 10),
      tokens: t.actualCost!.tokens,
      cost: t.actualCost!.usd,
      durationMs:
        t.updatedAt && t.createdAt ? t.updatedAt - t.createdAt : 0,
      status:
        t.status === "completed"
          ? ("completed" as const)
          : t.status === "failed"
            ? ("failed" as const)
            : ("running" as const),
    }));
}

type GatewayUsage = {
  totals: { totalCost: number; totalTokens: number; input: number; output: number };
  daily: Array<{ date: string; totalCost: number; totalTokens: number }>;
} | null;

export function CostDashboard() {
  const router = useRouter();
  const [allTasks, setAllTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>("30d");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [gatewayUsage, setGatewayUsage] = useState<GatewayUsage>(null);

  const loadCostData = useCallback(async () => {
    try {
      const board = await kanbanApi.getBoard();
      const tasks = Object.values(board.columns).flat();
      setAllTasks(tasks);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      const msg =
        err && typeof err === "object" && "error" in err
          ? (err as { error: string }).error
          : "Failed to load cost data";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    try {
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 365;
      const usage = await kanbanApi.getUsageCost({ days });
      setGatewayUsage({ totals: usage.totals, daily: usage.daily });
    } catch {
      // Gateway may not be connected — leave as null
    }
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) {return;}
      await loadCostData();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCostData]);

  const filtered = useMemo(() => filterByRange(allTasks, range), [allTasks, range]);

  const summary = useMemo(() => {
    const withCost = filtered.filter((t) => t.actualCost);
    const totalSpend = withCost.reduce((sum, t) => sum + (t.actualCost?.usd ?? 0), 0);
    const totalTokens = withCost.reduce((sum, t) => sum + (t.actualCost?.tokens ?? 0), 0);
    const completed = withCost.filter((t) => t.status === "completed").length;
    return {
      totalSpend,
      tasksCompleted: completed,
      avgCostPerTask: completed > 0 ? totalSpend / completed : 0,
      totalTokens,
    };
  }, [filtered]);

  const dailyCosts = useMemo(() => buildDailyCosts(filtered), [filtered]);
  const entries = useMemo(() => buildEntries(filtered), [filtered]);

  const handleRowClick = useCallback(
    (taskId: string) => {
      router.push(`/board/${taskId}`);
    },
    [router],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-[var(--color-text-muted)]">
          Loading cost data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void loadCostData();
            }}
            className="mt-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const RANGES: Array<{ value: DateRange; label: string }> = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "all", label: "All time" },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">Cost Dashboard</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : "Not updated yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void loadCostData();
            }}
            disabled={refreshing}
            className="rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <div className="flex gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              data-testid={`range-${r.value}`}
              className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                range === r.value
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              }`}
            >
              {r.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <CostSummary
        totalSpend={summary.totalSpend}
        tasksCompleted={summary.tasksCompleted}
        avgCostPerTask={summary.avgCostPerTask}
        totalTokens={summary.totalTokens}
        spendTrend={null}
        tasksTrend={null}
      />

      {/* Gateway usage section */}
      {gatewayUsage !== null && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
            Gateway Usage (All Sessions)
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-muted)]">Total Cost</p>
              <p className="mt-1 text-xl font-bold text-[var(--color-text)]">
                ${gatewayUsage.totals.totalCost.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-muted)]">Total Tokens</p>
              <p className="mt-1 text-xl font-bold text-[var(--color-text)]">
                {gatewayUsage.totals.totalTokens >= 1000
                  ? `${(gatewayUsage.totals.totalTokens / 1000).toFixed(1)}k`
                  : gatewayUsage.totals.totalTokens.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-muted)]">Input Tokens</p>
              <p className="mt-1 text-xl font-bold text-[var(--color-text)]">
                {gatewayUsage.totals.input >= 1000
                  ? `${(gatewayUsage.totals.input / 1000).toFixed(1)}k`
                  : gatewayUsage.totals.input.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-text-muted)]">Output Tokens</p>
              <p className="mt-1 text-xl font-bold text-[var(--color-text)]">
                {gatewayUsage.totals.output >= 1000
                  ? `${(gatewayUsage.totals.output / 1000).toFixed(1)}k`
                  : gatewayUsage.totals.output.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <CostChart data={dailyCosts} />

      {/* Breakdown table */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
          Task Breakdown
        </h3>
        <CostBreakdown entries={entries} onRowClick={handleRowClick} />
      </div>
    </div>
  );
}
