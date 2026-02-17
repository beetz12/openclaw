/**
 * Approval gate — pause/resume mechanism for sensitive agent actions.
 *
 * When a specialist writes a pending-action file, the gate detects it (via
 * the TeamMonitor) and emits an approval_required SSE event. The dashboard
 * can then approve or reject via the HTTP routes, which call handleApproval().
 *
 * Pending actions are stored at:
 *   ~/.openclaw/vwp/tasks/{taskId}/pending-actions/{actionId}.json
 *   ~/.openclaw/vwp/tasks/{taskId}/pending-actions/{actionId}-response.json
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ApprovalSSE } from "../vwp-approval/sse.js";

const TASKS_BASE = join(homedir(), ".openclaw", "vwp", "tasks");

export interface PendingAction {
  actionId: string;
  subtaskId: string;
  actionType: string;
  detail: string;
  createdAt: number;
  status: "pending" | "approved" | "rejected";
}

export interface ApprovalResponse {
  actionId: string;
  approved: boolean;
  reason?: string;
  respondedAt: number;
}

export class ApprovalGate {
  private taskId: string;
  private taskDir: string;
  private pendingDir: string;
  private sse?: ApprovalSSE;

  constructor(taskId: string, sse?: ApprovalSSE) {
    this.taskId = taskId;
    this.taskDir = join(TASKS_BASE, taskId);
    this.pendingDir = join(this.taskDir, "pending-actions");
    this.sse = sse;
  }

  /**
   * Request approval for a sensitive action. Writes a pending-action file
   * and emits an SSE event. Returns true if approved, false if rejected.
   *
   * This method blocks until a response file appears (polled every 500ms)
   * or the timeout is reached (default 5 minutes).
   */
  async requestApproval(
    subtaskId: string,
    actionType: string,
    detail: string,
    timeoutMs = 5 * 60 * 1000,
  ): Promise<boolean> {
    await mkdir(this.pendingDir, { recursive: true });

    const actionId = `${subtaskId}-${Date.now()}`;
    const action: PendingAction = {
      actionId,
      subtaskId,
      actionType,
      detail,
      createdAt: Date.now(),
      status: "pending",
    };

    // Write the pending action file — the monitor will detect this and emit SSE.
    await writeFile(join(this.pendingDir, `${actionId}.json`), JSON.stringify(action, null, 2));

    // Also emit SSE directly for immediate notification.
    this.sse?.emit({
      type: "approval_required",
      taskId: this.taskId,
      subtaskId,
      actionType,
    });

    // Poll for response file.
    const responsePath = join(this.pendingDir, `${actionId}-response.json`);
    const start = Date.now();
    const pollInterval = 500;

    while (Date.now() - start < timeoutMs) {
      try {
        const raw = await readFile(responsePath, "utf-8");
        const response = JSON.parse(raw) as ApprovalResponse;
        return response.approved;
      } catch {
        // Response not yet written — wait and retry.
      }
      await sleep(pollInterval);
    }

    // Timeout — treat as rejected.
    return false;
  }

  /**
   * Handle an approval or rejection from the dashboard. Writes a response
   * file that the polling requestApproval() will pick up.
   */
  async handleApproval(actionId: string, approved: boolean, reason?: string): Promise<void> {
    await mkdir(this.pendingDir, { recursive: true });

    const response: ApprovalResponse = {
      actionId,
      approved,
      reason,
      respondedAt: Date.now(),
    };

    await writeFile(
      join(this.pendingDir, `${actionId}-response.json`),
      JSON.stringify(response, null, 2),
    );
  }

  /** Return all pending (unanswered) actions for this task. */
  async getPending(): Promise<PendingAction[]> {
    const pending: PendingAction[] = [];

    try {
      const files = await readdir(this.pendingDir);
      const actionFiles = files.filter((f) => f.endsWith(".json") && !f.includes("-response"));

      for (const file of actionFiles) {
        try {
          const raw = await readFile(join(this.pendingDir, file), "utf-8");
          const action = JSON.parse(raw) as PendingAction;

          // Check if there is a response file.
          const responseFile = file.replace(/\.json$/, "-response.json");
          const hasResponse = files.includes(responseFile);

          if (!hasResponse) {
            pending.push(action);
          }
        } catch {
          // Skip unreadable files.
        }
      }
    } catch {
      // No pending-actions directory yet.
    }

    return pending;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
