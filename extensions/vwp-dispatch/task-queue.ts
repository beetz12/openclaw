/**
 * Serial task queue — one task runs at a time, the rest wait in FIFO order.
 * Queue state is persisted to ~/.openclaw/vwp/queue.json.
 */

import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TaskRequest } from "./types.js";

type QueueEvent = "task_queued" | "task_started" | "task_completed" | "task_cancelled";

interface QueueState {
  active: TaskRequest | null;
  pending: TaskRequest[];
}

const BASE_DIR = join(homedir(), ".openclaw", "vwp");
const QUEUE_FILE = join(BASE_DIR, "queue.json");

export class TaskQueue extends EventEmitter {
  private active: TaskRequest | null = null;
  private pending: TaskRequest[] = [];

  // -- public API ----------------------------------------------------------

  async enqueue(task: TaskRequest): Promise<number> {
    if (this.active === null) {
      this.active = task;
      await this.persist();
      this.emit("task_started" satisfies QueueEvent, task);
      return 0;
    }
    this.pending.push(task);
    await this.persist();
    this.emit("task_queued" satisfies QueueEvent, task);
    return this.pending.length; // 1-based position in the waiting list
  }

  async dequeue(): Promise<TaskRequest | null> {
    if (this.pending.length === 0) return null;
    const next = this.pending.shift()!;
    this.active = next;
    await this.persist();
    this.emit("task_started" satisfies QueueEvent, next);
    return next;
  }

  getPosition(taskId: string): number {
    if (this.active?.id === taskId) return 0;
    const idx = this.pending.findIndex((t) => t.id === taskId);
    return idx === -1 ? -1 : idx + 1;
  }

  async cancel(taskId: string): Promise<boolean> {
    if (this.active?.id === taskId) {
      const cancelled = this.active;
      this.active = null;
      await this.persist();
      this.emit("task_cancelled" satisfies QueueEvent, cancelled);
      return true;
    }
    const idx = this.pending.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;
    const [cancelled] = this.pending.splice(idx, 1);
    await this.persist();
    this.emit("task_cancelled" satisfies QueueEvent, cancelled);
    return true;
  }

  async completeActive(): Promise<void> {
    if (!this.active) return;
    const completed = this.active;
    this.active = null;
    await this.persist();
    this.emit("task_completed" satisfies QueueEvent, completed);
  }

  getActive(): TaskRequest | null {
    return this.active;
  }

  getQueue(): TaskRequest[] {
    return [...this.pending];
  }

  // -- persistence ---------------------------------------------------------

  async load(): Promise<void> {
    try {
      const raw = await readFile(QUEUE_FILE, "utf-8");
      const state: QueueState = JSON.parse(raw);
      this.active = state.active;
      this.pending = state.pending ?? [];
    } catch {
      // File doesn't exist or is corrupt — start fresh.
      this.active = null;
      this.pending = [];
    }
  }

  private async persist(): Promise<void> {
    const state: QueueState = { active: this.active, pending: this.pending };
    await mkdir(BASE_DIR, { recursive: true });
    await writeFile(QUEUE_FILE, JSON.stringify(state, null, 2));
  }
}
