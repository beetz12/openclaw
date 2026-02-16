/**
 * Team launcher — spawns per-specialist Claude CLI subprocesses with focused
 * prompts. Replaces the monolithic single-subprocess approach with structured
 * team management and real-time progress tracking.
 *
 * Each specialist runs in its own subprocess, writing results to the shared
 * task directory. A TeamMonitor watches for file changes and emits SSE events.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ApprovalSSE } from "../vwp-approval/sse.js";
import type { AgentStateManager } from "./agent-state.js";
import type { SkillRegistry } from "./skill-registry.js";
import type { TeamSpec } from "./types.js";
import { generateSkillSummary } from "./context-loader.js";
import { buildSafeEnv } from "./safe-env.js";
import { TeamMonitor } from "./team-monitor.js";

const TASKS_BASE = join(homedir(), ".openclaw", "vwp", "tasks");

export type LaunchOptions = {
  /** Working directory for the Claude CLI subprocess. */
  workspaceDir?: string;
  /** Timeout for the entire team run in milliseconds (default: 10 min). */
  timeoutMs?: number;
  /** Per-specialist timeout in milliseconds (default: 5 min). */
  specialistTimeoutMs?: number;
  /** Provider for the CLI backend. */
  provider?: string;
  /** Model override for the team lead. */
  model?: string;
  /** SSE instance for real-time event emission. */
  sse?: ApprovalSSE;
  /** Agent state manager for tracking agent status. */
  agentState?: AgentStateManager;
};

export interface TeamHandle {
  taskId: string;
  specialists: SpecialistHandle[];
  monitor: TeamMonitor;
}

