/**
 * Team assembler — determines team composition from skill matches.
 *
 * Caps the team at 5 agents (1 lead + 4 specialists) per MVP constraints.
 * Generates cost estimates and builds the team lead prompt with coordination
 * and checkpoint instructions.
 */

import type { BusinessContext } from "./context-loader.js";
import type { SkillMatch, TeamSpec, CostEstimate, TaskDecomposition } from "./types.js";
import { estimateCost } from "./cost-estimator.js";

const MAX_SPECIALISTS = 4;

export type AssemblerConfig = {
  /** Override max specialist count (capped at 4 for MVP). */
  maxSpecialists?: number;
  /** Task complexity from the analyzer. */
  complexity?: TaskDecomposition["estimatedComplexity"];
};

/**
 * Assemble a team specification from skill matches and business context.
 *
 * Deduplicates specialists by plugin (one agent per unique plugin), caps at
 * maxSpecialists, generates cost estimate, and builds the lead prompt.
 */
export function assembleTeam(
  matches: SkillMatch[],
  context: BusinessContext,
  config: AssemblerConfig = {},
): TeamSpec {
  const maxSpec = Math.min(config.maxSpecialists ?? MAX_SPECIALISTS, MAX_SPECIALISTS);
  const complexity = config.complexity ?? "medium";

  // Deduplicate by plugin — one specialist per unique plugin.
  const seen = new Set<string>();
  const specialists: TeamSpec["specialists"] = [];

  for (const match of matches) {
    if (!match.plugin) continue;
    const key = `${match.plugin}/${match.skill}`;
    if (seen.has(key)) continue;
    seen.add(key);

    specialists.push({
      role: match.userLabel,
      skillPlugin: match.plugin,
      skillName: match.skill,
      contextKeys: resolveContextKeys(match, context),
    });

    if (specialists.length >= maxSpec) break;
  }

  // Team size = lead + specialists.
  const teamSize = 1 + specialists.length;
  const cost = estimateCost(teamSize, complexity);

  const leadPrompt = buildLeadPrompt(specialists, context, cost);

  return { leadPrompt, specialists, estimatedCost: cost };
}

// ── Private helpers ──────────────────────────────────────────────────────────

/** Determine which context keys a specialist should receive. */
function resolveContextKeys(match: SkillMatch, context: BusinessContext): string[] {
  const keys: string[] = [];

  // Always include business name if present.
  if (context.profile.businessName) {
    keys.push("businessName");
  }

  // Include industry context.
  if (context.profile.industry) {
    keys.push("industry");
  }

  // Role-specific document access.
  if (context.documentAccess.length > 0) {
    keys.push("documentAccess");
  }

  return keys;
}

/** Build the team lead's coordination prompt. */
function buildLeadPrompt(
  specialists: TeamSpec["specialists"],
  context: BusinessContext,
  cost: CostEstimate,
): string {
  const businessIntro = context.profile.businessName
    ? `Business: ${context.profile.businessName}${context.profile.industry ? ` (${context.profile.industry})` : ""}`
    : "Business context not yet configured.";

  const specialistLines = specialists
    .map((s, i) => `  ${i + 1}. ${s.role} — plugin: ${s.skillPlugin}, skill: ${s.skillName}`)
    .join("\n");

  return `You are the team lead coordinating a task for a business AI assistant.

${businessIntro}

Team composition (${specialists.length} specialist${specialists.length !== 1 ? "s" : ""}):
${specialistLines}

Budget: ~${cost.estimatedTokens.toLocaleString()} tokens (~$${cost.estimatedCostUsd.toFixed(2)})

Coordination instructions:
1. Break the task into clear subtasks and assign each to the appropriate specialist.
2. WAIT for ALL teammates to complete their subtasks before synthesizing results.
3. Each specialist should write intermediate results to the shared task directory.
4. After all specialists finish, synthesize a final unified result.
5. If a specialist reports an error, note it in the final result rather than retrying.

Checkpoint instructions:
- Each teammate must write results to ~/.openclaw/vwp/tasks/{taskId}/ as they complete work.
- Write intermediate results even if the work is partial — partial results are better than no results.
- The final synthesized result goes in final.json.

Do NOT start implementing tasks yourself. Delegate all work to your specialist teammates.`;
}
