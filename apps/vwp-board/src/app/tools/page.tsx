"use client";

import { useEffect, useState, useCallback } from "react";
import { useBoardStore } from "@/store/board-store";
import { kanbanApi } from "@/lib/api-client";
import type { ToolRunInfo, ToolRunStatus } from "@/types/kanban";

// ---------- Types ----------

interface ToolDef {
  name: string;
  label: string;
  description: string;
  category: string;
  args_schema: Record<
    string,
    { type: string; values?: string[]; required?: boolean; label: string }
  >;
  runtime: string;
  timeout_seconds?: number;
}

/** Maximum output size before truncation (matches backend default). */
const MAX_OUTPUT_BYTES = 512 * 1024;

function formatTimeout(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${seconds}s`;
}

function isApiError(err: unknown): err is { error: string; status: number; code?: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "error" in err &&
    "status" in err
  );
}

// ---------- Status Badge ----------

function StatusBadge({ status }: { status: ToolRunStatus }) {
  const colors: Record<ToolRunStatus, string> = {
    queued: "bg-gray-200 text-gray-700",
    running: "bg-blue-100 text-blue-700 animate-pulse",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? ""}`}
    >
      {status}
    </span>
  );
}

// ---------- Tool Card ----------

function ToolCard({
  tool,
  onRun,
}: {
  tool: ToolDef;
  onRun: (tool: ToolDef) => void;
}) {
  const categoryColors: Record<string, string> = {
    research: "border-l-blue-500",
    content: "border-l-purple-500",
  };

  return (
    <div
      className={`rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 border-l-4 ${categoryColors[tool.category] ?? "border-l-gray-400"}`}
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">
            {tool.label}
          </h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            {tool.category}
          </span>
        </div>
        <span className="rounded bg-[var(--color-bg-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
          {tool.runtime}
        </span>
      </div>
      <p className="mb-3 text-xs text-[var(--color-text-secondary)] leading-relaxed">
        {tool.description}
      </p>
      {tool.timeout_seconds != null && (
        <div className="mb-3 text-[10px] text-[var(--color-text-muted)]">
          Timeout: {formatTimeout(tool.timeout_seconds)}
        </div>
      )}
      <button
        onClick={() => onRun(tool)}
        className="w-full rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
      >
        Run
      </button>
    </div>
  );
}

// ---------- Run Dialog ----------

