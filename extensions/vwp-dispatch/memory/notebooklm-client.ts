/**
 * NotebookLM MCP client — thin wrapper around NotebookLM MCP tools for
 * the VWP memory system. Stores and retrieves task outcomes, business
 * profiles, domain knowledge, and learned patterns.
 *
 * Handles MCP unavailability gracefully by returning empty/fallback results.
 */

import type { BusinessProfile } from "../context-loader.js";

// ── Public types ────────────────────────────────────────────────────────────

export interface TaskOutcome {
  taskId: string;
  goal: string;
  subtasks: Array<{
    description: string;
    domain: string;
    status: string;
    result?: string;
  }>;
  totalCost: { tokens: number; usd: number };
  duration: number;
  success: boolean;
  learnings?: string;
}

export interface PastTaskSummary {
  goal: string;
  subtaskCount: number;
  domains: string[];
  cost: number;
  success: boolean;
  learnings?: string;
}

export interface LearnedPattern {
  category: string; // e.g. "user_preference", "skill_performance", "domain_knowledge"
  description: string;
  confidence: number;
}

export interface MemoryClient {
  storeTaskOutcome(outcome: TaskOutcome): Promise<void>;
  querySimilarTasks(goal: string, limit?: number): Promise<PastTaskSummary[]>;
  queryDomainKnowledge(domain: string, query: string): Promise<string>;
  storeProfile(profile: BusinessProfile): Promise<void>;
  storePattern(pattern: LearnedPattern): Promise<void>;
  isAvailable(): Promise<boolean>;
}

// ── MCP tool call helper ────────────────────────────────────────────────────

type McpToolFn = (name: string, params: Record<string, unknown>) => Promise<unknown>;

/**
 * Attempt to dynamically resolve the MCP tool caller.
 * Returns undefined when the MCP runtime is not present.
 */
async function resolveMcpCall(): Promise<McpToolFn | undefined> {
  try {
    // The openclaw host exposes MCP tool calls via a global or importable helper.
    // If unavailable we simply return undefined.
    const mod = (await import("openclaw")) as Record<string, unknown>;
    const fn = (mod as { callMcpTool?: McpToolFn }).callMcpTool;
    return typeof fn === "function" ? fn : undefined;
  } catch {
    return undefined;
  }
}

// ── Implementation ──────────────────────────────────────────────────────────

/** Cached notebook ID per business (keyed by businessName or "_default"). */
const notebookCache = new Map<string, string>();

/** Clear the notebook cache. Exposed for testing only. */
export function _clearNotebookCache(): void {
  notebookCache.clear();
}

function businessKey(profile?: BusinessProfile): string {
  return profile?.businessName ?? "_default";
}

function formatTaskOutcome(outcome: TaskOutcome): string {
  const subtaskLines = outcome.subtasks
    .map(
      (s) => `  - [${s.status}] ${s.description} (${s.domain})${s.result ? `: ${s.result}` : ""}`,
    )
    .join("\n");

  return [
    `---`,
    `type: task_outcome`,
    `taskId: ${outcome.taskId}`,
    `success: ${outcome.success}`,
    `cost_tokens: ${outcome.totalCost.tokens}`,
    `cost_usd: ${outcome.totalCost.usd}`,
    `duration_ms: ${outcome.duration}`,
    `timestamp: ${Date.now()}`,
    `---`,
    ``,
    `# Task: ${outcome.goal}`,
    ``,
    `## Subtasks`,
    subtaskLines,
    ``,
    outcome.learnings ? `## Learnings\n${outcome.learnings}\n` : "",
  ].join("\n");
}

function formatPattern(pattern: LearnedPattern): string {
  return [
    `---`,
    `type: learned_pattern`,
    `category: ${pattern.category}`,
    `confidence: ${pattern.confidence}`,
    `timestamp: ${Date.now()}`,
    `---`,
    ``,
    pattern.description,
  ].join("\n");
}

