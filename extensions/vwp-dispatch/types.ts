/** Shared types for the vwp-dispatch extension. */

export interface TaskRequest {
  id: string;
  text: string;
  priority?: "low" | "medium" | "high" | "urgent";
  userId?: string;
  createdAt: number;
}

export interface TaskAssignmentProfile {
  assignedAgentId: string | null;
  assignedRole: string | null;
  requiredSkills: string[];
  assignmentMode: "auto" | "manual-lock";
  assignmentReason: string | null;
  executorAgentId: string | null;
  executionProfile: Record<string, unknown> | null;
}

export type TaskStatus =
  | "queued"
  | "analyzing"
  | "confirming"
  | "dispatching"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface SubtaskResult {
  id: string;
  skillPlugin: string;
  skillName: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
}

export interface DispatchResult {
  taskId: string;
  status: TaskStatus;
  subtasks: SubtaskResult[];
  synthesizedResult?: string;
  costTokens?: number;
  costUsd?: number;
}

export interface SkillMatch {
  plugin: string;
  skill: string;
  userLabel: string;
  confidence: number;
  needsConfirmation: boolean;
}

export interface CostEstimate {
  estimatedTokens: number;
  estimatedCostUsd: number;
  breakdown: {
    analysis: number;
    perAgent: number;
    synthesis: number;
  };
}

export interface TeamSpec {
  leadPrompt: string;
  specialists: Array<{
    role: string;
    skillPlugin: string;
    skillName: string;
    contextKeys: string[];
  }>;
  estimatedCost: CostEstimate;
}

export interface TaskDecomposition {
  subtasks: Array<{
    description: string;
    domain: string;
  }>;
  domains: string[];
  estimatedComplexity: "low" | "medium" | "high";
}
