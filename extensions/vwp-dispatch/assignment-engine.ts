import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TaskAssignmentProfile } from "./types.js";

export interface WorkforceAgent {
  id: string;
  name: string;
  role: string;
  skills: string[];
  active: boolean;
}

export interface AssignmentInput {
  roleHint?: string;
  requiredSkills?: string[];
  currentLoads?: Record<string, number>;
  manualLock?: boolean;
  existing?: TaskAssignmentProfile;
}

export interface AssignmentDecision {
  assignedAgentId: string | null;
  assignedRole: string | null;
  requiredSkills: string[];
  assignmentMode: "auto" | "manual-lock";
  assignmentReason: string;
  scoreBreakdown: Array<{ agentId: string; score: number; reasons: string[] }>;
}

export function scoreAgent(
  agent: WorkforceAgent,
  input: AssignmentInput,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (!agent.active) {
    return { score: -999, reasons: ["inactive"] };
  }

  const roleHint = (input.roleHint || "").toLowerCase();
  if (roleHint && agent.role.toLowerCase().includes(roleHint)) {
    score += 5;
    reasons.push("role match +5");
  }

  const required = input.requiredSkills ?? [];
  let skillHits = 0;
  for (const skill of required) {
    if (agent.skills.map((s) => s.toLowerCase()).includes(skill.toLowerCase())) {
      skillHits += 1;
    }
  }
  if (skillHits > 0) {
    const pts = skillHits * 3;
    score += pts;
    reasons.push(`skills match +${pts}`);
  }

  const load = input.currentLoads?.[agent.id] ?? 0;
  score += Math.max(0, 2 - load);
  reasons.push(`load bonus +${Math.max(0, 2 - load)}`);

  return { score, reasons };
}

export function pickBestAgent(
  agents: WorkforceAgent[],
  input: AssignmentInput,
): AssignmentDecision {
  if (input.manualLock && input.existing?.assignedAgentId) {
    return {
      assignedAgentId: input.existing.assignedAgentId,
      assignedRole: input.existing.assignedRole,
      requiredSkills: input.existing.requiredSkills,
      assignmentMode: "manual-lock",
      assignmentReason: "Manual lock preserved",
      scoreBreakdown: [],
    };
  }

  const scored = agents
    .map((a) => {
      const s = scoreAgent(a, input);
      return { agent: a, score: s.score, reasons: s.reasons };
    })
    .sort((a, b) => b.score - a.score || a.agent.id.localeCompare(b.agent.id));

  const top = scored[0];
  if (!top || top.score < 0) {
    return {
      assignedAgentId: null,
      assignedRole: null,
      requiredSkills: input.requiredSkills ?? [],
      assignmentMode: "auto",
      assignmentReason: "No active matching agent",
      scoreBreakdown: scored.map((s) => ({
        agentId: s.agent.id,
        score: s.score,
        reasons: s.reasons,
      })),
    };
  }

  return {
    assignedAgentId: top.agent.id,
    assignedRole: top.agent.role,
    requiredSkills: input.requiredSkills ?? [],
    assignmentMode: "auto",
    assignmentReason: `Best score: ${top.agent.name}`,
    scoreBreakdown: scored.map((s) => ({
      agentId: s.agent.id,
      score: s.score,
      reasons: s.reasons,
    })),
  };
}

export async function loadWorkforceAgents(
  teamConfigPath = join(homedir(), ".openclaw", "vwp", "team.json"),
): Promise<WorkforceAgent[]> {
  try {
    const raw = await readFile(teamConfigPath, "utf-8");
    const cfg = JSON.parse(raw) as { members?: Array<Record<string, unknown>> };
    const members = cfg.members ?? [];
    return members.map((m) => ({
      id: String(m.id ?? ""),
      name: String(m.name ?? ""),
      role: String(m.role ?? "general"),
      skills: Array.isArray(m.skills) ? m.skills.map(String) : [],
      active: Boolean(m.active ?? true),
    }));
  } catch {
    return [];
  }
}