function parsePastTasks(text: string, limit: number): PastTaskSummary[] {
  // The query response is free-form text from NotebookLM.
  // We parse whatever structure we can extract; if parsing fails we return empty.
  const results: PastTaskSummary[] = [];
  try {
    // Try JSON array first (if the notebook returns structured data)
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      for (const item of parsed.slice(0, limit)) {
        results.push({
          goal: String(item.goal ?? item.task ?? ""),
          subtaskCount: Number(item.subtaskCount ?? item.subtask_count ?? 0),
          domains: Array.isArray(item.domains) ? item.domains : [],
          cost: Number(item.cost ?? item.cost_usd ?? 0),
          success: Boolean(item.success),
          learnings: item.learnings ?? undefined,
        });
      }
      return results;
    }
  } catch {
    // Not JSON — parse as text
  }

  // Fallback: extract task blocks from free-form text
  const taskBlocks = text.split(/(?=# Task:)/);
  for (const block of taskBlocks.slice(0, limit)) {
    const goalMatch = block.match(/# Task:\s*(.+)/);
    if (!goalMatch) continue;

    const successMatch = block.match(/success:\s*(true|false)/i);
    const costMatch = block.match(/cost_usd:\s*([\d.]+)/);
    const learningsMatch = block.match(/## Learnings\s*\n([\s\S]*?)(?=\n##|\n---|\Z)/);
    const domainMatches = [...block.matchAll(/\((\w[\w-]*)\)/g)].map((m) => m[1]);
    const subtaskMatches = block.match(/- \[/g);

    results.push({
      goal: goalMatch[1].trim(),
      subtaskCount: subtaskMatches?.length ?? 0,
      domains: [...new Set(domainMatches)],
      cost: costMatch ? parseFloat(costMatch[1]) : 0,
      success: successMatch ? successMatch[1] === "true" : false,
      learnings: learningsMatch?.[1]?.trim(),
    });
  }

  return results.slice(0, limit);
}

export async function createMemoryClient(profile?: BusinessProfile): Promise<MemoryClient> {
  const callMcp = await resolveMcpCall();

  async function ensureNotebook(): Promise<string | null> {
    if (!callMcp) return null;

    const key = businessKey(profile);
    const cached = notebookCache.get(key);
    if (cached) return cached;

    try {
      // Try to find existing notebook
      const list = (await callMcp("notebooklm-mcp__notebook_list", {})) as
        | Array<{ id: string; title: string }>
        | undefined;
      const notebookTitle = `VWP Memory — ${profile?.businessName ?? "Default"}`;

      if (Array.isArray(list)) {
        const existing = list.find((n) => n.title === notebookTitle);
        if (existing) {
          notebookCache.set(key, existing.id);
          return existing.id;
        }
      }

      // Create new notebook
      const created = (await callMcp("notebooklm-mcp__notebook_create", {
        title: notebookTitle,
      })) as { id: string } | undefined;

      if (created?.id) {
        notebookCache.set(key, created.id);
        return created.id;
      }
    } catch (err) {
      console.warn("[memory] Failed to ensure notebook:", err);
    }

    return null;
  }

  const client: MemoryClient = {
    async storeTaskOutcome(outcome) {
      const notebookId = await ensureNotebook();
      if (!notebookId) return;

      try {
        await callMcp!("notebooklm-mcp__source_add", {
          notebook_id: notebookId,
          type: "text",
          content: formatTaskOutcome(outcome),
        });
      } catch (err) {
        console.warn("[memory] Failed to store task outcome:", err);
      }
    },

    async querySimilarTasks(goal, limit = 3) {
      const notebookId = await ensureNotebook();
      if (!notebookId) return [];

      try {
        const result = (await callMcp!("notebooklm-mcp__notebook_query", {
          notebook_id: notebookId,
          query: `Find past tasks similar to: "${goal}". Return their goals, subtask counts, domains, costs, success status, and learnings.`,
        })) as { text?: string; answer?: string } | string | undefined;

        const text = typeof result === "string" ? result : (result?.text ?? result?.answer ?? "");
        if (!text) return [];

        return parsePastTasks(text, limit);
      } catch (err) {
        console.warn("[memory] Failed to query similar tasks:", err);
        return [];
      }
    },

    async queryDomainKnowledge(domain, query) {
      const notebookId = await ensureNotebook();
      if (!notebookId) return "";

      try {
        const result = (await callMcp!("notebooklm-mcp__notebook_query", {
          notebook_id: notebookId,
          query: `Domain: ${domain}. Question: ${query}`,
        })) as { text?: string; answer?: string } | string | undefined;

        if (typeof result === "string") return result;
        return result?.text ?? result?.answer ?? "";
      } catch (err) {
        console.warn("[memory] Failed to query domain knowledge:", err);
        return "";
      }
    },

    async storeProfile(prof) {
      const notebookId = await ensureNotebook();
      if (!notebookId) return;

      try {
        const content = [
          `---`,
          `type: business_profile`,
          `timestamp: ${Date.now()}`,
          `---`,
          ``,
          `# Business Profile`,
          ``,
          `Name: ${prof.businessName ?? "Unknown"}`,
          `Industry: ${prof.industry ?? "Unknown"}`,
          `Team Size: ${prof.teamSize ?? "Unknown"}`,
          prof.roles
            ? `\nRoles:\n${Object.entries(prof.roles)
                .map(([r, cfg]) => `  - ${r}: domains=[${cfg.allowedDomains?.join(", ") ?? "all"}]`)
                .join("\n")}`
            : "",
        ].join("\n");

        await callMcp!("notebooklm-mcp__source_add", {
          notebook_id: notebookId,
          type: "text",
          content,
        });
      } catch (err) {
        console.warn("[memory] Failed to store profile:", err);
      }
    },

    async storePattern(pattern) {
      const notebookId = await ensureNotebook();
      if (!notebookId) return;

      try {
        await callMcp!("notebooklm-mcp__source_add", {
          notebook_id: notebookId,
          type: "text",
          content: formatPattern(pattern),
        });
      } catch (err) {
        console.warn("[memory] Failed to store pattern:", err);
      }
    },

    async isAvailable() {
      try {
        const id = await ensureNotebook();
        return id !== null;
      } catch {
        return false;
      }
    },
  };

  return client;
}
