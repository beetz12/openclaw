"use client";

interface ApprovalItem {
  id: string;
  actionType: string;
  description: string;
  agentName: string;
  timestamp: number;
}

interface ApprovalQueueProps {
  items: ApprovalItem[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

function formatTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) {return "just now";}
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {return `${minutes}m ago`;}
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function ApprovalQueue({
  items,
  onApprove,
  onReject,
}: ApprovalQueueProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          No pending approvals
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  {item.actionType}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {formatTime(item.timestamp)}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--color-text)]">
                {item.description}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                by {item.agentName}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onApprove(item.id)}
                className="rounded-[var(--radius-sm)] bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => onReject(item.id)}
                className="rounded-[var(--radius-sm)] border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
