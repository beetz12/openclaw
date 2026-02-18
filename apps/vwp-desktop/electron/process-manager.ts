import { spawn, type ChildProcess } from "node:child_process";

interface ManagedProcess {
  name: string;
  process: ChildProcess;
  port: number;
  cwd: string;
  command: string;
  args: string[];
  restartCount: number;
}

const MAX_RESTARTS = 3;
const RESTART_DELAYS = [1000, 2000, 4000]; // exponential backoff

const managed: ManagedProcess[] = [];
let crashCallback: ((name: string, code: number) => void) | null = null;
let shuttingDown = false;

function createProcess(
  name: string,
  command: string,
  args: string[],
  cwd: string,
  _port: number,
): ChildProcess {
  const isWin = process.platform === "win32";
  const child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWin,
    env: { ...process.env },
  });

  child.stdout?.on("data", (data: Buffer) => {
    console.log(`[${name}] ${data.toString().trim()}`);
  });
  child.stderr?.on("data", (data: Buffer) => {
    console.error(`[${name}] ${data.toString().trim()}`);
  });

  return child;
}

function monitorProcess(entry: ManagedProcess): void {
  entry.process.on("exit", (code, signal) => {
    if (shuttingDown) {return;}

    console.log(`[${entry.name}] exited with code=${code} signal=${signal}`);

    if (code !== 0 && code !== null) {
      crashCallback?.(entry.name, code);

      // Auto-restart with backoff
      if (entry.restartCount < MAX_RESTARTS) {
        const delay = RESTART_DELAYS[entry.restartCount] ?? 4000;
        entry.restartCount++;
        console.log(
          `[${entry.name}] restarting in ${delay}ms (attempt ${entry.restartCount}/${MAX_RESTARTS})`,
        );

        setTimeout(() => {
          if (shuttingDown) {return;}
          const newChild = createProcess(
            entry.name,
            entry.command,
            entry.args,
            entry.cwd,
            entry.port,
          );
          entry.process = newChild;
          monitorProcess(entry);
        }, delay);
      } else {
        console.error(
          `[${entry.name}] max restarts (${MAX_RESTARTS}) exceeded`,
        );
      }
    }
  });
}

export function spawnGateway(cwd: string): ChildProcess {
  const name = "gateway";
  const command = "pnpm";
  const args = ["vwp:start"];
  const child = createProcess(name, command, args, cwd, 19001);

  const entry: ManagedProcess = {
    name,
    process: child,
    port: 19001,
    cwd,
    command,
    args,
    restartCount: 0,
  };
  managed.push(entry);
  monitorProcess(entry);

  console.log(`[${name}] spawned (pid=${child.pid})`);
  return child;
}

export function spawnNextServer(cwd: string): ChildProcess {
  const name = "next-server";
  const command = "pnpm";
  const args = ["--filter", "vwp-board", "start"];
  const child = createProcess(name, command, args, cwd, 3000);

  const entry: ManagedProcess = {
    name,
    process: child,
    port: 3000,
    cwd,
    command,
    args,
    restartCount: 0,
  };
  managed.push(entry);
  monitorProcess(entry);

  console.log(`[${name}] spawned (pid=${child.pid})`);
  return child;
}

export function onProcessCrash(
  callback: (name: string, code: number) => void,
): void {
  crashCallback = callback;
}

export async function shutdownAll(): Promise<void> {
  shuttingDown = true;

  const killPromises = managed.map((entry) => {
    return new Promise<void>((resolve) => {
      if (!entry.process.pid || entry.process.killed) {
        resolve();
        return;
      }

      // Send SIGTERM first
      entry.process.kill("SIGTERM");

      // Force kill after 5 seconds
      const forceKillTimer = setTimeout(() => {
        try {
          entry.process.kill("SIGKILL");
        } catch {
          // Already dead
        }
        resolve();
      }, 5000);

      entry.process.on("exit", () => {
        clearTimeout(forceKillTimer);
        resolve();
      });
    });
  });

  await Promise.all(killPromises);
  managed.length = 0;
  console.log("[process-manager] all processes shut down");
}
