import path from "node:path";
import { STATE_DIR } from "../config/paths.js";
import { resolveUserPath } from "../utils.js";

/**
 * Resolve a path for plugin use. Tilde and absolute paths behave identically
 * to resolveUserPath(). Relative paths resolve against STATE_DIR instead of
 * process.cwd(), ensuring deterministic results regardless of the working
 * directory when the process was launched.
 */
export function resolvePluginPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~") || path.isAbsolute(trimmed)) {
    return resolveUserPath(trimmed);
  }
  return path.resolve(STATE_DIR, trimmed);
}

/**
 * Resolve a per-plugin data directory under STATE_DIR.
 * Returns: STATE_DIR/plugins/{pluginId}/
 * The directory is NOT automatically created; callers should mkdir as needed.
 */
export function resolvePluginDataDir(pluginId: string): string {
  return path.join(STATE_DIR, "plugins", pluginId);
}
