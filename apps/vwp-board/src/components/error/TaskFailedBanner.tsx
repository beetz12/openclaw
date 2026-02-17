"use client";

interface TaskFailedBannerProps {
  errorMessage: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

export function TaskFailedBanner({
  errorMessage,
  onRetry,
  onCancel,
}: TaskFailedBannerProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 p-3">
      <div className="flex items-start gap-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="#e11d48"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0"
        >
          <circle cx="8" cy="8" r="7" />
          <line x1="10" y1="6" x2="6" y2="10" />
          <line x1="6" y1="6" x2="10" y2="10" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-rose-800">Task failed</p>
          {errorMessage && (
            <p className="mt-1 text-xs text-rose-600 line-clamp-3">
              {errorMessage}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-[var(--radius-sm)] bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 transition-colors"
            >
              Retry Task
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
