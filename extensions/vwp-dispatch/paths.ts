import { homedir } from "node:os";
import { join } from "node:path";

function resolveDefaultVwpBaseDir(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();
  return join(stateDir || join(homedir(), ".openclaw"), "vwp");
}

let vwpBaseDir = resolveDefaultVwpBaseDir();

export function setVwpBaseDir(baseDir: string): void {
  const trimmed = baseDir.trim();
  if (trimmed) {
    vwpBaseDir = trimmed;
  }
}

export function getVwpBaseDir(): string {
  return vwpBaseDir;
}

export function resolveVwpPath(...segments: string[]): string {
  return join(vwpBaseDir, ...segments);
}

export function getVwpTasksDir(): string {
  return resolveVwpPath("tasks");
}
