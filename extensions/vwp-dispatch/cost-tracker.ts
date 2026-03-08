/**
 * Cost tracking — reads completed task costs from persistence layer.
 *
 * Scans ~/.openclaw/vwp/tasks/{taskId}/final.json for completed tasks
 * and aggregates their costs for budget enforcement.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getVwpTasksDir } from "./paths.js";

interface TaskFinal {
  costUsd?: number;
  completedAt?: number;
  status?: string;
}

/**
 * Calculate total spending for the current calendar month.
 *
 * Reads all task final.json files and sums the costUsd for tasks
 * completed in the current month (based on completedAt timestamp).
 *
 * @param tasksDir - Optional override for tasks directory (for testing)
 * @returns Total USD spent this month
 */
export async function getMonthlySpend(tasksDir?: string): Promise<number> {
  const dir = tasksDir ?? getVwpTasksDir();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let total = 0;

  try {
    const taskIds = await readdir(dir);

    for (const id of taskIds) {
      try {
        const finalPath = join(dir, id, "final.json");
        const raw = await readFile(finalPath, "utf-8");
        const final = JSON.parse(raw) as TaskFinal;

        // Only count tasks completed this month with a defined cost
        if (final.costUsd && (final.completedAt ?? 0) >= monthStart) {
          total += final.costUsd;
        }
      } catch {
        // Skip individual task files that don't exist or are malformed
      }
    }
  } catch {
    // Tasks directory doesn't exist yet or isn't readable
  }

  return total;
}
