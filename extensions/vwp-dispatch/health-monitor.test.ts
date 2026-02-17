/**
 * Tests for health-monitor.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HealthMonitor } from "./health-monitor.js";

describe("HealthMonitor", () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (monitor) {
      monitor.dispose();
    }
    vi.useRealTimers();
  });

  it("starts monitoring a task", () => {
    monitor = new HealthMonitor();
    monitor.startMonitoring("task-1", 60000);

    const health = monitor.checkHealth("task-1");
    expect(health.monitored).toBe(true);
    expect(health.stuck).toBe(false);
    expect(health.elapsedMs).toBeLessThan(100);
  });

  it("detects a task as stuck after timeout", () => {
    monitor = new HealthMonitor();
    monitor.startMonitoring("task-1", 1000); // 1 second timeout

    // Initially not stuck
    let health = monitor.checkHealth("task-1");
    expect(health.stuck).toBe(false);

    // Advance time past timeout
    vi.advanceTimersByTime(1500);

    health = monitor.checkHealth("task-1");
    expect(health.stuck).toBe(true);
    expect(health.elapsedMs).toBeGreaterThanOrEqual(1000);
  });

  it("stops monitoring a task", () => {
    monitor = new HealthMonitor();
    monitor.startMonitoring("task-1", 60000);

    let health = monitor.checkHealth("task-1");
    expect(health.monitored).toBe(true);

    monitor.stopMonitoring("task-1");

    health = monitor.checkHealth("task-1");
    expect(health.monitored).toBe(false);
    expect(health.stuck).toBe(false);
  });

  it("returns all stuck tasks", () => {
    monitor = new HealthMonitor();
    monitor.startMonitoring("task-1", 1000);
    monitor.startMonitoring("task-2", 2000);
    monitor.startMonitoring("task-3", 5000);

    // Advance time to make task-1 and task-2 stuck
    vi.advanceTimersByTime(2500);

    const stuckTasks = monitor.getStuckTasks();
    expect(stuckTasks).toContain("task-1");
    expect(stuckTasks).toContain("task-2");
    expect(stuckTasks).not.toContain("task-3");
  });

  it("prevents duplicate monitors for the same task", () => {
    monitor = new HealthMonitor();
    monitor.startMonitoring("task-1", 1000);
    monitor.startMonitoring("task-1", 2000); // Should replace the first monitor

    // Advance time past first timeout but not second
    vi.advanceTimersByTime(1500);

    const health = monitor.checkHealth("task-1");
    expect(health.stuck).toBe(false); // Should use the 2000ms timeout
  });

  it("cleans up all timers on dispose", () => {
    monitor = new HealthMonitor();
    monitor.startMonitoring("task-1", 60000);
    monitor.startMonitoring("task-2", 60000);

    monitor.dispose();

    const health1 = monitor.checkHealth("task-1");
    const health2 = monitor.checkHealth("task-2");
    expect(health1.monitored).toBe(false);
    expect(health2.monitored).toBe(false);
  });

  describe("onStuck callback", () => {
    it("calls onStuck callback when task becomes stuck", () => {
      const onStuck = vi.fn();
      monitor = new HealthMonitor({ onStuck });

      monitor.startMonitoring("task-1", 1000);

      // Callback should not be called yet
      expect(onStuck).not.toHaveBeenCalled();

      // Advance time past timeout
      vi.advanceTimersByTime(1500);

      // Callback should be called with the stuck task ID
      expect(onStuck).toHaveBeenCalledTimes(1);
      expect(onStuck).toHaveBeenCalledWith("task-1");
    });

    it("calls onStuck only once per task", () => {
      const onStuck = vi.fn();
      monitor = new HealthMonitor({ onStuck });

      monitor.startMonitoring("task-1", 1000);

      // Advance time well past timeout
      vi.advanceTimersByTime(5000);

      // Callback should only be called once, not multiple times
      expect(onStuck).toHaveBeenCalledTimes(1);
    });

    it("does not call onStuck if task is stopped before timeout", () => {
      const onStuck = vi.fn();
      monitor = new HealthMonitor({ onStuck });

      monitor.startMonitoring("task-1", 1000);
      monitor.stopMonitoring("task-1");

      // Advance time past what would have been the timeout
      vi.advanceTimersByTime(2000);

      expect(onStuck).not.toHaveBeenCalled();
    });

    it("calls onStuck for multiple stuck tasks", () => {
      const onStuck = vi.fn();
      monitor = new HealthMonitor({ onStuck });

      monitor.startMonitoring("task-1", 1000);
      monitor.startMonitoring("task-2", 1500);

      // Advance time to make both stuck
      vi.advanceTimersByTime(2000);

      expect(onStuck).toHaveBeenCalledTimes(2);
      expect(onStuck).toHaveBeenCalledWith("task-1");
      expect(onStuck).toHaveBeenCalledWith("task-2");
    });

    it("works without onStuck callback (optional)", () => {
      monitor = new HealthMonitor(); // No callback provided

      monitor.startMonitoring("task-1", 1000);

      // Should not throw when callback is not provided
      expect(() => {
        vi.advanceTimersByTime(1500);
      }).not.toThrow();

      const health = monitor.checkHealth("task-1");
      expect(health.stuck).toBe(true);
    });

    it("handles errors in onStuck callback gracefully", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const onStuck = vi.fn(() => {
        throw new Error("Callback error");
      });
      monitor = new HealthMonitor({ onStuck });

      monitor.startMonitoring("task-1", 1000);

      // Advance time to trigger the stuck detection
      vi.advanceTimersByTime(1500);

      // Callback should have been called despite throwing an error
      expect(onStuck).toHaveBeenCalled();

      // Error should have been logged to console
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  it("returns unmonitored status for non-existent task", () => {
    monitor = new HealthMonitor();

    const health = monitor.checkHealth("non-existent");
    expect(health.monitored).toBe(false);
    expect(health.stuck).toBe(false);
    expect(health.elapsedMs).toBe(0);
  });
});
