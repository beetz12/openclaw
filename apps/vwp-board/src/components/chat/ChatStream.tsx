"use client";

interface ChatStreamProps {
  content: string;
}

export function ChatStream({ content }: ChatStreamProps) {
  return (
    <div className="flex justify-start px-4 py-1">
      <div className="max-w-[85%] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:max-w-[70%]">
        {content ? (
          <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">
            {content}
          </p>
        ) : (
          <div className="flex items-center gap-1 py-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-secondary)] [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-secondary)] [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-secondary)] [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}
