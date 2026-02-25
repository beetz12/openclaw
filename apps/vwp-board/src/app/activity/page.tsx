"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentActivityFeed } from "@/components/activity/AgentActivityFeed";
import { kanbanApi, type ActivityEntry } from "@/lib/api-client";

type ActivityType = ActivityEntry["type"] | "all";
type TimeWindow = "1h" | "24h" | "7d" | "all";
type DigestBucket = "morning" | "midday" | "evening";

type AssignmentAuditAction =
  | "assignment_manual"
  | "assignment_auto"
  | "assignment_unlocked"
  | "execution_routed";

const ASSIGNMENT_AUDIT_ACTIONS: AssignmentAuditAction[] = [
  "assignment_manual",
  "assignment_auto",
  "assignment_unlocked",
  "execution_routed",
];

function withinWindow(ts: number, window: TimeWindow): boolean {
  if (window === "all") {return true;}
  const now = Date.now();
  const delta = now - ts;
  if (window === "1h") {return delta <= 60 * 60 * 1000;}
  if (window === "24h") {return delta <= 24 * 60 * 60 * 1000;}
  return delta <= 7 * 24 * 60 * 60 * 1000;
}

function isBlocked(e: ActivityEntry): boolean {
  const s = `${e.action} ${e.detail}`.toLowerCase();
  return s.includes("blocked") || s.includes("error") || s.includes("failed");
}

function isCompleted(e: ActivityEntry): boolean {
  const s = `${e.action} ${e.detail}`.toLowerCase();
  return (
    s.includes("completed") ||
    s.includes("ready_for_review") ||
    s.includes("done") ||
    s.includes("passed")
  );
}

function bucketForHour(hour: number): DigestBucket {
  if (hour < 12) {return "morning";}
  if (hour < 17) {return "midday";}
  return "evening";
}