export interface SpecialistHandle {
  role: string;
  pid?: number;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes total
const DEFAULT_SPECIALIST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per specialist

/**
 * Launch an agent team by spawning per-specialist CLI subprocesses.
 *
 * 1. Writes focused prompts for each specialist to {taskDir}/prompts/
 * 2. Starts a TeamMonitor to watch for checkpoint file changes
 * 3. Runs the lead prompt first to coordinate
 * 4. Runs specialist prompts in parallel
 * 5. Returns a TeamHandle for tracking
 */
export async function launchTeam(
  spec: TeamSpec,
  taskId: string,
  registry: SkillRegistry,
  options: LaunchOptions = {},
): Promise<TeamHandle> {
  const { runCommandWithTimeout } = await import("../../src/process/exec.js");

  const taskDir = join(TASKS_BASE, taskId);
  const promptsDir = join(taskDir, "prompts");
  const resultsDir = join(taskDir, "results");
  const checkpointsDir = join(taskDir, "checkpoints");

  await Promise.all([
    mkdir(promptsDir, { recursive: true }),
    mkdir(resultsDir, { recursive: true }),
    mkdir(checkpointsDir, { recursive: true }),
  ]);

  const totalTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const specialistTimeoutMs = options.specialistTimeoutMs ?? DEFAULT_SPECIALIST_TIMEOUT_MS;

  // Build specialist handles.
  const specialists: SpecialistHandle[] = spec.specialists.map((s) => ({
    role: s.role,
    status: "pending" as const,
  }));

  // Start the file monitor for real-time progress.
  const monitor = new TeamMonitor(taskId, options.sse);
  await monitor.start();

  const handle: TeamHandle = { taskId, specialists, monitor };

  try {
    // Build and write per-specialist prompts.
    const specialistPrompts = await buildSpecialistPrompts(spec, taskId, taskDir, registry);

    for (const [role, prompt] of Object.entries(specialistPrompts)) {
      await writeFile(join(promptsDir, `${sanitizeFilename(role)}.txt`), prompt);
    }

    // Build and write the lead prompt.
    const leadPrompt = buildLeadCoordinationPrompt(spec, taskId, taskDir);
    await writeFile(join(promptsDir, "lead.txt"), leadPrompt);

    // Emit subtask_started for each specialist.
    for (const s of spec.specialists) {
      options.sse?.emit({
        type: "subtask_started",
        taskId,
        subtaskId: sanitizeFilename(s.role),
        agentName: s.role,
      });
    }

    // Track agents in state manager
    for (const s of spec.specialists) {
      if (options.agentState) {
        const agent = options.agentState.upsertAgent({
          id: `${taskId}-${sanitizeFilename(s.role)}`,
          name: s.role,
          status: "active",
          taskId,
        });
        options.sse?.emit({ type: "agent_connected", agent });
      }
    }

    // Run lead first (coordination phase).
    const leadArgs = buildCliArgs(leadPrompt, options.model);
    const leadResult = await runCommandWithTimeout(["claude", ...leadArgs], {
      timeoutMs: Math.min(specialistTimeoutMs, totalTimeoutMs),
      cwd: options.workspaceDir,
      env: {
        ...buildSafeEnv(process.env as Record<string, string>),
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
        CLAUDECODE: "",
      },
    });
    await writeFile(
      join(checkpointsDir, "lead-coordination.json"),
      JSON.stringify(
        {
          action: "coordination",
          detail: "Lead coordination phase completed",
          stdout: leadResult.stdout,
          code: leadResult.code,
        },
        null,
        2,
      ),
    );

    // Run specialists in parallel.
    const specialistResults = await Promise.allSettled(
      spec.specialists.map(async (s, i) => {
        const role = sanitizeFilename(s.role);
        const prompt = specialistPrompts[s.role];
        if (!prompt) throw new Error(`No prompt for specialist: ${s.role}`);

        const specialistHandle = specialists[i];
        if (specialistHandle) {
          specialistHandle.status = "running";
          specialistHandle.startedAt = Date.now();
        }

        const args = buildCliArgs(prompt, options.model);
        const result = await runCommandWithTimeout(["claude", ...args], {
          timeoutMs: specialistTimeoutMs,
          cwd: options.workspaceDir,
          env: {
            ...buildSafeEnv(process.env as Record<string, string>),
            CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
            CLAUDECODE: "",
          },
        });

        if (specialistHandle) {
          specialistHandle.pid = undefined; // PID not exposed by runCommandWithTimeout
          specialistHandle.status = result.code === 0 ? "completed" : "failed";
          specialistHandle.completedAt = Date.now();
        }

        // Update agent state
        if (options.agentState) {
          const agent = options.agentState.upsertAgent({
            id: `${taskId}-${sanitizeFilename(s.role)}`,
            status: result.code === 0 ? "idle" : "error",
            lastAction: result.code === 0 ? "completed" : "failed",
            error: result.code !== 0 ? result.stderr || "Process exited with non-zero code" : null,
          });
          options.sse?.emit({ type: "agent_status_changed", agent });
        }

        // Write result to results dir.
        const subtaskResult = {
          id: role,
          skillPlugin: s.skillPlugin,
          skillName: s.skillName,
          agentName: s.role,
          status: result.code === 0 ? "completed" : "failed",
          result: result.stdout,
          error:
            result.code !== 0 ? result.stderr || "Process exited with non-zero code" : undefined,
          code: result.code,
        };
        await writeFile(join(resultsDir, `${role}.json`), JSON.stringify(subtaskResult, null, 2));

        return subtaskResult;
      }),
    );

    // Collect results and write final.json.
    const subtasks = specialistResults.map((r, i) => {
      const s = spec.specialists[i]!;
      const role = sanitizeFilename(s.role);
      if (r.status === "fulfilled") {
        return r.value;
      }
      return {
        id: role,
        skillPlugin: s.skillPlugin,
        skillName: s.skillName,
        agentName: s.role,
        status: "failed" as const,
        error: String(r.reason),
      };
    });

    const finalResult = {
      taskId,
      status: subtasks.every((s) => s.status === "completed") ? "completed" : "failed",
      subtasks,
      synthesizedResult: subtasks
        .filter((s) => s.status === "completed")
        .map((s) => s.result)
        .join("\n\n"),
    };
    await writeFile(join(taskDir, "final.json"), JSON.stringify(finalResult, null, 2));
  } catch (err) {
    // On error, stop monitor and rethrow.
    await monitor.stop();
    throw err;
  }

  return handle;
}

// ── Prompt building ──────────────────────────────────────────────────────────

async function buildSpecialistPrompts(
  spec: TeamSpec,
  taskId: string,
  taskDir: string,
  registry: SkillRegistry,
): Promise<Record<string, string>> {
  const prompts: Record<string, string> = {};

  await Promise.all(
    spec.specialists.map(async (s) => {
      const skill = registry.getSkill(s.skillPlugin, s.skillName);
      const summary = await generateSkillSummary(skill?.skillPath ?? "");
      const summaryBlock = summary ? `\n\nSkill instructions:\n${summary}` : "";

      prompts[s.role] = `You are a specialist agent working on a business task.

Task ID: ${taskId}
Your role: ${s.role}
Plugin: ${s.skillPlugin} / ${s.skillName}
${summaryBlock}

Your task directory: ${taskDir}
Write your results to: ${taskDir}/results/${sanitizeFilename(s.role)}.json

Instructions:
1. Focus ONLY on your assigned role: ${s.role}
2. Write intermediate progress to ${taskDir}/checkpoints/${sanitizeFilename(s.role)}-progress.json
3. Write your final result as a JSON file with: { "status": "completed", "result": "...", "agentName": "${s.role}" }
4. If you encounter an error, write: { "status": "failed", "error": "...", "agentName": "${s.role}" }
5. Do NOT attempt tasks outside your assigned role.

Context keys: ${s.contextKeys.join(", ") || "none"}`;
    }),
  );

  return prompts;
}

function buildLeadCoordinationPrompt(spec: TeamSpec, taskId: string, taskDir: string): string {
  const specialistList = spec.specialists
    .map((s, i) => `  ${i + 1}. ${s.role} (${s.skillPlugin}/${s.skillName})`)
    .join("\n");

  return `You are the team lead coordinating specialists for task ${taskId}.

${spec.leadPrompt}

Specialists that will run in parallel after your coordination phase:
${specialistList}

Task directory: ${taskDir}
Budget: ~${spec.estimatedCost.estimatedTokens.toLocaleString()} tokens (~$${spec.estimatedCost.estimatedCostUsd.toFixed(2)})

Your job in this coordination phase:
1. Review the task and prepare any shared context the specialists will need.
2. Write coordination notes to ${taskDir}/checkpoints/lead-coordination.json
3. Do NOT implement any specialist tasks yourself.
4. Keep this phase brief — specialists will run immediately after.`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCliArgs(prompt: string, model?: string): string[] {
  const args = ["-p", prompt, "--dangerously-skip-permissions", "--output-format", "json"];
  if (model) {
    args.push("--model", model);
  }
  return args;
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-");
}
