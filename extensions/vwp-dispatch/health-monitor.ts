/**
 * Health monitor — detects stuck tasks via configurable per-subtask timeouts.
 */

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface MonitorEntry {
  taskId: string;
  startedAt: number;
  timeoutMs: number;
  timer: ReturnType<typeof setInterval>;
  stuck: boolean;
}

export class HealthMonitor {
  private monitors = new Map<string, MonitorEntry>();

  /** Begin monitoring a task. If it isn't completed/stopped within `timeoutMs` it is flagged as stuck. */
  startMonitoring(taskId: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): void {
    // Avoid duplicate monitors for the same task.
    this.stopMonitoring(taskId);

    const entry: MonitorEntry = {
      taskId,
      startedAt: Date.now(),
      timeoutMs,
      stuck: false,
      // Check every 10 s (or half the timeout if that's shorter).
      timer: setInterval(
        () => {
          if (Date.now() - entry.startedAt >= entry.timeoutMs) {
            entry.stuck = true;
          }
        },
        Math.min(10_000, Math.floor(timeoutMs / 2)),
      ),
    };

    // Let the timer not block Node from exiting.
    if (entry.timer.unref) entry.timer.unref();

    this.monitors.set(taskId, entry);
  }

  /** Stop monitoring a task (e.g. when it completes). */
  stopMonitoring(taskId: string): void {
    const entry = this.monitors.get(taskId);
    if (!entry) return;
    clearInterval(entry.timer);
    this.monitors.delete(taskId);
  }

  /** Check whether a specific task is stuck. */
  checkHealth(taskId: string): { monitored: boolean; stuck: boolean; elapsedMs: number } {
    const entry = this.monitors.get(taskId);
    if (!entry) return { monitored: false, stuck: false, elapsedMs: 0 };
    return {
      monitored: true,
      stuck: entry.stuck || Date.now() - entry.startedAt >= entry.timeoutMs,
      elapsedMs: Date.now() - entry.startedAt,
    };
  }

  /** Return all tasks currently flagged as stuck. */
  getStuckTasks(): string[] {
    const now = Date.now();
    const stuck: string[] = [];
    for (const entry of this.monitors.values()) {
      if (entry.stuck || now - entry.startedAt >= entry.timeoutMs) {
        stuck.push(entry.taskId);
      }
    }
    return stuck;
  }

  /** Clean up all timers (useful in tests or on shutdown). */
  dispose(): void {
    for (const entry of this.monitors.values()) {
      clearInterval(entry.timer);
    }
    this.monitors.clear();
  }
}
