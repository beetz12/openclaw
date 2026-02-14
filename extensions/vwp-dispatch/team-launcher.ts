/**
 * Team launcher — spawns a Claude CLI subprocess with a natural-language
 * team prompt that instructs Claude to create an agent team.
 *
 * This does NOT use a TeamCreate API. It follows the project's existing
 * subprocess-spawning pattern from src/agents/cli-runner.ts and lets the
 * Claude CLI handle the actual agent team orchestration.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SkillRegistry } from "./skill-registry.js";
import type { TeamSpec } from "./types.js";
import { generateSkillSummary } from "./context-loader.js";

const TASKS_BASE = join(homedir(), ".openclaw", "vwp", "tasks");

export type LaunchOptions = {
  /** Working directory for the Claude CLI subprocess. */
  workspaceDir?: string;
  /** Timeout for the entire team run in milliseconds. */
  timeoutMs?: number;
  /** Provider for the CLI backend. */
  provider?: string;
  /** Model override for the team lead. */
  model?: string;
};

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Launch an agent team by spawning the Claude CLI as a subprocess.
 *
 * Builds a natural-language prompt describing the team, specialists, and
 * checkpoint instructions. The CLI then creates the agent team internally.
 */
export async function launchTeam(
  spec: TeamSpec,
  taskId: string,
  registry: SkillRegistry,
  options: LaunchOptions = {},
): Promise<void> {
  const { runCommandWithTimeout } = await import("../../src/process/exec.js");

  const taskDir = join(TASKS_BASE, taskId);
  await mkdir(taskDir, { recursive: true });

  const prompt = await buildTeamPrompt(spec, taskId, taskDir, registry);

  // Persist the prompt for debugging.
  await writeFile(join(taskDir, "team-prompt.txt"), prompt);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const args = ["-p", prompt, "--dangerously-skip-permissions", "--output-format", "json"];

  if (options.model) {
    args.push("--model", options.model);
  }

  const result = await runCommandWithTimeout(["claude", ...args], {
    timeoutMs,
    cwd: options.workspaceDir,
    env: {
      ...process.env,
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
    },
  });

  if (result.code !== 0) {
    const error = result.stderr || result.stdout || "Team launch failed";
    throw new Error(`Team launch failed (exit ${result.code}): ${error}`);
  }

  // Write the CLI output as the raw result.
  await writeFile(join(taskDir, "team-output.json"), result.stdout);
}

// ── Prompt building ──────────────────────────────────────────────────────────

async function buildTeamPrompt(
  spec: TeamSpec,
  taskId: string,
  taskDir: string,
  registry: SkillRegistry,
): Promise<string> {
  const specialistDescriptions = await Promise.all(
    spec.specialists.map(async (s, i) => {
      const summary = await generateSkillSummary(
        registry.getSkill(s.skillPlugin, s.skillName)?.skillPath ?? "",
      );
      const summaryBlock = summary ? `\n\nSkill instructions for this teammate:\n${summary}` : "";

      return `Teammate ${i + 1}: "${s.role}"
  Role: ${s.role}
  Plugin: ${s.skillPlugin} / ${s.skillName}${summaryBlock}`;
    }),
  );

  return `Create an agent team to complete a business task.

Task ID: ${taskId}
Results directory: ${taskDir}

${spec.leadPrompt}

Teammates to spawn:
${specialistDescriptions.join("\n\n")}

IMPORTANT: Every teammate must write their results as JSON files to:
  ${taskDir}/results/

After ALL teammates finish, synthesize the combined results into:
  ${taskDir}/final.json

Use delegate mode — do not implement tasks yourself, only coordinate.`;
}
