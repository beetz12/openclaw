/** Lightweight CLI binary health check using --version. */

import { runCommandWithTimeout } from "./upstream-imports.js";

export interface CliHealthResult {
  available: boolean;
  version?: string;
  error?: string;
}

/**
 * Check if the CLI binary is available and responsive.
 * Uses `which` + `<command> --version` — fast, no auth required.
 */
export async function checkCliHealth(command: string): Promise<CliHealthResult> {
  try {
    // Check if binary exists on PATH
    const whichResult = await runCommandWithTimeout(["which", command], {
      timeoutMs: 5_000,
      cwd: process.cwd(),
    });

    if (whichResult.code !== 0) {
      return { available: false, error: `Binary not found: ${command}` };
    }

    // Verify it responds to --version
    const result = await runCommandWithTimeout([command, "--version"], {
      timeoutMs: 10_000,
      cwd: process.cwd(),
    });

    if (result.code === 0) {
      const version = result.stdout.trim().split("\n")[0] ?? "";
      return { available: true, version };
    }

    return {
      available: false,
      error: result.stderr.trim() || "Version check failed",
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
