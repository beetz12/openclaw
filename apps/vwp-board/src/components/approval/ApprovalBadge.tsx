"use client";

interface ApprovalBadgeProps {
  count: number;
  onClick?: () => void;
}

export function ApprovalBadge({ count, onClick }: ApprovalBadgeProps) {
  if (count === 0) {return null;}

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="relative inline-flex items-center justify-center"
      aria-label={`${count} pending approval${count > 1 ? "s" : ""}`}
    >
      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-sm">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-40" />
        <span className="relative">{count > 9 ? "9+" : count}</span>
      </span>
    </button>
  );
}
