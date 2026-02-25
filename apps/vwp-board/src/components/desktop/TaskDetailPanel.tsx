"use client";

import { useEffect, useCallback, useState } from "react";
import { useTaskDetail } from "@/hooks/useTaskDetail";
import { AgentActivityFeed } from "@/components/activity/AgentActivityFeed";
import { ApprovalQueue } from "@/components/approval/ApprovalQueue";
import { TaskFailedBanner } from "@/components/error/TaskFailedBanner";
import { TimeoutWarning } from "@/components/error/TimeoutWarning";
import { kanbanApi } from "@/lib/api-client";
import { splitTaskText } from "@/lib/task-text";

interface TaskDetailPanelProps {
  taskId: string | null;
  onClose: () => void;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onCancel: (taskId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  analyzing: "Analyzing",
  confirming: "Confirming",
  dispatching: "Dispatching",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function PanelContent({
  taskId,
  onClose,
  onApprove,
  onReject,
  onRetry,
  onCancel,
}: {
  taskId: string;
  onClose: () => void;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onCancel: (taskId: string) => void;
}) {
  const { task, activity, loading, error, refresh } = useTaskDetail(taskId);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; role: string; skills: string[] }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [explainLoading, setExplainLoading] = useState(false);
  const [assignmentExplain, setAssignmentExplain] = useState<null | {
    assignedAgentId: string | null;
    assignedRole: string | null;
    assignmentMode: "auto" | "manual-lock";
    assignmentReason: string | null;
    scoreBreakdown: Array<{ agentId: string; score: number; reasons: string[] }>;
  }>(null);

  useEffect(() => {
    setAssignmentExplain(null);
  }, [taskId]);

  useEffect(() => {
    let mounted = true;
    kanbanApi.getTeam().then((res) => {
      if (!mounted) {return;}
      const members = (res.team?.members ?? []).filter((m) => m.active);
      setTeamMembers(members.map((m) => ({ id: m.id, name: m.name, role: m.role, skills: m.skills })));
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {onClose();}
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-sm text-[var(--color-text-muted)]">
          Loading...
        </span>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-[var(--color-danger)]">
          {error || "Task not found"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-[var(--color-primary)] hover:underline"
        >
          Close
        </button>
      </div>
    );
  }

  const completedSubtasks = task.subtasks.filter(
    (s) => s.status === "completed",
  ).length;
  const { title, description } = splitTaskText(task.text);
  const runningSubtask = task.subtasks.find(
    (s) => s.status === "running" && s.startedAt,
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-[var(--color-text)] leading-snug">
            {title}
          </h3>
          {description && (
            <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text-muted)]">
              {description}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              {STATUS_LABELS[task.status] ?? task.status}
            </span>
            {task.domain && (
              <span className="text-xs text-[var(--color-text-muted)]">
                {task.domain}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 shrink-0 rounded-full p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          aria-label="Close panel"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="4" y1="4" x2="14" y2="14" />
            <line x1="14" y1="4" x2="4" y2="14" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          {/* Assignment Controls */}
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Assignment</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
              <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                Agent: {task.assignment?.assignedRole || "Unassigned"}
              </span>
              <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
                Mode: {task.assignment?.assignmentMode || "auto"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="min-w-[220px] rounded border border-[var(--color-border)] px-2 py-1.5 text-xs"
              >
                <option value="">Select workforce agent…</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedAgentId) {return;}
                  const member = teamMembers.find((m) => m.id === selectedAgentId);
                  await kanbanApi.assignTask(task.id, {
                    agentId: selectedAgentId,
                    role: member?.role,
                    requiredSkills: member?.skills ?? [],
                    mode: "manual-lock",
                    reason: "Assigned from task detail panel",
                  });
                  refresh();
                }}
                className="rounded bg-[var(--color-primary)] px-2.5 py-1.5 text-xs font-medium text-white"
              >
                Assign + Lock
              </button>
              <button
                type="button"
                onClick={async () => { await kanbanApi.autoAssignTask(task.id); refresh(); }}
                className="rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium"
              >
                Auto-assign
              </button>
              <button
                type="button"
                onClick={async () => { await kanbanApi.unlockTaskAssignment(task.id); refresh(); }}
                className="rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium"
              >
                Unlock
              </button>
              <button
                type="button"
                onClick={async () => {
                  setExplainLoading(true);
                  try {
                    const data = await kanbanApi.getTaskAssignmentExplain(task.id);
                    setAssignmentExplain(data.explain);
                  } finally {
                    setExplainLoading(false);
                  }
                }}
                className="rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium"
              >
                {explainLoading ? "Loading…" : "Explain"}
              </button>
            </div>
            {assignmentExplain && (
              <div className="mt-3 rounded border border-[var(--color-border)] bg-slate-50 p-2.5 text-xs">
                <p className="font-semibold text-slate-700">
                  Decision: {assignmentExplain.assignedRole || "Unassigned"}
                  {assignmentExplain.assignedAgentId ? ` (${assignmentExplain.assignedAgentId})` : ""}
                </p>
                {assignmentExplain.assignmentReason && (
                  <p className="mt-1 text-slate-600">Reason: {assignmentExplain.assignmentReason}</p>
                )}
                {assignmentExplain.scoreBreakdown?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {assignmentExplain.scoreBreakdown.slice(0, 5).map((row) => (
                      <li key={row.agentId} className="rounded bg-white px-2 py-1">
                        <span className="font-medium">{row.agentId}</span>: {row.score.toFixed(2)}
                        {row.reasons?.length ? ` — ${row.reasons.join(", ")}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Failed banner */}
          {task.status === "failed" && (task.column === "in_progress" || task.column === "review") && (
            <TaskFailedBanner
              errorMessage={task.error}
              onRetry={() => onRetry(task.id)}
              onCancel={() => onCancel(task.id)}
            />
          )}

          {/* Timeout warning */}
          {runningSubtask?.startedAt && task.costEstimate && (
            <TimeoutWarning
              startedAt={runningSubtask.startedAt}
              estimatedDurationMs={
                task.costEstimate.estimatedTokens > 100000 ? 120000 : 60000
              }
              onCancel={() => onCancel(task.id)}
            />
          )}

          {/* Cost breakdown */}
          {(task.actualCost || task.costEstimate) && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                Cost
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-semibold text-[var(--color-text)] font-[var(--font-mono)]">
                  {task.actualCost
                    ? `$${task.actualCost.usd.toFixed(4)}`
                    : `~$${task.costEstimate!.estimatedCostUsd.toFixed(4)}`}
                </span>
                {task.actualCost && (
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {task.actualCost.tokens.toLocaleString()} tokens
                  </span>
                )}
              </div>
              {task.costEstimate && task.actualCost && (
                <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                  <div className="flex justify-between">
                    <span>Analysis</span>
                    <span>{task.costEstimate.breakdown.analysis} tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Per agent</span>
                    <span>{task.costEstimate.breakdown.perAgent} tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Synthesis</span>
                    <span>{task.costEstimate.breakdown.synthesis} tokens</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtask progress */}
          {task.subtasks.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                Subtasks ({completedSubtasks}/{task.subtasks.length})
              </p>

              {/* Progress bar */}
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300"
                  style={{
                    width: `${(completedSubtasks / task.subtasks.length) * 100}%`,
                  }}
                />
              </div>

              <div className="space-y-1.5">
                {task.subtasks.map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 py-2"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        st.status === "completed"
                          ? "bg-emerald-500"
                          : st.status === "running"
                            ? "bg-teal-500 animate-pulse"
                            : st.status === "failed"
                              ? "bg-rose-500"
                              : "bg-slate-300"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                      {st.description}
                    </span>
                    {st.assignedAgent && (
                      <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {st.assignedAgent}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approval queue placeholder */}
          {(task.status === "confirming" || task.column === "review") && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                Approvals
              </p>
              <ApprovalQueue
                items={[]}
                onApprove={(id) => onApprove(id)}
                onReject={(id) => onReject(id)}
              />
            </div>
          )}

          {/* Activity feed */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Activity
            </p>
            <AgentActivityFeed entries={activity} maxHeight="300px" />
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      {(task.status === "confirming" || task.column === "review") && (
        <div className="border-t border-[var(--color-border)] bg-white px-4 py-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onReject(task.id)}
              className="flex-1 rounded-[var(--radius-md)] border border-rose-200 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => onApprove(task.id)}
              className="flex-1 rounded-[var(--radius-md)] bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              Approve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskDetailPanel({
  taskId,
  onClose,
  onApprove,
  onReject,
  onRetry,
  onCancel,
}: TaskDetailPanelProps) {
  const isOpen = taskId !== null;

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {onClose();}
    },
    [onClose],
  );

  return (
    <div
      className={`shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 ease-out ${
        isOpen ? "w-[400px] opacity-100" : "w-0 opacity-0 overflow-hidden"
      }`}
      onClick={handleBackdropClick}
    >
      {taskId && (
        <PanelContent
          taskId={taskId}
          onClose={onClose}
          onApprove={onApprove}
          onReject={onReject}
          onRetry={onRetry}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
