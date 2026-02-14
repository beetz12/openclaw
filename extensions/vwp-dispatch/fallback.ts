/**
 * Single-agent fallback mode — runs skills sequentially in one CLI session
 * when agent teams are unavailable (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
 * not set or explicitly disabled).
 */

import { spawn } from "node:child_process";
import type { DispatchResult, SkillMatch, SubtaskResult, TaskRequest } from "./types.js";
import * as checkpoint from "./checkpoint.js";

/**
 * Run a single CLI subprocess and capture its stdout.
 * Uses the same subprocess pattern as the rest of the dispatch system.
 */
function runCliSubprocess(prompt: string): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn("openclaw", ["message", "send", "--text", prompt, "--no-stream"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    // Capture stderr but don't fail on it — CLI may emit warnings
    child.stderr.on("data", () => {});

    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(chunks).toString("utf-8"),
        exitCode: code ?? 1,
      });
    });

    child.on("error", () => {
      resolve({ stdout: "", exitCode: 1 });
    });
  });
}

/**
 * Run all matched skills sequentially in a single CLI session.
 * Writes results to the same checkpoint structure used by the team-based dispatch.
 */
export async function runFallback(
  request: TaskRequest,
  skills: SkillMatch[],
): Promise<DispatchResult> {
  const subtasks: SubtaskResult[] = [];

  for (const skill of skills) {
    const subtaskId = `${skill.plugin}-${skill.skill}`;
    const subtask: SubtaskResult = {
      id: subtaskId,
      skillPlugin: skill.plugin,
      skillName: skill.skill,
      status: "running",
    };

    await checkpoint.saveSubtaskResult(request.id, subtaskId, subtask);

    const prompt = buildSkillPrompt(request.text, skill);
    const { stdout, exitCode } = await runCliSubprocess(prompt);

    if (exitCode === 0 && stdout.trim()) {
      subtask.status = "completed";
      subtask.result = stdout.trim();
    } else {
      subtask.status = "failed";
      subtask.error = exitCode === 0 ? "Empty response" : `CLI exited with code ${exitCode}`;
    }

    await checkpoint.saveSubtaskResult(request.id, subtaskId, subtask);
    subtasks.push(subtask);
  }

  const allCompleted = subtasks.every((s) => s.status === "completed");
  const synthesized = subtasks
    .filter((s) => s.result)
    .map((s) => `## ${s.skillPlugin}/${s.skillName}\n\n${s.result}`)
    .join("\n\n---\n\n");

  const result: DispatchResult = {
    taskId: request.id,
    status: allCompleted ? "completed" : "failed",
    subtasks,
    synthesizedResult: synthesized || undefined,
  };

  await checkpoint.saveFinal(request.id, result);
  return result;
}

function buildSkillPrompt(taskText: string, skill: SkillMatch): string {
  return [
    `You are acting as a ${skill.userLabel} specialist.`,
    `Use the ${skill.plugin}/${skill.skill} skill to complete this task.`,
    "",
    `Task: ${taskText}`,
  ].join("\n");
}
