"use client";

interface TaskDispatchCardProps {
  messageId: string;
  taskId: string;
  title: string;
  onConfirm: (messageId: string, taskId: string) => void;
  onCancel: (messageId: string, taskId: string) => void;
}

export function TaskDispatchCard({
  messageId,
  taskId,
  title,
  onConfirm,
  onCancel,
}: TaskDispatchCardProps) {
  return (
    <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        This will be dispatched to your team.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(messageId, taskId)}
          className="rounded-[var(--radius-sm)] bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => onCancel(messageId, taskId)}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
