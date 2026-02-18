import * as net from "node:net";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Check if a port is currently accepting connections.
 */
export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

/**
 * Wait until a port is accepting connections.
 * Polls every 500ms. Throws after timeoutMs (default 30s).
 */
export async function waitForPort(
  port: number,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(port)) {return;}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Port ${port} did not become available within ${timeoutMs}ms`,
  );
}

/**
 * Kill whatever process is listening on the given port.
 * Cross-platform: uses lsof on macOS/Linux, netstat+taskkill on Windows.
 */
export async function killProcessOnPort(port: number): Promise<void> {
  try {
    if (process.platform === "win32") {
      // Windows: find PID with netstat, kill with taskkill
      const { stdout } = await execAsync(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
      );
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          await execAsync(`taskkill /PID ${pid} /F`).catch(() => {});
        }
      }
    } else {
      // macOS/Linux
      await execAsync(`lsof -ti:${port} | xargs kill -9`).catch(() => {});
    }
    // Wait briefly for port to be released
    await new Promise((r) => setTimeout(r, 1000));
  } catch {
    // Best effort -- port may not have a process
  }
}
