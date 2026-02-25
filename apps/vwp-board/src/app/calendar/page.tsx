"use client";

import { useEffect, useMemo, useState } from "react";
import { kanbanApi } from "@/lib/api-client";
import type { KanbanTask } from "@/types/kanban";

type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; at?: string; everyMs?: number };
  payload: { kind: string; message?: string; text?: string };
  state: { nextRunAtMs?: number; lastRunAtMs?: number; lastStatus?: string };
};

type CalendarItem = {
  id: string;
  title: string;
  when: string;
  source: "automation" | "task";
  detail?: string;
};

function formatSchedule(schedule: CronJob["schedule"]): string {
  if (schedule.kind === "cron" && schedule.expr) {
    return schedule.expr;
  }
  if (schedule.kind === "at" && schedule.at) {
    return `Once at ${schedule.at}`;
  }
  if (schedule.kind === "every" && schedule.everyMs) {
    const ms = schedule.everyMs;
    const hours = ms / (1000 * 60 * 60);
    const mins = ms / (1000 * 60);
    if (hours >= 1 && Number.isInteger(hours)) {
      return `Every ${hours}h`;
    }
    return `Every ${Math.round(mins)}m`;
  }
  return schedule.kind;
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [viewFilter, setViewFilter] = useState<"all" | "automation" | "task">("all");

  const load = async () => {
    try {
      const board = await kanbanApi.getBoard();
      setTasks([
        ...board.columns.todo,
        ...board.columns.in_progress,
        ...board.columns.review,
      ]);
      setLastUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
    try {
      const cronData = await kanbanApi.getCronJobs();
      setCronJobs(cronData.jobs);
    } catch {
      setCronJobs([]);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60000);
    return () => clearInterval(id);
  }, []);

  const taskItems = useMemo<CalendarItem[]>(() => {
    return [...tasks]
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        title: t.text || t.id,
        when: new Date(t.updatedAt || t.createdAt || Date.now()).toLocaleString(),
        source: "task",
        detail: `${t.column} • ${t.priority}`,
      }));
  }, [tasks]);

  const cronItems = useMemo<CalendarItem[]>(() => {
    return cronJobs.map((job) => ({
      id: job.id,
      title: job.name,
      when: formatSchedule(job.schedule),
      source: "automation",
      detail: job.description || (job.enabled ? "Active" : "Disabled"),
    }));
  }, [cronJobs]);

  const timeline = useMemo(() => {
    return [...cronItems, ...taskItems];
  }, [cronItems, taskItems]);

  const automations = useMemo(() => timeline.filter((i) => i.source === "automation"), [timeline]);
  const activeTasks = useMemo(() => timeline.filter((i) => i.source === "task"), [timeline]);

  if (loading) {
    return <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading calendar…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">Calendar (Events + Automations)</h2>
            <p className="text-xs text-[var(--color-text-muted)]">Unified view of cron automations and active work items.</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Showing {automations.length} automation{automations.length !== 1 ? "s" : ""} + {taskItems.length} most recently updated tasks.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Auto-refresh: every 60s</span>
            {lastUpdatedAt && (
              <span className="text-[11px] text-[var(--color-text-muted)]">
                Updated {new Date(lastUpdatedAt).toLocaleTimeString()} ({Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000))}s ago)
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              className="rounded border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[var(--color-bg-subtle)]"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewFilter("all")}
            className={`rounded px-2.5 py-1 text-xs font-medium ${viewFilter === "all" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)] bg-white"}`}
            title={`All items (${automations.length + activeTasks.length})`}
          >
            All ({automations.length + activeTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setViewFilter("automation")}
            className={`rounded px-2.5 py-1 text-xs font-medium ${viewFilter === "automation" ? "bg-indigo-600 text-white" : "border border-[var(--color-border)] bg-white"}`}
            title={`Automations (${automations.length})`}
          >
            Automations ({automations.length})
          </button>
          <button
            type="button"
            onClick={() => setViewFilter("task")}
            className={`rounded px-2.5 py-1 text-xs font-medium ${viewFilter === "task" ? "bg-emerald-600 text-white" : "border border-[var(--color-border)] bg-white"}`}
            title={`Active tasks (${activeTasks.length})`}
          >
            Active Tasks ({activeTasks.length})
          </button>
        </div>

        {(viewFilter === "all" || viewFilter === "automation") && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Automations ({automations.length})</h3>
          {automations.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 text-xs text-[var(--color-text-muted)]">
              No cron jobs found. Connect the gateway to see live automation schedules.
            </div>
          ) : (
            <div className="space-y-3">
              {automations.map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--color-border)] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--color-text)]" title={item.detail ?? "automation"}>{item.title}</p>
                    <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-indigo-100 text-indigo-700" title="Recurring automation template">
                      {item.source}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{item.when}</p>
                  {item.detail && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{item.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {(viewFilter === "all" || viewFilter === "task") && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Active Tasks ({activeTasks.length})</h3>
          {activeTasks.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 text-xs text-[var(--color-text-muted)]">
              No active task items right now. This section auto-populates from To Do / In Progress / Review board columns.
            </div>
          ) : (
            <div className="space-y-3">
              {activeTasks.map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--color-border)] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <a
                      href={`/board/${item.id}`}
                      className="text-sm font-medium text-[var(--color-text)] hover:underline"
                      title={`Open task ${item.id}`}
                    >
                      {item.title}
                    </a>
                    <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-700">
                      {item.source}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{item.when}</p>
                  {item.detail && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{item.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
