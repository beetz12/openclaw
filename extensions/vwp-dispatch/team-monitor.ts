/**
 * Team monitor — watches the task checkpoint directory for real-time progress
 * using chokidar file watching. Emits SSE events as agent files appear.
 *
 * Directory layout watched:
 *   ~/.openclaw/vwp/tasks/{taskId}/
 *     results/{subtaskId}.json      -> subtask_completed
 *     checkpoints/{agentName}-*.json -> agent_action
 *     final.json                    -> task complete
 */

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ApprovalSSE } from "../vwp-approval/sse.js";
import type { KanbanSSEEvent } from "./kanban-types.js";
import { getVwpTasksDir } from "./paths.js";

export type ProgressHandler = (event: KanbanSSEEvent) => void;

export class TeamMonitor {
  private taskId: string;
  private taskDir: string;
  private sse?: ApprovalSSE;
  private watcher: ReturnType<(typeof import("chokidar"))["watch"]> | null = null;
  private handlers: ProgressHandler[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private stopped = false;

  constructor(taskId: string, sse?: ApprovalSSE) {
    this.taskId = taskId;
    this.taskDir = join(getVwpTasksDir(), taskId);
    this.sse = sse;
  }

  /** Register a progress event handler. */
  onProgress(handler: ProgressHandler): void {
    this.handlers.push(handler);
  }

  /** Start watching the task checkpoint directory for file changes. */
  async start(): Promise<void> {
    // Dynamic import so chokidar is resolved at runtime.
    const { watch } = await import("chokidar");

    this.watcher = watch(this.taskDir, {
      ignoreInitial: true,
      depth: 2,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    this.watcher.on("add", (filePath: string) => {
      this.handleFileDebounced(filePath);
    });

    this.watcher.on("change", (filePath: string) => {
      this.handleFileDebounced(filePath);
    });
  }

  /** Stop watching and clean up. */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private handleFileDebounced(filePath: string): void {
    if (this.stopped) return;

    // Debounce by file path — 100ms.
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      void this.handleFile(filePath);
    }, 100);

    this.debounceTimers.set(filePath, timer);
  }

  private async handleFile(filePath: string): Promise<void> {
    if (this.stopped) return;

    const relative = filePath.slice(this.taskDir.length + 1);
    const fileName = basename(filePath);

    if (!fileName.endsWith(".json")) return;

    try {
      // results/{subtaskId}.json -> subtask completed
      if (relative.startsWith("results/")) {
        const subtaskId = fileName.replace(/\.json$/, "");
        const data = await this.readJson(filePath);
        const result = typeof data?.result === "string" ? data.result : "completed";
        const agentName = typeof data?.agentName === "string" ? data.agentName : subtaskId;

        if (data?.status === "failed") {
          this.emit({
            type: "subtask_failed",
            taskId: this.taskId,
            subtaskId,
            error: typeof data.error === "string" ? data.error : "unknown error",
          });
        } else {
          this.emit({
            type: "subtask_completed",
            taskId: this.taskId,
            subtaskId,
            result,
          });
        }
        return;
      }

      // checkpoints/{agentName}-*.json -> agent action
      if (relative.startsWith("checkpoints/")) {
        const data = await this.readJson(filePath);
        // Extract agent name: everything before the first dash
        const match = fileName.match(/^(.+?)-/);
        const agentName = match?.[1] ?? fileName.replace(/\.json$/, "");
        const action = typeof data?.action === "string" ? data.action : "checkpoint";
        const detail = typeof data?.detail === "string" ? data.detail : "";

        this.emit({
          type: "agent_action",
          taskId: this.taskId,
          agentName,
          action,
          detail,
        });
        return;
      }

      // pending-actions/*.json -> approval required (new pending action detected)
      if (relative.startsWith("pending-actions/") && !fileName.includes("-response")) {
        const data = await this.readJson(filePath);
        const subtaskId = typeof data?.subtaskId === "string" ? data.subtaskId : "unknown";
        const actionType = typeof data?.actionType === "string" ? data.actionType : "unknown";

        this.emit({
          type: "approval_required",
          taskId: this.taskId,
          subtaskId,
          actionType,
        });
        return;
      }

      // final.json -> task complete
      if (fileName === "final.json") {
        const data = await this.readJson(filePath);
        const tokens = typeof data?.costTokens === "number" ? data.costTokens : 0;
        const usd = typeof data?.costUsd === "number" ? data.costUsd : 0;

        if (tokens > 0 || usd > 0) {
          this.emit({
            type: "cost_update",
            taskId: this.taskId,
            currentTokens: tokens,
            currentUsd: usd,
          });
        }

        // Auto-stop on final.json.
        await this.stop();
        return;
      }
    } catch {
      // File read race — ignore.
    }
  }

  private emit(event: KanbanSSEEvent): void {
    if (this.stopped) return;
    this.sse?.emit(event);
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        // Handler errors should not crash the monitor.
      }
    }
  }

  private async readJson(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
