"use client";

import { useState, useRef, useCallback, type FormEvent } from "react";

interface GoalInputFormProps {
  onSubmit: (text: string) => void;
  loading?: boolean;
  domainSuggestions?: string[];
}

const EXAMPLE_PROMPTS = [
  "Run a Valentine\u2019s Day sale \u2014 20% off, email + social",
  "Draft a quarterly business report for clients",
  "Set up automated customer support responses",
];

const MIN_LENGTH = 10;
const MAX_LENGTH = 2000;

export function GoalInputForm({
  onSubmit,
  loading = false,
  domainSuggestions,
}: GoalInputFormProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isValid = text.trim().length >= MIN_LENGTH;
  const charsRemaining = MAX_LENGTH - text.length;

  const autoExpand = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {return;}
    el.style.height = "auto";
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      if (value.length <= MAX_LENGTH) {
        setText(value);
      }
      // Schedule auto-expand after state update
      requestAnimationFrame(() => autoExpand());
    },
    [autoExpand],
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (isValid && !loading) {
        onSubmit(text.trim());
      }
    },
    [isValid, loading, onSubmit, text],
  );

  const selectPrompt = useCallback(
    (prompt: string) => {
      setText(prompt);
      requestAnimationFrame(() => {
        autoExpand();
        textareaRef.current?.focus();
      });
    },
    [autoExpand],
  );

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-8">
      <form onSubmit={handleSubmit}>
        <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
          <div className="p-5">
            <label
              htmlFor="goal-input"
              className="mb-2 block text-sm font-semibold text-[var(--color-text)]"
            >
              Describe your goal
            </label>
            <textarea
              ref={textareaRef}
              id="goal-input"
              value={text}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="What would you like to accomplish?"
              disabled={loading}
              className="w-full resize-none rounded-lg border border-[var(--color-border-input)] bg-[var(--color-bg)] px-4 py-3 text-base text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 disabled:opacity-50"
              style={{ minHeight: "120px" }}
            />
            <div className="mt-1 flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>
                {text.trim().length < MIN_LENGTH &&
                  text.length > 0 &&
                  `At least ${MIN_LENGTH} characters required`}
              </span>
              <span
                className={charsRemaining < 100 ? "text-[var(--color-warning)]" : ""}
              >
                {text.length > 0 && `${charsRemaining} remaining`}
              </span>
            </div>
          </div>

          {/* Example prompts */}
          <div className="border-t border-[var(--color-border)] px-5 py-3">
            <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
              Try an example:
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => selectPrompt(prompt)}
                  disabled={loading}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-left text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Domain suggestions */}
          {domainSuggestions && domainSuggestions.length > 0 && (
            <div className="border-t border-[var(--color-border)] px-5 py-3">
              <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
                Available domains:
              </p>
              <div className="flex gap-2 overflow-x-auto">
                {domainSuggestions.map((domain) => (
                  <span
                    key={domain}
                    className="shrink-0 rounded-full bg-[var(--color-primary-bg)] px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
                  >
                    {domain}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="border-t border-[var(--color-border)] px-5 py-4">
            <button
              type="submit"
              disabled={!isValid || loading}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-6 font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {loading && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
              {loading ? "Analyzing..." : "Analyze & Plan"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
