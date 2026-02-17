"use client";

interface TeamSuggestCardProps {
  role: string;
  description: string;
  onAccept: (role: string) => void;
  onSkip: () => void;
}

export function TeamSuggestCard({
  role,
  description,
  onAccept,
  onSkip,
}: TeamSuggestCardProps) {
  return (
    <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <p className="text-sm text-[var(--color-text)]">
        No team member matches this task. Add a{" "}
        <span className="font-semibold">{role}</span>?
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        {description}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onAccept(role)}
          className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
        >
          Add Member
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg)]"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
