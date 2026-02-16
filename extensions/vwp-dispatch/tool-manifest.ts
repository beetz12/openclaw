/**
 * Tool manifest loading, validation, and discovery.
 *
 * Each workspace tool lives in tools/<suite>/ and has one or more
 * tool-<name>.json manifest files describing how to run it.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";

// ---------- Types ----------

export interface ArgSchema {
  type: "string" | "enum" | "boolean";
  values?: string[];
  required?: boolean;
  label: string;
}

export interface ToolManifest {
  name: string;
  label: string;
  description: string;
  category: string;
  entrypoint: string;
  runtime: "python3" | "node";
  args_schema: Record<string, ArgSchema>;
  env_allowlist: string[];
  outputs: string[];
  timeout_seconds: number;
  max_output_bytes: number;
}

export interface LoadedTool {
  manifest: ToolManifest;
  /** Absolute path to the tool directory. */
  toolDir: string;
  /** Absolute path to the manifest file. */
  manifestPath: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------- Validation ----------

const SUPPORTED_RUNTIMES = new Set(["python3", "node"]);

const REQUIRED_FIELDS: Array<keyof ToolManifest> = [
  "name",
  "label",
  "description",
  "category",
  "entrypoint",
  "runtime",
  "args_schema",
  "env_allowlist",
  "outputs",
  "timeout_seconds",
  "max_output_bytes",
];

function containsTraversal(p: string): boolean {
  const normalized = normalize(p);
  return normalized.startsWith("..") || normalized.includes("/..");
}

export function validateManifest(raw: Record<string, unknown>, toolDir: string): ValidationResult {
  const errors: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (typeof raw.runtime === "string" && !SUPPORTED_RUNTIMES.has(raw.runtime)) {
    errors.push(
      `unsupported runtime "${raw.runtime}" — must be one of: ${[...SUPPORTED_RUNTIMES].join(", ")}`,
    );
  }

  if (typeof raw.entrypoint === "string" && containsTraversal(raw.entrypoint)) {
    errors.push("entrypoint must not contain path traversal");
  }

  if (Array.isArray(raw.outputs)) {
    for (const output of raw.outputs) {
      if (typeof output === "string" && containsTraversal(output)) {
        errors.push(`output path "${output}" must not contain path traversal`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------- Loading ----------

export async function loadToolManifest(manifestPath: string): Promise<LoadedTool | null> {
  try {
    const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
    const toolDir = join(manifestPath, "..");
    const result = validateManifest(raw, toolDir);
    if (!result.valid) {
      return null;
    }
    return {
      manifest: raw as ToolManifest,
      toolDir: resolve(toolDir),
      manifestPath: resolve(manifestPath),
    };
  } catch {
    return null;
  }
}

// ---------- Discovery ----------

/**
 * Scan a tools root directory for tool manifests.
 * Expects structure: toolsRoot/<suite>/tool-<name>.json
 */
export async function discoverTools(toolsRoot: string): Promise<LoadedTool[]> {
  const tools: LoadedTool[] = [];

  let suites: string[];
  try {
    suites = await readdir(toolsRoot);
  } catch {
    return tools;
  }

  for (const suite of suites) {
    const suiteDir = join(toolsRoot, suite);
    try {
      const s = await stat(suiteDir);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    let files: string[];
    try {
      files = await readdir(suiteDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.startsWith("tool-") || !file.endsWith(".json")) continue;
      const loaded = await loadToolManifest(join(suiteDir, file));
      if (loaded) {
        tools.push(loaded);
      }
    }
  }

  return tools;
}
