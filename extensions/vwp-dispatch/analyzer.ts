/**
 * Task analyzer — decomposes a user request into structured subtasks via LLM.
 *
 * Uses the project's CLI backend infrastructure to run an LLM call that
 * returns a JSON task decomposition.
 */

import type { TaskDecomposition } from "./types.js";

export type AnalyzerConfig = {
  /** CLI backend provider to use for the analysis LLM call. */
  provider?: string;
  /** Model override (defaults to "sonnet" for speed/cost). */
  model?: string;
  /** Timeout for the LLM call in milliseconds. */
  timeoutMs?: number;
};

const SYSTEM_PROMPT = `You are a task decomposition assistant for a business AI platform.
Given a user request, break it down into concrete subtasks that can each be handled by a specialist.

Each subtask must have:
- description: what the specialist should do (clear, actionable)
- domain: the business domain this falls under (one of: sales, customer-support, product-management, marketing, finance, legal, data, enterprise-search, productivity)

Also determine:
- domains: the unique set of domains involved
- estimatedComplexity: "low" (1-2 subtasks, straightforward), "medium" (3-4 subtasks, some coordination), "high" (5+ subtasks or complex dependencies)

Respond with ONLY valid JSON matching this schema:
{
  "subtasks": [{"description": "...", "domain": "..."}],
  "domains": ["..."],
  "estimatedComplexity": "low" | "medium" | "high"
}`;

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Analyze a user request and decompose it into subtasks.
 *
 * For MVP this shells out to the Claude CLI backend. The prompt instructs
 * the model to return structured JSON which we parse and validate.
 */
export async function analyzeTask(
  text: string,
  config: AnalyzerConfig = {},
): Promise<TaskDecomposition> {
  const { runCommandWithTimeout } = await import("../../src/process/exec.js");

  const provider = config.provider ?? "claude-cli";
  const model = config.model ?? "sonnet";
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const args = [
    "-p",
    text,
    "--output-format",
    "json",
    "--model",
    model,
    "--append-system-prompt",
    SYSTEM_PROMPT,
    "--dangerously-skip-permissions",
  ];

  const result = await runCommandWithTimeout(["claude", ...args], {
    timeoutMs,
  });

  if (result.code !== 0) {
    throw new Error(
      `Task analysis failed (exit ${result.code}): ${result.stderr || result.stdout}`,
    );
  }

  // The CLI outputs JSON; extract the result text from it.
  const cliOutput = parseCliOutput(result.stdout.trim());
  return parseDecomposition(cliOutput);
}

/** Extract the text content from Claude CLI JSON output. */
function parseCliOutput(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { result?: string; text?: string };
    return parsed.result ?? parsed.text ?? raw;
  } catch {
    return raw;
  }
}

/** Parse and validate the LLM's decomposition response. */
function parseDecomposition(text: string): TaskDecomposition {
  // The model may wrap JSON in markdown fences — strip them.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: treat the entire request as a single subtask.
    return {
      subtasks: [{ description: text, domain: "productivity" }],
      domains: ["productivity"],
      estimatedComplexity: "low",
    };
  }

  const obj = parsed as Record<string, unknown>;
  const subtasks = Array.isArray(obj.subtasks)
    ? (obj.subtasks as Array<{ description: string; domain: string }>).map((s) => ({
        description: String(s.description ?? ""),
        domain: String(s.domain ?? "productivity"),
      }))
    : [{ description: text, domain: "productivity" }];

  const domains = Array.isArray(obj.domains)
    ? (obj.domains as string[]).map(String)
    : [...new Set(subtasks.map((s) => s.domain))];

  const complexity = obj.estimatedComplexity;
  const estimatedComplexity =
    complexity === "low" || complexity === "medium" || complexity === "high"
      ? complexity
      : "medium";

  return { subtasks, domains, estimatedComplexity };
}
