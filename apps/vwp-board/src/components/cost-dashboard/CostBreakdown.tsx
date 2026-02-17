"use client";

import { useCallback, useState } from "react";

export interface TaskCostEntry {
  id: string;
  text: string;
  date: string;
  tokens: number;
  cost: number;
  durationMs: number;
  status: "completed" | "failed" | "running";
}

interface CostBreakdownProps {
  entries: TaskCostEntry[];
  onRowClick?: (taskId: string) => void;
}

type SortField = "cost" | "date";
type SortDir = "asc" | "desc";

function StatusBadge({ status }: { status: TaskCostEntry["status"] }) {
  const styles: Record<string, string> = {
    completed:
      "bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]",
    failed:
      "bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]",
    running:
      "bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]",
  };

  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) {return `${ms}ms`;}
  const secs = ms / 1000;
  if (secs < 60) {return `${secs.toFixed(1)}s`;}
  const mins = Math.floor(secs / 60);
  const remainSecs = Math.round(secs % 60);
  return `${mins}m ${remainSecs}s`;
}

export function CostBreakdown({ entries, onRowClick }: CostBreakdownProps) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField],
  );

  const sorted = [...entries].toSorted((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortField === "cost") {return (a.cost - b.cost) * mul;}
    return (new Date(a.date).getTime() - new Date(b.date).getTime()) * mul;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {return null;}
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="currentColor"
        className={`inline ml-0.5 ${sortDir === "asc" ? "rotate-180" : ""}`}
      >
        <path d="M6 8l3-4H3l3 4z" />
      </svg>
    );
  };

  if (entries.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-32 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
        data-testid="cost-breakdown-empty"
      >
        <p className="text-sm text-[var(--color-text-muted)]">No task data</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
      data-testid="cost-breakdown"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">
                Task
              </th>
              <th
                className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)] cursor-pointer select-none"
                onClick={() => toggleSort("date")}
              >
                Date <SortIcon field="date" />
              </th>
              <th className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">
                Tokens
              </th>
              <th
                className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)] cursor-pointer select-none"
                onClick={() => toggleSort("cost")}
              >
                Cost <SortIcon field="cost" />
              </th>
              <th className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">
                Duration
              </th>
              <th className="px-4 py-3 text-center font-medium text-[var(--color-text-secondary)]">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <tr
                key={entry.id}
                onClick={() => onRowClick?.(entry.id)}
                className={`border-b border-[var(--color-border)] last:border-b-0 transition-colors ${
                  onRowClick
                    ? "cursor-pointer hover:bg-[var(--color-bg-subtle)]"
                    : ""
                }`}
                data-testid="cost-row"
              >
                <td className="px-4 py-3 max-w-[200px] truncate text-[var(--color-text)]">
                  {entry.text}
                </td>
                <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">
                  {new Date(entry.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                  {entry.tokens.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">
                  ${entry.cost.toFixed(4)}
                </td>
                <td className="px-4 py-3 text-right text-[var(--color-text-secondary)] whitespace-nowrap">
                  {formatDuration(entry.durationMs)}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={entry.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