function RunDialog({
  tool,
  onClose,
  onSubmit,
}: {
  tool: ToolDef;
  onClose: () => void;
  onSubmit: (args: Record<string, string>) => Promise<void>;
}) {
  const [args, setArgs] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunning(true);
    try {
      await onSubmit(args);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-[var(--color-text)]">
          Run {tool.label}
        </h2>
        <p className="mb-4 text-xs text-[var(--color-text-secondary)]">
          {tool.description}
        </p>
        {tool.timeout_seconds != null && (
          <div className="mb-3 text-xs text-[var(--color-text-muted)]">
            Timeout: {formatTimeout(tool.timeout_seconds)}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {Object.entries(tool.args_schema).map(([key, schema]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text)]">
                {schema.label}
                {schema.required && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </label>
              {schema.type === "enum" && schema.values ? (
                <select
                  value={args[key] ?? ""}
                  onChange={(e) =>
                    setArgs((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  required={schema.required}
                  disabled={isRunning}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50"
                >
                  <option value="">Select...</option>
                  {schema.values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : schema.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={args[key] === "true"}
                  onChange={(e) =>
                    setArgs((prev) => ({
                      ...prev,
                      [key]: e.target.checked ? "true" : "",
                    }))
                  }
                  disabled={isRunning}
                  className="h-4 w-4 disabled:opacity-50"
                />
              ) : (
                <input
                  type="text"
                  value={args[key] ?? ""}
                  onChange={(e) =>
                    setArgs((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  required={schema.required}
                  disabled={isRunning}
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-50"
                  placeholder={schema.label}
                />
              )}
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isRunning}
              className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRunning}
              className="flex-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isRunning && (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {isRunning ? "Starting..." : "Start Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Run Output Viewer ----------

function RunOutputViewer({
  run,
  output,
  onCancel,
}: {
  run: ToolRunInfo;
  output: string;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">
            {run.toolLabel ?? run.toolName}
          </h3>
          <StatusBadge status={run.status} />
        </div>
        {run.status === "running" && (
          <button
            onClick={onCancel}
            className="rounded-[var(--radius-sm)] border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Cancel
          </button>
        )}
      </div>
      <div className="text-xs text-[var(--color-text-muted)] mb-2">
        Started {new Date(run.startedAt).toLocaleTimeString()}
        {run.completedAt &&
          ` — finished in ${Math.round((run.completedAt - run.startedAt) / 1000)}s`}
      </div>
      {output && (
        <pre className="max-h-64 overflow-auto rounded bg-[var(--color-bg)] p-3 font-mono text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
          {output}
          {run.status === "running" && output.length >= MAX_OUTPUT_BYTES * 0.95 && (
            <span className="block mt-1 text-yellow-600 font-sans font-medium">
              [Output truncated — limit reached]
            </span>
          )}
        </pre>
      )}
      {run.error && (
        <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
          {run.error}
        </div>
      )}
    </div>
  );
}

// ---------- Main Page ----------

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<ToolDef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const toolRuns = useBoardStore((s) => s.toolRuns);
  const toolOutputs = useBoardStore((s) => s.toolOutputs);
  const toolRunsStale = useBoardStore((s) => s.toolRunsStale);
  const fetchToolRuns = useBoardStore((s) => s.fetchToolRuns);

  useEffect(() => {
    async function load() {
      try {
        const data = await kanbanApi.listTools();
        setTools(data.tools);
        if (data.warning) {setWarning(data.warning);}
        await fetchToolRuns();
      } catch {
        setError("Failed to load tools. Is the dispatch plugin running?");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [fetchToolRuns]);

  const handleRun = useCallback(
    async (args: Record<string, string>) => {
      if (!selectedTool) {return;}
      try {
        await kanbanApi.runTool(selectedTool.name, args);
        setSelectedTool(null);
        setError(null);
      } catch (err) {
        if (isApiError(err) && err.code === "CONCURRENCY_LIMIT") {
          setError("All tool slots are in use (max 3). Cancel a running tool to free a slot.");
        } else if (isApiError(err) && err.code === "RUNTIME_NOT_FOUND") {
          setError("The required runtime (Python 3 or Node.js) is not installed on the server.");
        } else {
          const msg = isApiError(err) ? err.error : (err instanceof Error ? err.message : String(err));
          setError(`Failed to start ${selectedTool.label}: ${msg}`);
        }
      }
    },
    [selectedTool],
  );

  const handleCancel = useCallback(async (runId: string) => {
    try {
      await kanbanApi.cancelToolRun(runId);
    } catch {
      // SSE will update the status
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-[var(--color-text-muted)]">
          Loading tools...
        </div>
      </div>
    );
  }

  const activeRuns = toolRuns.filter((r) => r.status === "running");
  const recentRuns = toolRuns
    .filter((r) => r.status !== "running")
    .toSorted((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 10);

  return (
    <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">
          Workspace Tools
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Launch and monitor workspace tools from Mission Control
        </p>
      </div>

      {toolRunsStale && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
          Connection lost — tool status may be outdated
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Active Runs */}
      {activeRuns.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
            Active Runs ({activeRuns.length})
          </h2>
          <div className="flex flex-col gap-3">
            {activeRuns.map((run) => (
              <RunOutputViewer
                key={run.runId}
                run={run}
                output={toolOutputs[run.runId] ?? ""}
                onCancel={() => handleCancel(run.runId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tool Grid */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
          Available Tools ({tools.length})
        </h2>
        {tools.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-muted)]">
            No workspace tools found. Add tool manifests to the{" "}
            <code className="rounded bg-[var(--color-bg-subtle)] px-1 py-0.5">tools/</code>{" "}
            directory.
            {warning && (
              <div className="mt-2 text-xs text-yellow-700">{warning}</div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard
                key={tool.name}
                tool={tool}
                onRun={setSelectedTool}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Runs */}
      {recentRuns.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
            Recent Runs
          </h2>
          <div className="flex flex-col gap-2">
            {recentRuns.map((run) => (
              <div
                key={run.runId}
                className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {run.toolLabel ?? run.toolName}
                  </span>
                  <StatusBadge status={run.status} />
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {run.completedAt
                    ? new Date(run.completedAt).toLocaleString()
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run Dialog */}
      {selectedTool && (
        <RunDialog
          tool={selectedTool}
          onClose={() => setSelectedTool(null)}
          onSubmit={handleRun}
        />
      )}
    </div>
  );
}
