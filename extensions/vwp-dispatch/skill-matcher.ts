/**
 * Skill matcher — maps decomposed subtasks to skills in the registry.
 *
 * For MVP, matching uses keyword/domain overlap scoring. Confidence above
 * 0.7 means auto-match; below that the match is flagged for user confirmation.
 */

import type { SkillRegistry, SkillEntry } from "./skill-registry.js";
import type { SkillMatch } from "./types.js";

export type SubtaskInfo = {
  description: string;
  domain: string;
};

/**
 * Match each subtask to the best skill in the registry.
 *
 * Returns one SkillMatch per subtask. If no skill scores above 0, the
 * subtask is matched to the closest domain with needsConfirmation: true.
 */
export function matchSkills(subtasks: SubtaskInfo[], registry: SkillRegistry): SkillMatch[] {
  const allSkills = registry.getAllSkills();
  if (allSkills.length === 0) {
    return subtasks.map((st) => ({
      plugin: "",
      skill: "",
      userLabel: st.domain,
      confidence: 0,
      needsConfirmation: true,
    }));
  }

  return subtasks.map((subtask) => {
    let bestSkill: SkillEntry | null = null;
    let bestScore = -1;

    for (const skill of allSkills) {
      const score = scoreMatch(subtask, skill);
      if (score > bestScore) {
        bestScore = score;
        bestSkill = skill;
      }
    }

    if (!bestSkill) {
      return {
        plugin: "",
        skill: "",
        userLabel: subtask.domain,
        confidence: 0,
        needsConfirmation: true,
      };
    }

    const confidence = clamp(bestScore, 0, 1);
    return {
      plugin: bestSkill.pluginName,
      skill: bestSkill.skillName,
      userLabel: bestSkill.label,
      confidence,
      needsConfirmation: confidence < 0.7,
    };
  });
}

// ── Scoring helpers ──────────────────────────────────────────────────────────

/** Compute a 0-1 confidence score for a subtask/skill pair. */
function scoreMatch(subtask: SubtaskInfo, skill: SkillEntry): number {
  let score = 0;

  // Domain match: plugin name matches domain (strong signal).
  if (normalizeTerm(skill.pluginName) === normalizeTerm(subtask.domain)) {
    score += 0.5;
  }

  // Keyword overlap between subtask description and skill description/label.
  const subtaskTerms = extractTerms(subtask.description);
  const skillTerms = extractTerms(
    `${skill.label} ${skill.description} ${skill.pluginName} ${skill.skillName}`,
  );
  const overlap = setIntersectionSize(subtaskTerms, skillTerms);
  const maxTerms = Math.max(subtaskTerms.size, 1);
  score += 0.5 * Math.min(overlap / maxTerms, 1);

  return score;
}

/** Extract normalized keyword terms from text. */
function extractTerms(text: string): Set<string> {
  const terms = new Set<string>();
  const words = text.toLowerCase().split(/[\s\-_:,./]+/);
  for (const word of words) {
    const cleaned = word.replace(/[^a-z0-9]/g, "");
    if (cleaned.length >= 3) {
      terms.add(cleaned);
    }
  }
  return terms;
}

function normalizeTerm(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, "");
}

function setIntersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count += 1;
  }
  return count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
