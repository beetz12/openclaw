"use client";

import { useState, useCallback } from "react";
import type { TaskDecomposition } from "@/types/kanban";

interface TaskDecompositionPanelProps {
  decomposition: TaskDecomposition;
  onApprove: (editedSubtasks: Array<{ description: string; domain: string }>) => void;
  onReject: () => void;
  loading?: boolean;
}

const COMPLEXITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-[var(--color-success-bg)]", text: "text-[var(--color-success)]", label: "Low" },
  medium: { bg: "bg-[var(--color-warning-bg)]", text: "text-[var(--color-warning)]", label: "Medium" },
  high: { bg: "bg-[var(--color-danger-bg)]", text: "text-[var(--color-danger)]", label: "High" },
};

export function TaskDecompositionPanel({
  decomposition,
  onApprove,
  onReject,
  loading = false,
}: TaskDecompositionPanelProps) {
  const [subtasks, setSubtasks] = useState(
    decomposition.subtasks.map((st, i) => ({ ...st, id: `st-${i}` })),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const complexity = COMPLEXITY_STYLES[decomposition.estimatedComplexity] ?? COMPLEXITY_STYLES.medium;
  const uniqueDomains = [...new Set(subtasks.map((s) => s.domain))];

  const startEdit = useCallback((id: string, description: string) => {
    setEditingId(id);
    setEditText(description);
  }, []);

  const commitEdit = useCallback(() => {
    if (editingId && editText.trim()) {
      setSubtasks((prev) =>
        prev.map((st) =>
          st.id === editingId ? { ...st, description: editText.trim() } : st,
        ),
      );
    }
    setEditingId(null);
    setEditText("");
  }, [editingId, editText]);

  const removeSubtask = useCallback((id: string) => {
    setSubtasks((prev) => prev.filter((st) => st.id !== id));
  }, []);

  const moveSubtask = useCallback((index: number, direction: -1 | 1) => {
    setSubtasks((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) {return prev;}
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const addSubtask = useCallback(() => {
    const id = `st-${Date.now()}`;
    setSubtasks((prev) => [
      ...prev,
      { id, description: "New subtask", domain: uniqueDomains[0] ?? "general" },
    ]);
    setEditingId(id);
    setEditText("New subtask");
  }, [uniqueDomains]);

  const handleApprove = useCallback(() => {
    onApprove(subtasks.map(({ description, domain }) => ({ description, domain })));
  }, [onApprove, subtasks]);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <h3 className="text-lg font-bold text-[var(--color-text)]">
          AI Task Breakdown
        </h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${complexity.bg} ${complexity.text}`}
        >
          {complexity.label} complexity
        </span>
      </div>

      {/* Subtask list */}
      <div className="divide-y divide-[var(--color-border)]">
        {subtasks.map((subtask, index) => (
          <div
            key={subtask.id}
            className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[var(--color-bg)]"
          >
            {/* Reorder controls */}
            <div className="flex shrink-0 flex-col gap-0.5 pt-1">
              <button
                type="button"
                onClick={() => moveSubtask(index, -1)}
                disabled={index === 0 || loading}
                className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)] disabled:invisible"
                aria-label="Move up"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 3L3 7h8L7 3z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => moveSubtask(index, 1)}
                disabled={index === subtasks.length - 1 || loading}
                className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)] disabled:invisible"
                aria-label="Move down"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 11L3 7h8l-4 4z" />
                </svg>
              </button>
            </div>

            {/* Index badge */}
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-bg)] text-xs font-semibold text-[var(--color-primary)]">
              {index + 1}
            </span>

            {/* Content */}
            <div className="min-w-0 flex-1">
              {editingId === subtask.id ? (
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {commitEdit();}
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditText("");
                    }
                  }}
                  autoFocus
                  className="w-full rounded-md border border-[var(--color-primary)] bg-white px-2 py-1 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(subtask.id, subtask.description)}
                  disabled={loading}
                  className="w-full text-left text-sm text-[var(--color-text)] hover:text-[var(--color-primary)] disabled:opacity-50"
                >
                  {subtask.description}
                </button>
              )}
              <span className="mt-1 inline-block rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                {subtask.domain}
              </span>
            </div>

            {/* Delete */}
            <button
              type="button"
              onClick={() => removeSubtask(subtask.id)}
              disabled={loading || subtasks.length <= 1}
              className="shrink-0 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] disabled:invisible"
              aria-label="Remove subtask"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add subtask */}
      <div className="border-t border-[var(--color-border)] px-5 py-3">
        <button
          type="button"
          onClick={addSubtask}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-bg)] disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          Add Subtask
        </button>
      </div>

      {/* Domains summary */}
      {uniqueDomains.length > 0 && (
        <div className="border-t border-[var(--color-border)] px-5 py-3">
          <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
            Domains involved:
          </p>
          <div className="flex flex-wrap gap-2">
            {uniqueDomains.map((domain) => (
              <span
                key={domain}
                className="rounded-full bg-[var(--color-primary-bg)] px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
              >
                {domain}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-5 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onReject}
          disabled={loading}
          className="min-h-11 rounded-lg border border-[var(--color-border)] bg-white px-6 font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={loading || subtasks.length === 0}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-6 font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
        >
          {loading && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {loading ? "Executing..." : "Approve & Execute"}
        </button>
      </div>
    </div>
  );
}
