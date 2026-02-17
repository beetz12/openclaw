"use client";

interface IntentClarifyCardProps {
  messageId: string;
  question: string;
  onClarify: (messageId: string, choice: "chat" | "task") => void;
}

export function IntentClarifyCard({
  messageId,
  question,
  onClarify,
}: IntentClarifyCardProps) {
  return (
    <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <p className="text-sm text-[var(--color-text)]">{question}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onClarify(messageId, "chat")}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)]"
        >
          Just chatting
        </button>
        <button
          type="button"
          onClick={() => onClarify(messageId, "task")}
          className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
        >
          Run as task
        </button>
      </div>
    </div>
  );
}
