"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import { useGeminiVoiceCall } from "@/hooks/useGeminiVoiceCall";

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
  const {
    status: voiceStatus,
    error: voiceError,
    interimTranscript,
    supported: voiceSupported,
    active: voiceActive,
    toggleCall,
    stopCall,
  } = useGeminiVoiceCall();

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {return;}
    el.style.height = "auto";
    const maxHeight = LINE_HEIGHT * MAX_LINES + 16; // padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    if (disabled && voiceActive) {
      void stopCall();
    }
  }, [disabled, stopCall, voiceActive]);

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
  const callStatusLabel =
    voiceStatus === "connecting"
      ? "Connecting"
      : voiceStatus === "live"
        ? "Live"
        : voiceStatus === "error"
          ? "Error"
          : "Idle";
  const callBadgeClass =
    voiceStatus === "live"
      ? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
      : voiceStatus === "connecting"
        ? "border-blue-500 bg-blue-500/10 text-blue-700"
        : voiceStatus === "error"
          ? "border-rose-500 bg-rose-500/10 text-rose-700"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]";

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
          <button
            type="button"
            onClick={() => {
              void toggleCall();
            }}
            disabled={disabled && !voiceActive}
            className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
              voiceActive
                ? "border-[var(--color-primary)] bg-[var(--color-primary-bg)] text-[var(--color-primary)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
            } disabled:opacity-50`}
            aria-label={voiceActive ? "Stop voice call" : "Start voice call"}
            title={voiceActive ? "Stop voice call" : "Start voice call"}
          >
            {voiceStatus === "connecting"
              ? "📞 Connecting…"
              : voiceActive
                ? "📞 End call"
                : voiceStatus === "error"
                  ? "📞 Retry call"
                  : "📞 Start call"}
          </button>

          {voiceActive && (
            <button
              type="button"
              onClick={() => {
                void stopCall();
              }}
              className="rounded-lg border border-rose-500/70 bg-rose-500/10 px-2.5 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-500/20"
              aria-label="Stop call"
              title="Stop call"
            >
              Stop
            </button>
          )}

          <button
            type="button"
            onClick={() => setAsTask((prev) => !prev)}
            disabled={disabled}
            className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
              asTask
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]"
            } disabled:opacity-50`}
            aria-label={asTask ? "Task mode enabled" : "Run as task"}
            title={asTask ? "Task mode enabled" : "Run as task"}
          >
            {asTask ? "Task mode: ON" : "Run as task"}
          </button>

          <button
            type="submit"
            disabled={!canSend}
            className="rounded-xl bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send chat message"
            title="Send chat message"
          >
            Send
          </button>
        </div>
      </div>

      {asTask && (
        <p className="mt-1.5 text-xs text-[var(--color-primary)]">
          This message will be dispatched as a task to your team.
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${callBadgeClass}`}
        >
          {voiceStatus === "connecting" || voiceStatus === "live" ? (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          ) : null}
          Call: {callStatusLabel}
        </span>
        {interimTranscript && voiceStatus === "live" && (
          <span className="text-xs text-[var(--color-text-secondary)]">
            Heard: {interimTranscript}
          </span>
        )}
      </div>
      {!voiceSupported && (
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          Voice call mode isn’t supported in this browser. Try Chrome or Safari.
        </p>
      )}
      {voiceError && (
        <p className="mt-1 text-xs text-amber-600">{voiceError}</p>
      )}
    </form>
  );
}
