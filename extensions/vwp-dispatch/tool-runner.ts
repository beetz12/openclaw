/**
 * ToolRunner — manages Python/Node subprocess lifecycle for workspace tools.
 *
 * Features:
 * - Max N concurrent tool runs (default 3)
 * - Per-run timeout with SIGTERM -> SIGKILL escalation
 * - Output buffering with size cap
 * - Cancellation support
 * - SSE event emission via callback
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ToolRunInfo, ToolRunStatus, ToolSSEEvent } from "./kanban-types.js";
import { buildSafeEnv } from "./safe-env.js";

// ---------- Types ----------

export interface ToolRunOptions {
  toolName: string;
  toolLabel: string;
  toolDir: string;
  entrypoint: string;
  runtime: "python3" | "node";
  args: Record<string, string>;
  envAllowlist: string[];
  timeoutSeconds: number;
  maxOutputBytes: number;
  onEvent: (event: ToolSSEEvent) => void;
}

interface ActiveRun {
  info: ToolRunInfo;
  process: ChildProcess;
  timeout: ReturnType<typeof setTimeout>;
  outputSize: number;
  onEvent: (event: ToolSSEEvent) => void;
  resolve: () => void;
}

const SIGKILL_GRACE_MS = 5_000;
const OUTPUT_BATCH_MS = 2_000;
const OUTPUT_BATCH_BYTES = 4_096;

// ---------- Runner ----------

export class ToolRunner {
  private maxConcurrent: number;
  private runs = new Map<string, ActiveRun>();
  private completedRuns: ToolRunInfo[] = [];
  private maxHistory = 50;

  constructor(opts?: { maxConcurrent?: number }) {
    this.maxConcurrent = opts?.maxConcurrent ?? 3;
  }

  async start(options: ToolRunOptions): Promise<string> {
    if (this.runs.size >= this.maxConcurrent) {
      throw new Error(
        `Maximum concurrent tool runs (${this.maxConcurrent}) reached. Cancel a running tool first.`,
      );
    }

    const runId = randomUUID();
    const info: ToolRunInfo = {
      runId,
      toolName: options.toolName,
      toolLabel: options.toolLabel,
      args: options.args,
      status: "running",
      startedAt: Date.now(),
      completedAt: null,
      exitCode: null,
      error: null,
    };

    // Build command
    const cmd = options.runtime === "python3" ? "python3" : "node";
    const cmdArgs = [options.entrypoint];

    // Append args as --key value pairs (skip special __raw key)
    for (const [key, value] of Object.entries(options.args)) {
      if (key === "__raw") {
        // Special: raw arg passed directly (used for inline python -c)
        cmdArgs.push(value);
        continue;
      }
      if (value === "true") {
        cmdArgs.push(`--${key}`);
      } else if (value) {
        cmdArgs.push(`--${key}`, value);
      }
    }

    // Build env with per-tool allowlist
    const safeEnv = buildSafeEnv(process.env as Record<string, string>, options.envAllowlist);

    const child = spawn(cmd, cmdArgs, {
      cwd: options.toolDir,
      env: safeEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    // Emit started event
    options.onEvent({ type: "tool_run_started", run: { ...info } });

    // Output batching
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let outputSize = 0;

    const flushOutput = () => {
      if (stdoutBuffer) {
        options.onEvent({
          type: "tool_run_output",
          runId,
          stream: "stdout",
          chunk: stdoutBuffer,
        });
        stdoutBuffer = "";
      }
      if (stderrBuffer) {
        options.onEvent({
          type: "tool_run_output",
          runId,
          stream: "stderr",
          chunk: stderrBuffer,
        });
        stderrBuffer = "";
      }
    };

    const batchInterval = setInterval(flushOutput, OUTPUT_BATCH_MS);

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      outputSize += data.length;
      if (outputSize <= options.maxOutputBytes) {
        stdoutBuffer += text;
        if (stdoutBuffer.length >= OUTPUT_BATCH_BYTES) {
          flushOutput();
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      outputSize += data.length;
      if (outputSize <= options.maxOutputBytes) {
        stderrBuffer += text;
        if (stderrBuffer.length >= OUTPUT_BATCH_BYTES) {
          flushOutput();
        }
      }
    });

    // Timeout
    const timeout = setTimeout(() => {
      this.killProcess(runId, "timeout");
    }, options.timeoutSeconds * 1000);

    // Promise for waitForRun
    let resolveWait: () => void;
    const waitPromise = new Promise<void>((r) => {
      resolveWait = r;
    });

    const activeRun: ActiveRun = {
      info,
      process: child,
      timeout,
      outputSize: 0,
      onEvent: options.onEvent,
      resolve: resolveWait!,
    };
    this.runs.set(runId, activeRun);

    // Handle exit
    child.on("exit", (code, signal) => {
      clearInterval(batchInterval);
      clearTimeout(timeout);
      flushOutput();

      const run = this.runs.get(runId);
      if (!run) return;

      run.info.completedAt = Date.now();
      run.info.exitCode = code;
      const durationMs = run.info.completedAt - run.info.startedAt;

      if (run.info.status === "cancelled") {
        // Already emitted cancel event
      } else if (code === 0) {
        run.info.status = "completed";
        options.onEvent({
          type: "tool_run_completed",
          runId,
          toolName: options.toolName,
          exitCode: 0,
          durationMs,
        });
      } else {
        run.info.status = "failed";
        const errorMsg = signal
          ? `Process killed by signal ${signal}`
          : `Process exited with code ${code}`;
        run.info.error = errorMsg;
        options.onEvent({
          type: "tool_run_failed",
          runId,
          toolName: options.toolName,
          error: errorMsg,
        });
      }

      this.completedRuns.push({ ...run.info });
      if (this.completedRuns.length > this.maxHistory) {
        this.completedRuns.shift();
      }
      this.runs.delete(runId);
      run.resolve();
    });

    child.on("error", (err) => {
      clearInterval(batchInterval);
      clearTimeout(timeout);

      const run = this.runs.get(runId);
      if (!run) return;

      run.info.completedAt = Date.now();
      run.info.status = "failed";
      run.info.error = err.message;

      options.onEvent({
        type: "tool_run_failed",
        runId,
        toolName: options.toolName,
        error: err.message,
      });

      this.completedRuns.push({ ...run.info });
      if (this.completedRuns.length > this.maxHistory) {
        this.completedRuns.shift();
      }
      this.runs.delete(runId);
      run.resolve();
    });

    return runId;
  }

  async cancel(runId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run) return false;

    run.info.status = "cancelled";
    run.onEvent({
      type: "tool_run_cancelled",
      runId,
      toolName: run.info.toolName,
    });

    this.killProcess(runId, "cancel");
    return true;
  }

  async cancelAll(): Promise<void> {
    for (const runId of [...this.runs.keys()]) {
      await this.cancel(runId);
    }
  }

  async waitForRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    await new Promise<void>((resolve) => {
      const original = run.resolve;
      run.resolve = () => {
        original();
        resolve();
      };
    });
  }

  getActiveRuns(): ToolRunInfo[] {
    return [...this.runs.values()].map((r) => ({ ...r.info }));
  }

  getCompletedRuns(): ToolRunInfo[] {
    return [...this.completedRuns];
  }

  getRun(runId: string): ToolRunInfo | null {
    const active = this.runs.get(runId);
    if (active) return { ...active.info };
    return this.completedRuns.find((r) => r.runId === runId) ?? null;
  }

  private killProcess(runId: string, reason: string): void {
    const run = this.runs.get(runId);
    if (!run || !run.process.pid) return;

    try {
      run.process.kill("SIGTERM");
    } catch {
      // Process may already be dead
    }

    // Escalate to SIGKILL after grace period
    setTimeout(() => {
      try {
        run.process.kill("SIGKILL");
      } catch {
        // Ignore — process already exited
      }
    }, SIGKILL_GRACE_MS);
  }
}
