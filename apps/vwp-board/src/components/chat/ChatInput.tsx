"use client";

import {
  useState,
  useRef,
  useCallback,
  type KeyboardEvent,
  type FormEvent,
} from "react";

interface ChatInputProps {
  onSend: (text: string, asTask?: boolean) => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

const MAX_LINES = 4;
const LINE_HEIGHT = 24; // px approx for text-sm

export function ChatInput({
  onSend,
  disabled = false,
  isStreaming = false,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [asTask, setAsTask] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {return;}
    el.style.height = "auto";
    const maxHeight = LINE_HEIGHT * MAX_LINES + 16; // padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = text.trim();
      if (!trimmed || disabled || isStreaming) {return;}
      onSend(trimmed, asTask);
      setText("");
      // Reset textarea height
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      });
    },
    [text, disabled, isStreaming, onSend, asTask],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const canSend = text.trim().length > 0 && !disabled && !isStreaming;

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
    >
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              requestAnimationFrame(autoResize);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? "OpenClaw Gateway is not running"
                : "Type a message..."
            }
            disabled={disabled}
            rows={1}
            className="w-full resize-none rounded-xl border border-[var(--color-border-input)] bg-[var(--color-bg)] px-4 py-2.5 pr-10 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 disabled:opacity-50"
            style={{ lineHeight: `${LINE_HEIGHT}px` }}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Run as task toggle */}
          <button
            type="button"
            onClick={() => setAsTask((prev) => !prev)}
            disabled={disabled}
            className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
              asTask
                ? "bg-[var(--color-primary)] text-white"
                : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
            } disabled:opacity-50`}
            title={asTask ? "Will run as task" : "Run as task"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="inline-block"
            >
              <path
                d="M3 8h10M10 5l3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Send button */}
          <button
            type="submit"
            disabled={!canSend}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send message"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
            >
              <path
                d="M2.25 9h13.5M10.5 3.75L15.75 9l-5.25 5.25"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {asTask && (
        <p className="mt-1.5 text-xs text-[var(--color-primary)]">
          This message will be dispatched as a task to your team.
        </p>
      )}
    </form>
  );
}
