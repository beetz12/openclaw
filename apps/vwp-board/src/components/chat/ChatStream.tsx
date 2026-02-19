"use client";

import { useChatStore } from "@/store/chat-store";

interface ChatStreamProps {
  content: string;
}

export function ChatStream({ content }: ChatStreamProps) {
  const isThinking = useChatStore((s) => s.isThinking);
  const elapsedMs = useChatStore((s) => s.thinkingElapsedMs);
  const cancelChat = useChatStore((s) => s.cancelChat);

  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  return (
    <div className="flex justify-start px-4 py-1">
      <div className="max-w-[85%] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:max-w-[70%]">
        {content ? (
          <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">
            {content}
          </p>
        ) : isThinking ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-accent)] [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-accent)] [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-accent)] [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-[var(--color-text-secondary)]">
              Thinking{elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : "..."}
            </span>
            <button
              onClick={cancelChat}
              className="ml-2 rounded px-2 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              type="button"
            >
              Cancel
            </button>
          </div>
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
