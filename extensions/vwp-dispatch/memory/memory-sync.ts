/**
 * Memory sync — background job that syncs completed task data and
 * learned patterns to NotebookLM long-term memory.
 *
 * Non-blocking: errors are logged but never thrown to callers.
 * Idempotent: writes a marker file to avoid double-syncing.
 */

import { readFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MemoryClient, TaskOutcome, LearnedPattern } from "./notebooklm-client.js";
import { atomicWriteFile } from "../atomic-write.js";

const TASKS_DIR = join(homedir(), ".openclaw", "vwp", "tasks");
const SYNC_MARKER = "synced-to-memory.json";

function taskDir(taskId: string): string {
  return join(TASKS_DIR, taskId);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeSyncMarker(taskId: string): Promise<void> {
  const marker = join(taskDir(taskId), SYNC_MARKER);
  await atomicWriteFile(marker, JSON.stringify({ syncedAt: Date.now() }, null, 2));
}

async function isAlreadySynced(taskId: string): Promise<boolean> {
  return fileExists(join(taskDir(taskId), SYNC_MARKER));
}

export class MemorySync {
  private client: MemoryClient;

  constructor(client: MemoryClient) {
    this.client = client;
  }

  /**
   * Sync a completed task to long-term memory.
   * Reads checkpoint data from disk, formats as a TaskOutcome, and stores
   * it via the MemoryClient. Skips if already synced or MCP unavailable.
   */
  async syncTaskCompletion(taskId: string): Promise<void> {
    try {
      if (await isAlreadySynced(taskId)) return;

      const available = await this.client.isAvailable();
      if (!available) {
        console.warn(`[memory-sync] MCP unavailable, skipping sync for ${taskId}`);
        return;
      }

      const dir = taskDir(taskId);

      // Read checkpoint files
      const [requestRaw, decompositionRaw, finalRaw] = await Promise.all([
        readFile(join(dir, "request.json"), "utf-8").catch(() => null),
        readFile(join(dir, "decomposition.json"), "utf-8").catch(() => null),
        readFile(join(dir, "final.json"), "utf-8").catch(() => null),
      ]);

      if (!requestRaw || !finalRaw) {
        console.warn(`[memory-sync] Missing checkpoint data for ${taskId}, skipping`);
        return;
      }

      const request = JSON.parse(requestRaw) as { text: string; createdAt: number };
      const final = JSON.parse(finalRaw) as {
        taskId: string;
        status: string;
        subtasks: Array<{
          id: string;
          skillPlugin: string;
          skillName: string;
          status: string;
          result?: string;
          error?: string;
        }>;
        costTokens?: number;
        costUsd?: number;
      };
      const decomposition = decompositionRaw
        ? (JSON.parse(decompositionRaw) as {
            subtasks: Array<{ description: string; domain: string }>;
          })
        : null;

      // Build TaskOutcome from checkpoint data
      const outcome: TaskOutcome = {
        taskId,
        goal: request.text,
        subtasks: (decomposition?.subtasks ?? []).map((ds, i) => {
          const sr = final.subtasks[i];
          return {
            description: ds.description,
            domain: ds.domain,
            status: sr?.status ?? "unknown",
            result: sr?.result ?? sr?.error,
          };
        }),
        totalCost: {
          tokens: final.costTokens ?? 0,
          usd: final.costUsd ?? 0,
        },
        duration: Date.now() - request.createdAt,
        success: final.status === "completed",
      };

      await this.client.storeTaskOutcome(outcome);
      await writeSyncMarker(taskId);
    } catch (err) {
      console.warn(`[memory-sync] Error syncing task ${taskId}:`, err);
    }
  }

  /**
   * Sync a business profile update to long-term memory.
   */
  async syncProfile(profile: import("../context-loader.js").BusinessProfile): Promise<void> {
    try {
      const available = await this.client.isAvailable();
      if (!available) return;

      await this.client.storeProfile(profile);
    } catch (err) {
      console.warn("[memory-sync] Error syncing profile:", err);
    }
  }

  /**
   * Batch sync accumulated learned patterns.
   * Call periodically or after a batch of tasks complete.
   */
  async syncPatterns(patterns: LearnedPattern[]): Promise<void> {
    try {
      if (patterns.length === 0) return;

      const available = await this.client.isAvailable();
      if (!available) return;

      // Store patterns sequentially to avoid overwhelming the MCP
      for (const pattern of patterns) {
        await this.client.storePattern(pattern);
      }
    } catch (err) {
      console.warn("[memory-sync] Error syncing patterns:", err);
    }
  }
}
