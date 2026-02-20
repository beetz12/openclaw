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
 *     activity.json
 *     metadata.json
 *     checkpoints/{agentName}-{seq}.json
 *     synced-to-memory.json
 */

import { access, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import type { DispatchResult, SubtaskResult, TaskDecomposition, TaskRequest } from "./types.js";

const TASKS_DIR = join(homedir(), ".openclaw", "vwp", "tasks");

function taskDir(taskId: string): string {
  return join(TASKS_DIR, taskId);
}

// -- write helpers ---------------------------------------------------------

export async function createTask(taskId: string, request: TaskRequest): Promise<void> {
  await atomicWriteFile(join(taskDir(taskId), "request.json"), JSON.stringify(request, null, 2));
}

export async function saveDecomposition(taskId: string, data: TaskDecomposition): Promise<void> {
  await atomicWriteFile(join(taskDir(taskId), "decomposition.json"), JSON.stringify(data, null, 2));
}

export async function saveSubtaskResult(
  taskId: string,
  subtaskId: string,
  result: SubtaskResult,
): Promise<void> {
  const resultsDir = join(taskDir(taskId), "results");
  await atomicWriteFile(join(resultsDir, `${subtaskId}.json`), JSON.stringify(result, null, 2));
}

export async function saveFinal(taskId: string, result: DispatchResult): Promise<void> {
  await atomicWriteFile(join(taskDir(taskId), "final.json"), JSON.stringify(result, null, 2));
}

// -- read helpers ----------------------------------------------------------

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function getTaskStatus(taskId: string): Promise<{
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

// -- activity log -----------------------------------------------------------

import type { ActivityEntry } from "./kanban-types.js";

/**
 * Append an activity entry to the task's activity log.
 * Creates the file if it doesn't exist.
 */
export async function saveActivity(taskId: string, entry: ActivityEntry): Promise<void> {
  const path = join(taskDir(taskId), "activity.json");

  const existing = await readJson<ActivityEntry[]>(path);
  const entries = existing ?? [];
  entries.push(entry);

  await atomicWriteFile(path, JSON.stringify(entries, null, 2));
}

/**
 * Read all activity entries for a task.
 * Returns an empty array if no activity log exists.
 */
export async function getActivity(taskId: string): Promise<ActivityEntry[]> {
  const path = join(taskDir(taskId), "activity.json");
  return (await readJson<ActivityEntry[]>(path)) ?? [];
}

// -- agent checkpoints ------------------------------------------------------

/**
 * Save a per-agent checkpoint. Each save creates a sequentially numbered
 * file: checkpoints/{agentName}-{seq}.json
 */
export async function saveAgentCheckpoint(
  taskId: string,
  agentName: string,
  data: unknown,
): Promise<void> {
  const cpDir = join(taskDir(taskId), "checkpoints");

  // Count existing checkpoints for this agent to determine sequence number
  let seq = 0;
  try {
    const files = await readdir(cpDir);
    seq = files.filter((f) => f.startsWith(`${agentName}-`) && f.endsWith(".json")).length;
  } catch {
    // Directory doesn't exist yet, seq stays 0
  }

  await atomicWriteFile(join(cpDir, `${agentName}-${seq}.json`), JSON.stringify(data, null, 2));
}

/**
 * Read all agent checkpoints for a task, grouped by agent name.
 */
export async function getAgentCheckpoints(taskId: string): Promise<Record<string, unknown[]>> {
  const cpDir = join(taskDir(taskId), "checkpoints");
  const result: Record<string, unknown[]> = {};

  try {
    const files = await readdir(cpDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

    const reads = jsonFiles.map(async (f) => {
      const data = await readJson<unknown>(join(cpDir, f));
      const agentName = f.replace(/-\d+\.json$/, "");
      return { agentName, data };
    });

    const entries = await Promise.all(reads);
    for (const { agentName, data } of entries) {
      if (data !== null) {
        (result[agentName] ??= []).push(data);
      }
    }
  } catch {
    // No checkpoints directory yet
  }

  return result;
}

// -- task metadata ----------------------------------------------------------

/**
 * Save task metadata (column position, priority, tags, etc.).
 * Overwrites existing metadata.
 */
export async function saveTaskMetadata(
  taskId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await atomicWriteFile(join(taskDir(taskId), "metadata.json"), JSON.stringify(metadata, null, 2));
}

/**
 * Read task metadata. Returns null if no metadata file exists.
 */
export async function getTaskMetadata(taskId: string): Promise<Record<string, unknown> | null> {
  return readJson<Record<string, unknown>>(join(taskDir(taskId), "metadata.json"));
}

/**
 * Check if a task has a decomposition.json file.
 * Returns true if the file exists, false otherwise.
 */
export async function hasDecomposition(taskId: string): Promise<boolean> {
  try {
    await access(join(taskDir(taskId), "decomposition.json"));
    return true;
  } catch {
    return false;
  }
}
