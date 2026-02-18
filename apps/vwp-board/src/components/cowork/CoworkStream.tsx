"use client";

import { useRef, useEffect, useState } from "react";
import { useCoworkStore } from "@/store/cowork-store";
import type { ToolUseEntry } from "@/store/cowork-store";

const DIFF_LINE_LIMIT = 50;

interface DiffData {
  filePath: string;
  removals: string[];
  additions: string[];
}

function parseDiff(tool: string, input: string): DiffData | null {
  try {
    const parsed = JSON.parse(input);
    if (tool === "Write" && parsed.file_path && typeof parsed.content === "string") {
      return {
        filePath: parsed.file_path,
        removals: [],
        additions: parsed.content.split("\n"),
      };
    }
    if (tool === "Edit" && parsed.file_path && typeof parsed.old_string === "string" && typeof parsed.new_string === "string") {
      return {
        filePath: parsed.file_path,
        removals: parsed.old_string.split("\n"),
        additions: parsed.new_string.split("\n"),
      };
    }
  } catch {
    // JSON parse failed — fall back to raw display
  }
  return null;
}

function DiffPreview({ diff }: { diff: DiffData }) {
  const [expanded, setExpanded] = useState(false);
  const allLines = [
    ...diff.removals.map((l) => ({ prefix: "-", text: l })),
    ...diff.additions.map((l) => ({ prefix: "+", text: l })),
  ];
  const needsTruncation = allLines.length > DIFF_LINE_LIMIT;
  const visibleLines = expanded ? allLines : allLines.slice(0, DIFF_LINE_LIMIT);

  return (
    <details className="mt-1" data-testid="diff-preview">
      <summary className="cursor-pointer text-[var(--color-text-secondary)] hover:text-[var(--color-text)] select-none">
        {diff.filePath}
      </summary>
      <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] leading-relaxed overflow-auto max-h-64">
        {visibleLines.map((line, i) => (
          <span
            key={i}
            className={
              line.prefix === "-"
                ? "text-red-400 block"
                : "text-green-400 block"
            }
          >
            {line.prefix} {line.text}
          </span>
        ))}
      </pre>
      {needsTruncation && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-[11px] text-[var(--color-primary)] hover:underline"
        >
          Show more... ({allLines.length - DIFF_LINE_LIMIT} lines hidden)
        </button>
      )}
    </details>
  );
}

function ToolUseBlock({ entry }: { entry: ToolUseEntry }) {
  const diff = (entry.tool === "Write" || entry.tool === "Edit")
    ? parseDiff(entry.tool, entry.input)
    : null;

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
      {diff ? (
        <DiffPreview diff={diff} />
      ) : (
        <pre className="whitespace-pre-wrap break-all text-[var(--color-text-secondary)] max-h-24 overflow-auto">
          {entry.input}
        </pre>
      )}
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

const ERROR_SOURCE_LABELS: Record<string, string> = {
  mcp_crash: "MCP Server Crash \u2014 check server configuration",
  agent_timeout: "Agent Timeout \u2014 the task may be too complex",
  sdk_error: "Agent SDK Error",
  cli_fallback: "CLI Backend Error",
};

export function CoworkStream() {
  const activeSession = useCoworkStore((s) => s.activeSession);
  const streamTokens = useCoworkStore((s) => s.streamTokens);
  const toolUses = useCoworkStore((s) => s.toolUses);
  const sessionResult = useCoworkStore((s) => s.sessionResult);
  const sessionCostUsd = useCoworkStore((s) => s.sessionCostUsd);
  const sessionError = useCoworkStore((s) => s.sessionError);
  const errorSource = useCoworkStore((s) => s.errorSource);
  const approvalRequest = useCoworkStore((s) => s.approvalRequest);
  const clearSession = useCoworkStore((s) => s.clearSession);
  const undoAvailable = useCoworkStore((s) => s.undoAvailable);
  const lastSessionId = useCoworkStore((s) => s.lastSessionId);
  const undoResult = useCoworkStore((s) => s.undoResult);
  const undoSession = useCoworkStore((s) => s.undoSession);
  const [undoLoading, setUndoLoading] = useState(false);

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
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={clearSession}
              data-testid="cowork-new-session-btn"
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors"
            >
              New Session
            </button>
            {undoAvailable && lastSessionId && !undoResult && (
              <button
                type="button"
                disabled={undoLoading}
                data-testid="cowork-undo-btn"
                onClick={async () => {
                  setUndoLoading(true);
                  try {
                    await undoSession(lastSessionId);
                  } finally {
                    setUndoLoading(false);
                  }
                }}
                className="rounded-[var(--radius-sm)] border border-yellow-500/50 bg-yellow-500/10 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
              >
                {undoLoading ? "Undoing..." : "Undo all changes"}
              </button>
            )}
          </div>
          {undoAvailable && lastSessionId && !undoResult && (
            <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
              Restore git state from before this session
            </p>
          )}
          {undoResult && (
            <div className="mt-2 rounded-[var(--radius-sm)] border border-green-500/30 bg-green-500/10 px-3 py-2" data-testid="cowork-undo-result">
              <p className="text-xs font-medium text-green-400">
                Changes undone successfully
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {(isFailed || sessionError) && (
        <div className="rounded-[var(--radius-md)] border-2 border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-4" data-testid="cowork-error">
          <div className="flex items-center gap-2 mb-2">
            <svg className="h-5 w-5 text-[var(--color-danger)] shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-semibold text-[var(--color-danger)]">
              {errorSource && ERROR_SOURCE_LABELS[errorSource]
                ? ERROR_SOURCE_LABELS[errorSource]
                : "Error"}
            </p>
          </div>
          <p className="text-sm text-[var(--color-text)]">
            {sessionError || "Session failed unexpectedly."}
          </p>
          <button
            type="button"
            onClick={clearSession}
            data-testid="cowork-try-again-btn"
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
