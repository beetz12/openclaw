/**
 * Task cleanup — removes old completed task data to prevent disk bloat.
 *
 * Scans ~/.openclaw/vwp/tasks/{taskId}/final.json and deletes task
 * directories older than the configured age threshold.
 */

import { readdir, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface TaskFinal {
  completedAt?: number;
  status?: string;
}

export interface CleanupOptions {
  /** Maximum age in days before a task is eligible for deletion. */
  maxAgeDays?: number;
  /** Optional override for tasks directory (for testing). */
  tasksDir?: string;
}

export interface CleanupResult {
  /** Number of task directories deleted. */
  deleted: number;
  /** List of task IDs that were deleted. */
  taskIds: string[];
}

/**
 * Clean up old completed task data.
 *
 * Deletes task directories for tasks that:
 * - Have a completedAt timestamp in final.json
 * - Were completed more than maxAgeDays ago
 *
 * @param options - Cleanup configuration
 * @returns Result with count and IDs of deleted tasks
 */
export async function cleanupOldTasks(options: CleanupOptions = {}): Promise<CleanupResult> {
  const maxAgeDays = options.maxAgeDays ?? 90;
  const tasksDir = options.tasksDir ?? join(homedir(), ".openclaw", "vwp", "tasks");

  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const deleted: string[] = [];

  try {
    const taskIds = await readdir(tasksDir);

    for (const id of taskIds) {
      try {
        const taskDir = join(tasksDir, id);
        const finalPath = join(taskDir, "final.json");

        // Check if final.json exists
        try {
          await stat(finalPath);
        } catch {
          // No final.json, skip this task
          continue;
        }

        // Read and parse final.json
        const raw = await readFile(finalPath, "utf-8");
        const final = JSON.parse(raw) as TaskFinal;

        // Only delete if completedAt exists and is older than cutoff
        if (final.completedAt && final.completedAt < cutoffTime) {
          await rm(taskDir, { recursive: true, force: true });
          deleted.push(id);
        }
      } catch {
        // Skip individual tasks that can't be processed
      }
    }
  } catch {
    // Tasks directory doesn't exist or isn't readable
  }

  return {
    deleted: deleted.length,
    taskIds: deleted,
  };
}
