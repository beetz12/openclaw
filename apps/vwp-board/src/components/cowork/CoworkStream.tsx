"use client";

import { useRef, useEffect } from "react";
import { useCoworkStore } from "@/store/cowork-store";
import type { ToolUseEntry } from "@/store/cowork-store";

function ToolUseBlock({ entry }: { entry: ToolUseEntry }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono font-semibold text-[var(--color-primary)]">
          {entry.tool}
        </span>
        <span className="text-[var(--color-text-secondary)]">
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-all text-[var(--color-text-secondary)] max-h-24 overflow-auto">
        {entry.input}
      </pre>
      {entry.output && (
        <div className="mt-1 border-t border-[var(--color-border)] pt-1">
          <span className="text-[var(--color-text-secondary)]">Result:</span>
          <pre className="whitespace-pre-wrap break-all text-[var(--color-text)] max-h-24 overflow-auto">
            {entry.output}
          </pre>
        </div>
      )}
    </div>
  );
}

export function CoworkStream() {
  const activeSession = useCoworkStore((s) => s.activeSession);
  const streamTokens = useCoworkStore((s) => s.streamTokens);
  const toolUses = useCoworkStore((s) => s.toolUses);
  const sessionResult = useCoworkStore((s) => s.sessionResult);
  const sessionCostUsd = useCoworkStore((s) => s.sessionCostUsd);
  const sessionError = useCoworkStore((s) => s.sessionError);
  const approvalRequest = useCoworkStore((s) => s.approvalRequest);
  const clearSession = useCoworkStore((s) => s.clearSession);

  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamTokens, toolUses, sessionResult, sessionError, approvalRequest]);

  const streamedText = streamTokens.join("");
  const isRunning = activeSession?.status === "running";
  const isCompleted = activeSession?.status === "completed";
  const isFailed = activeSession?.status === "failed";

  if (!activeSession && !sessionError && !sessionResult) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--color-text-secondary)] text-center">
          Select a project and describe what you want to do to start a CoWork session.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto p-4 space-y-3">
      {/* Streamed text output */}
      {streamedText && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">
            {streamedText}
          </p>
          {isRunning && (
            <span className="inline-block h-3 w-1 animate-pulse bg-[var(--color-text)]" />
          )}
        </div>
      )}

      {/* Tool use entries */}
      {toolUses.map((entry, i) => (
        <ToolUseBlock key={`${entry.tool}-${entry.timestamp}-${i}`} entry={entry} />
      ))}

      {/* Approval request */}
      {approvalRequest && isRunning && (
        <div className="rounded-[var(--radius-md)] border-2 border-yellow-500/50 bg-yellow-500/10 p-3">
          <p className="text-sm font-semibold text-yellow-400 mb-1">
            Approval Needed
          </p>
          <p className="text-sm text-[var(--color-text)]">
            <span className="font-mono text-[var(--color-primary)]">{approvalRequest.tool}</span>
            {" "}&mdash; {approvalRequest.description}
          </p>
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            Approve or deny in the terminal where the agent is running.
          </p>
        </div>
      )}

      {/* Running indicator */}
      {isRunning && !streamedText && toolUses.length === 0 && (
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-accent)] [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-accent)] [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-accent)] [animation-delay:300ms]" />
          </div>
          <span className="text-xs text-[var(--color-text-secondary)]">
            Starting session...
          </span>
        </div>
      )}

      {/* Completion summary */}
      {isCompleted && sessionResult && (
        <div className="rounded-[var(--radius-md)] border border-green-500/30 bg-green-500/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-green-400">
              Session Complete
            </p>
            {sessionCostUsd !== null && (
              <span className="text-xs text-[var(--color-text-secondary)]">
                Cost: ${sessionCostUsd.toFixed(4)}
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">
            {sessionResult}
          </p>
          <button
            type="button"
            onClick={clearSession}
            className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            New Session
          </button>
        </div>
      )}

      {/* Error display */}
      {(isFailed || sessionError) && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-3">
          <p className="text-sm font-semibold text-[var(--color-danger)] mb-1">
            Error
          </p>
          <p className="text-sm text-[var(--color-text)]">
            {sessionError || "Session failed unexpectedly."}
          </p>
          <button
            type="button"
            onClick={clearSession}
            className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
