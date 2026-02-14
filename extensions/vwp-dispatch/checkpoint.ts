/**
 * Checkpoint — persists intermediate task results to disk so work survives
 * restarts and can be inspected after the fact.
 *
 * Directory layout:
 *   ~/.openclaw/vwp/tasks/{task-id}/
 *     request.json
 *     decomposition.json
 *     results/{subtask-id}.json
 *     final.json
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DispatchResult, SubtaskResult, TaskDecomposition, TaskRequest } from "./types.js";

const TASKS_DIR = join(homedir(), ".openclaw", "vwp", "tasks");

function taskDir(taskId: string): string {
  return join(TASKS_DIR, taskId);
}

// -- write helpers ---------------------------------------------------------

export async function createTask(taskId: string, request: TaskRequest): Promise<void> {
  const dir = taskDir(taskId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "request.json"), JSON.stringify(request, null, 2));
}

export async function saveDecomposition(taskId: string, data: TaskDecomposition): Promise<void> {
  const dir = taskDir(taskId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "decomposition.json"), JSON.stringify(data, null, 2));
}

export async function saveSubtaskResult(
  taskId: string,
  subtaskId: string,
  result: SubtaskResult,
): Promise<void> {
  const resultsDir = join(taskDir(taskId), "results");
  await mkdir(resultsDir, { recursive: true });
  await writeFile(join(resultsDir, `${subtaskId}.json`), JSON.stringify(result, null, 2));
}

export async function saveFinal(taskId: string, result: DispatchResult): Promise<void> {
  const dir = taskDir(taskId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "final.json"), JSON.stringify(result, null, 2));
}

// -- read helpers ----------------------------------------------------------

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function getTaskStatus(
  taskId: string,
): Promise<{
  request: TaskRequest | null;
  decomposition: TaskDecomposition | null;
  final: DispatchResult | null;
}> {
  const dir = taskDir(taskId);
  const [request, decomposition, final] = await Promise.all([
    readJson<TaskRequest>(join(dir, "request.json")),
    readJson<TaskDecomposition>(join(dir, "decomposition.json")),
    readJson<DispatchResult>(join(dir, "final.json")),
  ]);
  return { request, decomposition, final };
}

export async function getTask(taskId: string): Promise<{
  request: TaskRequest | null;
  decomposition: TaskDecomposition | null;
  subtaskResults: SubtaskResult[];
  final: DispatchResult | null;
}> {
  const dir = taskDir(taskId);
  const { request, decomposition, final } = await getTaskStatus(taskId);

  const subtaskResults: SubtaskResult[] = [];
  try {
    const files = await readdir(join(dir, "results"));
    const reads = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson<SubtaskResult>(join(dir, "results", f)));
    const results = await Promise.all(reads);
    for (const r of results) {
      if (r) subtaskResults.push(r);
    }
  } catch {
    // No results directory yet — that's fine.
  }

  return { request, decomposition, subtaskResults, final };
}

export async function listTasks(): Promise<string[]> {
  try {
    return await readdir(TASKS_DIR);
  } catch {
    return [];
  }
}