function digestSummary(entries: ActivityEntry[]): string {
  if (entries.length === 0) {return "No activity yet";}
  const blocked = entries.filter(isBlocked).length;
  const completed = entries.filter(isCompleted).length;
  if (blocked > 0) {return `${completed} completed, ${blocked} blocked`;}
  return `${completed} completed, ${entries.length - completed} in progress/updates`;
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [taskMetaById, setTaskMetaById] = useState<Record<string, { text: string; priority: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<ActivityType>("all");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("24h");
  const [actionFilter, setActionFilter] = useState<AssignmentAuditAction | null>(null);
  const [toolOnly, setToolOnly] = useState(false);
  const [errorOnly, setErrorOnly] = useState(false);

  async function load() {
    try {
      setError(null);
      const [timeline, board] = await Promise.all([
        kanbanApi.getAutonomyTimeline(500),
        kanbanApi.getBoard(),
      ]);
      setEntries(timeline);

      const taskMap: Record<string, { text: string; priority: string }> = {};
      for (const col of Object.values(board.columns)) {
        for (const task of col) {
          taskMap[task.id] = {
            text: task.text,
            priority: task.priority,
          };
        }
      }
      setTaskMetaById(taskMap);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load activity";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, []);

  const scoped = useMemo(
    () => entries.filter((e) => withinWindow(e.timestamp, timeWindow)),
    [entries, timeWindow],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return scoped
      .filter((e) => {
        if (typeFilter !== "all" && e.type !== typeFilter) {return false;}
        if (actionFilter && e.action !== actionFilter) {return false;}
        if (toolOnly && e.type !== "agent_action") {return false;}
        const hay = [e.taskId, e.agentName ?? "", e.action, e.detail].join(" ").toLowerCase();
        if (errorOnly && !/error|failed|timeout|denied|exception/.test(hay)) {return false;}
        if (!q) {return true;}
        return hay.includes(q);
      })
      .toSorted((a, b) => b.timestamp - a.timestamp);
  }, [scoped, filter, typeFilter, actionFilter, toolOnly, errorOnly]);

  const digest = useMemo(() => {
    const total = scoped.length;
    const blocked = scoped.filter(isBlocked).length;
    const completed = scoped.filter(isCompleted).length;
    const uniqueTasks = new Set(scoped.map((e) => e.taskId)).size;
    return { total, blocked, completed, uniqueTasks };
  }, [scoped]);

  const dayDigests = useMemo(() => {
    const groups: Record<DigestBucket, ActivityEntry[]> = {
      morning: [],
      midday: [],
      evening: [],
    };
    for (const e of scoped) {
      const hour = new Date(e.timestamp).getHours();
      groups[bucketForHour(hour)].push(e);
    }
    return {
      morning: digestSummary(groups.morning),
      midday: digestSummary(groups.midday),
      evening: digestSummary(groups.evening),
    };
  }, [scoped]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">Autonomous Activity Feed</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Heartbeat + delegated work timeline with filters and digest cards
          </p>
          <div className="mt-1 inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Sorted newest first
          </div>
          <div className="mt-1 inline-flex rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
            Auto-refresh every 15s
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdatedAt && (
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Updated {new Date(lastUpdatedAt).toLocaleTimeString()} ({Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000))}s ago)
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-subtle)]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <DigestCard label="Actions" value={digest.total} />
        <DigestCard label="Completed Signals" value={digest.completed} />
        <DigestCard label="Blocked Signals" value={digest.blocked} />
        <DigestCard label="Active Tasks" value={digest.uniqueTasks} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
        <DigestTextCard label="Morning Digest" text={dayDigests.morning} />
        <DigestTextCard label="Midday Digest" text={dayDigests.midday} />
        <DigestTextCard label="Evening Digest" text={dayDigests.evening} />
      </div>

      <div className="p-4 border-b border-[var(--color-border)] space-y-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Assignment Audit Legend
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {ASSIGNMENT_AUDIT_ACTIONS.map((action) => {
              const selected = actionFilter === action;
              const colorClass =
                action === "assignment_manual"
                  ? "bg-amber-100 text-amber-700"
                  : action === "assignment_auto"
                    ? "bg-emerald-100 text-emerald-700"
                    : action === "assignment_unlocked"
                      ? "bg-slate-100 text-slate-700"
                      : "bg-indigo-100 text-indigo-700";
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => setActionFilter((prev) => (prev === action ? null : action))}
                  className={`rounded px-2 py-1 font-semibold transition ${colorClass} ${selected ? "ring-2 ring-[var(--color-primary)]" : "opacity-90 hover:opacity-100"}`}
                  title={selected ? "Click to clear filter" : "Click to filter activity"}
                >
                  {action}
                </button>
              );
            })}
            {actionFilter && (
              <button
                type="button"
                onClick={() => setActionFilter(null)}
                className="rounded border border-[var(--color-border)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by task id, action, agent, or detail..."
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        />

        <div className="flex flex-wrap gap-2">
          {(["all", "status_change", "agent_action", "subtask_update", "approval_gate"] as ActivityType[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTypeFilter(k)}
              className={`rounded-full px-3 py-1 text-xs border ${
                typeFilter === k
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setToolOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs border ${
              toolOnly
                ? "bg-[var(--color-success)] text-white border-[var(--color-success)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
            }`}
          >
            Tool actions
          </button>
          <button
            type="button"
            onClick={() => setErrorOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs border ${
              errorOnly
                ? "bg-[var(--color-danger)] text-white border-[var(--color-danger)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
            }`}
          >
            Errors only
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["1h", "24h", "7d", "all"] as TimeWindow[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setTimeWindow(w)}
              className={`rounded-full px-3 py-1 text-xs border ${
                timeWindow === w
                  ? "bg-[var(--color-info)] text-white border-[var(--color-info)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 flex-1 overflow-hidden">
        {loading ? (
          <div className="text-sm text-[var(--color-text-muted)]">Loading timeline...</div>
        ) : error ? (
          <div className="text-sm text-[var(--color-danger)]">{error}</div>
        ) : (
          <AgentActivityFeed
            entries={filtered}
            taskMetaById={taskMetaById}
            maxHeight="calc(100vh - 360px)"
          />
        )}
      </div>
    </div>
  );
}

function DigestCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      <div className="text-xl font-bold text-[var(--color-text)]">{value}</div>
    </div>
  );
}

function DigestTextCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      <div className="text-sm font-medium text-[var(--color-text)] mt-1">{text}</div>
    </div>
  );
}
