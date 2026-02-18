"use client";

import { useState } from "react";
import { useCoworkStore } from "@/store/cowork-store";
import { ProjectSelector } from "./ProjectSelector";

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

const PERMISSION_MODES = [
  { value: "acceptEdits", label: "Accept Edits (recommended)" },
  { value: "bypassPermissions", label: "Bypass Permissions (power user)" },
];

export function CoworkPanel() {
  const selectedProjectId = useCoworkStore((s) => s.selectedProjectId);
  const activeSession = useCoworkStore((s) => s.activeSession);
  const startSession = useCoworkStore((s) => s.startSession);
  const cancelSession = useCoworkStore((s) => s.cancelSession);

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [permissionMode, setPermissionMode] = useState<"acceptEdits" | "bypassPermissions">("acceptEdits");
  const [maxBudgetUsd, setMaxBudgetUsd] = useState("5.00");
  const [showOptions, setShowOptions] = useState(false);

  const isRunning = activeSession?.status === "running";

  const handleStart = async () => {
    if (!selectedProjectId || !prompt.trim()) {return;}
    const budget = parseFloat(maxBudgetUsd);
    await startSession(selectedProjectId, prompt.trim(), {
      model,
      permissionMode,
      maxBudgetUsd: isNaN(budget) ? 5.0 : budget,
    });
    setPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleStart();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ProjectSelector />

      <div className="border-t border-[var(--color-border)] pt-4">
        <label
          htmlFor="cowork-prompt"
          className="mb-1.5 block text-sm font-semibold text-[var(--color-text)]"
        >
          What would you like to do?
        </label>
        <textarea
          id="cowork-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Refactor the auth module to use JWT tokens..."
          rows={3}
          disabled={isRunning}
          data-testid="cowork-prompt-input"
          className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 disabled:opacity-50"
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
        >
          {showOptions ? "Hide options" : "Show options"}
        </button>

        {showOptions && (
          <div className="mt-2 space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div>
              <label
                htmlFor="cowork-model"
                className="mb-1 block text-xs font-medium text-[var(--color-text)]"
              >
                Model
              </label>
              <select
                id="cowork-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                data-testid="cowork-model-select"
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="cowork-permission"
                className="mb-1 block text-xs font-medium text-[var(--color-text)]"
              >
                Permission Mode
              </label>
              <select
                id="cowork-permission"
                value={permissionMode}
                onChange={(e) => setPermissionMode(e.target.value as typeof permissionMode)}
                data-testid="cowork-permission-select"
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              >
                {PERMISSION_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="cowork-budget"
                className="mb-1 block text-xs font-medium text-[var(--color-text)]"
              >
                Budget Limit (USD)
              </label>
              <input
                id="cowork-budget"
                type="number"
                step="0.50"
                min="0.50"
                max="100"
                value={maxBudgetUsd}
                onChange={(e) => setMaxBudgetUsd(e.target.value)}
                data-testid="cowork-budget-input"
                className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {isRunning ? (
          <button
            type="button"
            onClick={cancelSession}
            data-testid="cowork-cancel-btn"
            className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
          >
            Cancel Session
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={!selectedProjectId || !prompt.trim()}
            data-testid="cowork-start-btn"
            className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start CoWork
          </button>
        )}
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          Session active
        </div>
      )}
    </div>
  );
}
