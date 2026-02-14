import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "./skill-registry.ts";

// ── Types ────────────────────────────────────────────────────────────────────

/** Business profile stored at ~/.openclaw/vwp/profile.json */
export type BusinessProfile = {
  businessName?: string;
  industry?: string;
  teamSize?: number;
  roles?: Record<string, RoleConfig>;
  [key: string]: unknown;
};

/** Per-role configuration within the profile */
export type RoleConfig = {
  allowedDomains?: string[];
  documentAccess?: string[];
  contextBudget?: number;
  [key: string]: unknown;
};

/** Scoped context returned for a specific role */
export type BusinessContext = {
  profile: BusinessProfile;
  role: string;
  allowedDomains: string[];
  documentAccess: string[];
  contextBudget: number;
};

// ── Default profile path ────────────────────────────────────────────────────

const DEFAULT_PROFILE_PATH = join(homedir(), ".openclaw", "vwp", "profile.json");
const DEFAULT_CONTEXT_BUDGET = 2000;

// ── Profile loading ─────────────────────────────────────────────────────────

/**
 * Load the business profile from ~/.openclaw/vwp/profile.json.
 * Returns an empty profile if the file doesn't exist.
 */
export async function loadProfile(profilePath?: string): Promise<BusinessProfile> {
  const path = profilePath ?? DEFAULT_PROFILE_PATH;
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as BusinessProfile;
  } catch {
    return {};
  }
}

/**
 * Load business context scoped to a specific teammate role.
 * Applies document access restrictions and domain filtering from the profile.
 */
export async function loadBusinessContext(
  role: string,
  profilePath?: string,
): Promise<BusinessContext> {
  const profile = await loadProfile(profilePath);
  const roleConfig = profile.roles?.[role];

  return {
    profile,
    role,
    allowedDomains: roleConfig?.allowedDomains ?? [],
    documentAccess: roleConfig?.documentAccess ?? [],
    contextBudget: roleConfig?.contextBudget ?? DEFAULT_CONTEXT_BUDGET,
  };
}

// ── Skill summary generation ────────────────────────────────────────────────

/**
 * Generate a concise skill summary from a SKILL.md file path.
 * Truncates to stay under maxTokens (rough char-based estimate: 1 token ~ 4 chars).
 */
export async function generateSkillSummary(skillPath: string, maxTokens = 2000): Promise<string> {
  const skillMdPath = join(skillPath, "SKILL.md");
  let content: string;

  try {
    content = await readFile(skillMdPath, "utf-8");
  } catch {
    return "";
  }

  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) return "";

  // Remove frontmatter block from content
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();

  // Build summary: name + description + truncated body
  const header = `# ${frontmatter.name}\n${frontmatter.description}\n\n`;
  const charBudget = maxTokens * 4 - header.length;

  if (charBudget <= 0) {
    return header.trim();
  }

  const truncatedBody = body.length > charBudget ? body.slice(0, charBudget) + "\n..." : body;

  return `${header}${truncatedBody}`;
}
