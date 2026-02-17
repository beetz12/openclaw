/**
 * Memory enrichment — queries long-term memory (NotebookLM) to enrich
 * task decomposition with context from past tasks and domain knowledge.
 */

import type { BusinessContext } from "../context-loader.js";
import type { MemoryClient, PastTaskSummary } from "./notebooklm-client.js";

export interface EnrichmentContext {
  pastTasks: PastTaskSummary[];
  domainKnowledge: string;
  hasEnrichment: boolean;
}

/**
 * Query memory for enrichment context to improve goal decomposition.
 * Returns past similar tasks and domain knowledge that can be injected
 * into the analyzer prompt.
 *
 * Gracefully returns empty enrichment if MCP is unavailable.
 */
export async function enrichDecomposition(
  goal: string,
  context: BusinessContext,
  client: MemoryClient,
): Promise<EnrichmentContext> {
  try {
    const available = await client.isAvailable();
    if (!available) {
      return { pastTasks: [], domainKnowledge: "", hasEnrichment: false };
    }

    const [pastTasks, domainKnowledge] = await Promise.all([
      client.querySimilarTasks(goal, 3),
      client.queryDomainKnowledge(context.profile.industry ?? "general", goal),
    ]);

    return {
      pastTasks,
      domainKnowledge,
      hasEnrichment: pastTasks.length > 0 || !!domainKnowledge,
    };
  } catch (err) {
    console.warn("[memory-enrichment] Failed to enrich decomposition:", err);
    return { pastTasks: [], domainKnowledge: "", hasEnrichment: false };
  }
}

/**
 * Format enrichment context as a text block suitable for appending to
 * an LLM system prompt.
 */
export function formatEnrichmentPrompt(enrichment: EnrichmentContext): string {
  if (!enrichment.hasEnrichment) return "";

  const parts: string[] = [];

  if (enrichment.pastTasks.length > 0) {
    parts.push("Past similar tasks:");
    for (const task of enrichment.pastTasks) {
      const domains = task.domains.join(", ");
      const status = task.success ? "success" : "failed";
      parts.push(
        `- "${task.goal}": ${task.subtaskCount} subtasks, [${domains}], $${task.cost.toFixed(2)}, ${status}`,
      );
      if (task.learnings) {
        parts.push(`  Learnings: ${task.learnings}`);
      }
    }
  }

  if (enrichment.domainKnowledge) {
    if (parts.length > 0) parts.push("");
    parts.push("Domain knowledge:");
    parts.push(enrichment.domainKnowledge);
  }

  return parts.join("\n");
}
