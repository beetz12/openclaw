/**
 * Task analyzer — decomposes a user request into structured subtasks via LLM.
 *
 * Uses the project's CLI backend infrastructure to run an LLM call that
 * returns a JSON task decomposition. When NotebookLM memory is available,
 * enriches the prompt with past task context and domain knowledge.
 */

import { readFile } from "node:fs/promises";
import { buildAnalysisInvocation } from "./cli-provider.js";
import type { BusinessContext } from "./context-loader.js";
import { enrichDecomposition, formatEnrichmentPrompt } from "./memory/memory-enrichment.js";
import { createMemoryClient, type MemoryClient } from "./memory/notebooklm-client.js";
import { resolveVwpPath } from "./paths.js";
import { sanitizeTaskText } from "./sanitize.js";
import type { TeamConfig, TeamMember } from "./team-types.js";
import type { TaskDecomposition } from "./types.js";

export type AnalyzerConfig = {
  /** CLI backend provider to use for the analysis LLM call. */
  provider?: string;
  /** Model override (defaults to "sonnet" for speed/cost). */
  model?: string;
  /** Timeout for the LLM call in milliseconds. */
  timeoutMs?: number;
  /** Business context for memory enrichment. */
  businessContext?: BusinessContext;
};

// Lazy-initialized memory client (cached across calls)
let _memoryClient: MemoryClient | null = null;

async function getMemoryClient(): Promise<MemoryClient> {
  if (!_memoryClient) {
    _memoryClient = await createMemoryClient();
  }
  return _memoryClient;
}

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
  const cleanText = sanitizeTaskText(text);
  const { runCommandWithTimeout } = await import("../../src/process/exec.js");

  const provider = config.provider ?? "claude-cli";
  const model = config.model ?? "sonnet";
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Build system prompt, enriched with memory context if available
  let systemPrompt = SYSTEM_PROMPT;

  if (config.businessContext) {
    try {
      const client = await getMemoryClient();
      const enrichment = await enrichDecomposition(cleanText, config.businessContext, client);
      const enrichmentBlock = formatEnrichmentPrompt(enrichment);
      if (enrichmentBlock) {
        systemPrompt = `${SYSTEM_PROMPT}\n\n${enrichmentBlock}`;
      }
    } catch {
      // Memory enrichment is optional; continue without it
    }
  }

  const invocation = buildAnalysisInvocation(provider, {
    prompt: cleanText,
    model,
    systemPrompt,
  });

  const result = await runCommandWithTimeout(invocation, {
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

// -- Team-aware assignment --------------------------------------------------

/** A subtask enhanced with team member assignment info. */
export interface AssignedSubtask {
  description: string;
  domain: string;
  assignedTo?: string;
  suggestedRole?: { name: string; description: string };
}

/** A decomposition with team assignment metadata. */
export interface AssignedDecomposition {
  subtasks: AssignedSubtask[];
  domains: string[];
  estimatedComplexity: "low" | "medium" | "high";
}

/**
 * Domain-to-skill mapping for matching subtask domains to team member skills.
 * Maps decomposition domains to skills that team members might have.
 */
const DOMAIN_SKILL_MAP: Record<string, string[]> = {
  sales: ["strategy", "client-relations", "lead-generation"],
  "customer-support": ["support", "customer-service", "returns"],
  "product-management": ["product", "catalog", "pricing", "ux"],
  marketing: ["marketing", "content", "social-media", "email", "seo", "ads", "lead-generation"],
  finance: ["analytics", "reporting", "analysis"],
  legal: ["documentation", "requirements"],
  data: ["analytics", "reporting", "conversion", "analysis"],
  "enterprise-search": ["documentation", "requirements"],
  productivity: ["project-management", "coordination", "delivery", "automation"],
};

/**
 * Compute the overlap score between a subtask's domain and a team member's skills.
 */
function skillOverlap(domain: string, member: TeamMember): number {
  const domainSkills = DOMAIN_SKILL_MAP[domain] ?? [];
  let score = 0;

  // Direct skill match with domain-mapped skills
  for (const ds of domainSkills) {
    if (member.skills.includes(ds)) score++;
  }

  // Also check if the domain name itself appears in skills
  if (member.skills.includes(domain)) score++;

  return score;
}

/**
 * Assign team members to subtasks based on skill overlap.
 *
 * For each subtask, finds the best matching active team member by comparing
 * the subtask's domain against team member skills. If no match is found,
 * sets a suggestedRole instead.
 */
export async function assignTeamMembers(
  decomposition: TaskDecomposition,
  teamConfigPath?: string,
): Promise<AssignedDecomposition> {
  const configPath = teamConfigPath ?? resolveVwpPath("team.json");

  let members: TeamMember[] = [];
  try {
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as TeamConfig;
    members = config.members.filter((m) => m.active);
  } catch {
    // No team config — return decomposition with suggested roles only
  }

  const subtasks: AssignedSubtask[] = decomposition.subtasks.map((st) => {
    if (members.length === 0) {
      return {
        ...st,
        suggestedRole: { name: st.domain, description: `Specialist in ${st.domain}` },
      };
    }

    // Find best matching member by skill overlap
    let bestMember: TeamMember | null = null;
    let bestScore = 0;

    for (const member of members) {
      const score = skillOverlap(st.domain, member);
      if (score > bestScore) {
        bestScore = score;
        bestMember = member;
      }
    }

    if (bestMember && bestScore > 0) {
      return { ...st, assignedTo: bestMember.id };
    }

    return {
      ...st,
      suggestedRole: { name: st.domain, description: `Specialist in ${st.domain}` },
    };
  });

  return {
    subtasks,
    domains: decomposition.domains,
    estimatedComplexity: decomposition.estimatedComplexity,
  };
}
