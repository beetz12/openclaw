"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useTaskDetail } from "@/hooks/useTaskDetail";
import { kanbanApi } from "@/lib/api-client";

function SubtaskList({
  subtasks,
}: {
  subtasks: Array<{
    id: string;
    description: string;
    status: string;
    assignedAgent: string | null;
    result: string | null;
    error: string | null;
  }>;
}) {
  if (subtasks.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] italic">
        No subtasks decomposed yet.
      </p>
    );
  }

  const statusIcon: Record<string, string> = {
    pending: "bg-slate-300",
    running: "bg-teal-500 animate-pulse",
    completed: "bg-emerald-500",
    failed: "bg-rose-500",
  };

  return (
    <ul className="flex flex-col gap-2">
      {subtasks.map((st) => (
        <li
          key={st.id}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <div className="flex items-start gap-2">
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusIcon[st.status] ?? "bg-slate-300"}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text)]">
                {st.description}
              </p>
              {st.assignedAgent && (
                <p className="mt-0.5 text-xs text-[var(--color-primary)]">
                  Agent: {st.assignedAgent}
                </p>
              )}
              {st.result && (
                <p className="mt-1 text-xs text-[var(--color-text-secondary)] line-clamp-3">
                  {st.result}
                </p>
              )}
              {st.error && (
                <p className="mt-1 text-xs text-[var(--color-danger)]">
                  {st.error}
                </p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActivityFeed({
  entries,
}: {
  entries: Array<{
    id: string;
    timestamp: number;
    type: string;
    agentName?: string;
    action: string;
    detail: string;
  }>;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] italic">
        No activity yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text)]">
              {entry.agentName ?? entry.type}
            </span>
            <span>{entry.action}</span>
            <span className="ml-auto">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
          </div>
          {entry.detail && (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {entry.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function CostDisplay({
  costEstimate,
  actualCost,
}: {
  costEstimate: { estimatedCostUsd: number; estimatedTokens: number } | null;
  actualCost: { usd: number; tokens: number } | null;
}) {
  if (!costEstimate && !actualCost) {return null;}

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h4 className="text-sm font-semibold text-[var(--color-text)] mb-2">
        Cost
      </h4>
      <div className="grid grid-cols-2 gap-4">
        {costEstimate && (
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Estimated</p>
            <p className="text-sm font-mono text-[var(--color-text)]">
              ${costEstimate.estimatedCostUsd.toFixed(2)}
            </p>
          </div>
        )}
        {actualCost && (
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Actual</p>
            <p className="text-sm font-mono text-[var(--color-text)]">
              ${actualCost.usd.toFixed(2)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const router = useRouter();
  const { task, activity, loading, error, refresh } = useTaskDetail(taskId);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-[var(--color-text-muted)]">
          Loading task...
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[var(--color-danger)]">
            {error ?? "Task not found"}
          </p>
          <button
            type="button"
            onClick={() => router.push("/board")}
            className="mt-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
          >
            Back to Board
          </button>
        </div>
      </div>
    );
  }

  const showConfirm = task.status === "confirming";

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => router.push("/board")}
          className="mb-3 text-sm text-[var(--color-primary)] hover:underline"
        >
          &larr; Back to Board
        </button>
        <h2 className="text-xl font-bold text-[var(--color-text)]">
          {task.text}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {task.column}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {task.status}
          </span>
          {task.priority && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {task.priority}
            </span>
          )}
          {task.domain && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {task.domain}
            </span>
          )}
        </div>
      </div>

      {/* Confirmation banner */}
      {showConfirm && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            This task is awaiting your confirmation to proceed.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await kanbanApi.confirmExecution(taskId);
                refresh();
              }}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
            >
              Confirm Execution
            </button>
            <button
              type="button"
              onClick={async () => {
                await kanbanApi.cancelTask(taskId);
                refresh();
              }}
              className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-text)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Cost */}
      <CostDisplay
        costEstimate={task.costEstimate}
        actualCost={task.actualCost}
      />

      {/* Subtasks */}
      <section>
        <h3 className="text-base font-semibold text-[var(--color-text)] mb-3">
          Subtasks
        </h3>
        <SubtaskList subtasks={task.subtasks} />
      </section>

      {/* Activity */}
      <section>
        <h3 className="text-base font-semibold text-[var(--color-text)] mb-3">
          Activity
        </h3>
        <ActivityFeed entries={activity} />
      </section>
    </div>
  );
}
