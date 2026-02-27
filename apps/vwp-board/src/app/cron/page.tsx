"use client";

import { useCallback, useEffect, useState } from "react";
import { kanbanApi } from "@/lib/api-client";

type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; at?: string; everyMs?: number };
  payload: { kind: string; message?: string; text?: string };
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastError?: string;
    lastDurationMs?: number;
  };
};

type RunEntry = {
  ts: number;
  jobId: string;
  status?: string;
  error?: string;
  summary?: string;
  durationMs?: number;
  sessionKey?: string;
};

type SessionHistoryMessage = {
  role?: string;
  content?: unknown;
  tool_name?: string;
  tool_result?: unknown;
  ts?: number;
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

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {return "just now";}
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {return `${minutes}m ago`;}
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {return `${hours}h ago`;}
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-gray-300"}`}
      title={enabled ? "Enabled" : "Disabled"}
    />
  );
}

function toPreviewText(content: unknown): string {
  if (typeof content === "string") {return content;}
  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        if (typeof item === "string") {return item;}
        if (item && typeof item === "object" && "text" in item && typeof (item as { text?: unknown }).text === "string") {
          return (item as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean);
    return textParts.join(" ");
  }
  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }
  return "";
}

function RunHistory({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingFor, setActionLoadingFor] = useState<string | null>(null);
  const [runActions, setRunActions] = useState<Record<string, SessionHistoryMessage[]>>({});

  useEffect(() => {
    kanbanApi
      .getCronJobRuns(jobId, 20)
      .then((data) => {
        setRuns(data.entries);
      })
      .catch(() => {
        setRuns([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [jobId]);

  const loadRunActions = async (run: RunEntry) => {
    if (!run.sessionKey) {return;}
    const runKey = `${run.ts}-${run.jobId}`;
    if (runActions[runKey]) {
      setRunActions((prev) => {
        const next = { ...prev };
        delete next[runKey];
        return next;
      });
      return;
    }
    setActionLoadingFor(runKey);
    try {
      const history = await kanbanApi.getSessionHistory(run.sessionKey, 40);
      const messages = (history.messages ?? []).filter((m) => m.role === "assistant" || m.role === "tool").slice(-12);
      setRunActions((prev) => ({ ...prev, [runKey]: messages }));
    } catch {
      setRunActions((prev) => ({ ...prev, [runKey]: [] }));
    } finally {
      setActionLoadingFor(null);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Run History
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Close
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-[var(--color-text-muted)]">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">No run history yet.</p>
      ) : (
        <div className="space-y-1.5">
          {runs.map((run) => (
            <div
              key={`${run.ts}-${run.jobId}`}
              className="flex items-start gap-2 text-xs"
            >
              <span
                className={`mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                  run.status === "ok" || run.status === "success"
                    ? "bg-emerald-500"
                    : run.status === "error" || run.status === "failed"
                      ? "bg-red-400"
                      : "bg-gray-300"
                }`}
              />
              <div className="min-w-0 flex-1">
                <span className="text-[var(--color-text-muted)]">
                  {timeAgo(run.ts)}
                </span>
                {run.summary && (
                  <span className="ml-1.5 text-[var(--color-text)]">
                    {run.summary}
                  </span>
                )}
                {run.error && (
                  <span className="ml-1.5 text-red-500">{run.error}</span>
                )}
                {run.durationMs != null && (
                  <span className="ml-1.5 text-[var(--color-text-muted)]">
                    ({run.durationMs}ms)
                  </span>
                )}
                {run.sessionKey && (
                  <button
                    type="button"
                    className="ml-2 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-bg-subtle)]"
                    onClick={() => void loadRunActions(run)}
                  >
                    {actionLoadingFor === `${run.ts}-${run.jobId}`
                      ? "Loading…"
                      : runActions[`${run.ts}-${run.jobId}`]
                        ? "Hide actions"
                        : "View actions"}
                  </button>
                )}
                {run.sessionKey && (
                  <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">{run.sessionKey}</span>
                )}
              </div>
              {runActions[`${run.ts}-${run.jobId}`] && (
                <div className="mt-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-2 text-[11px]">
                  {runActions[`${run.ts}-${run.jobId}`].length === 0 ? (
                    <div className="text-[var(--color-text-muted)]">No assistant/tool actions found.</div>
                  ) : (
                    <ul className="space-y-1">
                      {runActions[`${run.ts}-${run.jobId}`].map((msg, idx) => (
                        <li key={`${run.ts}-${run.jobId}-action-${idx}`} className="leading-snug">
                          <span className="font-medium">{msg.role ?? "message"}:</span>{" "}
                          <span className="text-[var(--color-text-muted)]">{toPreviewText(msg.content).slice(0, 220) || (msg.tool_name ?? "(no text)")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
  onRefresh,
}: {
  job: CronJob;
  onRefresh: () => void;
}) {
  const [actionPending, setActionPending] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleToggle = async () => {
    setActionPending(true);
    try {
      await kanbanApi.updateCronJob(job.id, { enabled: !job.enabled });
      onRefresh();
    } catch {
      // ignore
    } finally {
      setActionPending(false);
    }
  };

  const handleRunNow = async () => {
    setActionPending(true);
    setRunResult(null);
    try {
      const res = await kanbanApi.runCronJob(job.id);
      setRunResult(res.ran ? "Triggered" : (res.reason ?? "Skipped"));
      onRefresh();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "error" in err
          ? (err as { error: string }).error
          : "Failed";
      setRunResult(msg);
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot enabled={job.enabled} />
          <p className="truncate text-sm font-semibold text-[var(--color-text)]">
            {job.name}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={actionPending}
            onClick={() => void handleToggle()}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
          >
            {job.enabled ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            disabled={actionPending}
            onClick={() => void handleRunNow()}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
          >
            Run Now
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--color-bg-subtle)]"
          >
            History
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span title="Schedule">
          <span className="font-medium text-[var(--color-text)]">Schedule:</span>{" "}
          {formatSchedule(job.schedule)}
        </span>
        {job.description && (
          <span className="text-[var(--color-text-muted)]">{job.description}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        {job.state.lastRunAtMs != null && (
          <span>
            Last run: {timeAgo(job.state.lastRunAtMs)}
            {job.state.lastStatus && (
              <span
                className={`ml-1 font-medium ${
                  job.state.lastStatus === "ok" || job.state.lastStatus === "success"
                    ? "text-emerald-600"
                    : job.state.lastStatus === "error" || job.state.lastStatus === "failed"
                      ? "text-red-500"
                      : ""
                }`}
              >
                ({job.state.lastStatus})
              </span>
            )}
            {job.state.lastDurationMs != null && (
              <span className="ml-1">in {job.state.lastDurationMs}ms</span>
            )}
          </span>
        )}
        {job.state.nextRunAtMs != null && (
          <span>
            Next run:{" "}
            {job.state.nextRunAtMs > Date.now()
              ? new Date(job.state.nextRunAtMs).toLocaleString()
              : "soon"}
          </span>
        )}
      </div>

      {job.state.lastError && (
        <p className="mt-1.5 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
          {job.state.lastError}
        </p>
      )}

      {runResult && (
        <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          Run result: <span className="font-medium">{runResult}</span>
        </p>
      )}

      {showHistory && (
        <RunHistory jobId={job.id} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await kanbanApi.getCronJobs();
      setJobs(data.jobs);
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      const msg =
        err && typeof err === "object" && "error" in err
          ? (err as { error: string }).error
          : "Failed to load cron jobs";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        Loading cron jobs…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">
              Cron Jobs
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Manage scheduled automation jobs from the gateway.
            </p>
            {lastUpdatedAt && (
              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                Updated {new Date(lastUpdatedAt).toLocaleTimeString()} • Auto-refresh every 30s
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="flex-shrink-0 rounded border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[var(--color-bg-subtle)]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 text-center">
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              className="mt-2 rounded border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-bg-subtle)]"
            >
              Retry
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-text-muted)]">
            No cron jobs configured. Jobs created via the gateway will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onRefresh={() => void load()} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
