/**
 * Graceful shutdown manager — runs cleanup handlers on SIGTERM/SIGINT.
 */

type CleanupFn = () => Promise<void>;

export class ShutdownManager {
  private handlers: CleanupFn[] = [];
  private shutdownCalled = false;

  onShutdown(fn: CleanupFn): void {
    this.handlers.push(fn);
  }

  async shutdown(): Promise<void> {
    if (this.shutdownCalled) return;
    this.shutdownCalled = true;
    for (const handler of this.handlers) {
      try {
        await handler();
      } catch (err) {
        console.error("[vwp-shutdown] Cleanup handler failed:", err);
      }
    }
  }

  registerSignals(): void {
    const onSignal = () => {
      void this.shutdown();
    };
    process.once("SIGTERM", onSignal);
    process.once("SIGINT", onSignal);
  }
}
