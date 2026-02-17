/**
 * Tests for shutdown.ts
 */

import { describe, it, expect, vi } from "vitest";
import { ShutdownManager } from "./shutdown.js";

describe("ShutdownManager", () => {
  it("runs all cleanup handlers on shutdown", async () => {
    const manager = new ShutdownManager();
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);
    const handler3 = vi.fn().mockResolvedValue(undefined);

    manager.onShutdown(handler1);
    manager.onShutdown(handler2);
    manager.onShutdown(handler3);

    await manager.shutdown();

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler3).toHaveBeenCalledOnce();
  });

  it("is idempotent - only runs handlers once even if called multiple times", async () => {
    const manager = new ShutdownManager();
    const handler = vi.fn().mockResolvedValue(undefined);

    manager.onShutdown(handler);

    await manager.shutdown();
    await manager.shutdown();
    await manager.shutdown();

    expect(handler).toHaveBeenCalledOnce();
  });

  it("continues running handlers even if one fails", async () => {
    const manager = new ShutdownManager();
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockRejectedValue(new Error("Handler 2 failed"));
    const handler3 = vi.fn().mockResolvedValue(undefined);

    // Mock console.error to avoid cluttering test output
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    manager.onShutdown(handler1);
    manager.onShutdown(handler2);
    manager.onShutdown(handler3);

    await manager.shutdown();

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler3).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[vwp-shutdown] Cleanup handler failed:",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("registers signal handlers for SIGTERM and SIGINT", () => {
    const manager = new ShutdownManager();
    const onceSpy = vi.spyOn(process, "once");

    manager.registerSignals();

    expect(onceSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(onceSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));

    onceSpy.mockRestore();
  });

  it("allows handlers to be registered after signal registration", async () => {
    const manager = new ShutdownManager();
    manager.registerSignals();

    const handler = vi.fn().mockResolvedValue(undefined);
    manager.onShutdown(handler);

    await manager.shutdown();

    expect(handler).toHaveBeenCalledOnce();
  });
});
