import { readdir, readFile, stat, watch } from "node:fs/promises";
import { join, resolve, basename, dirname } from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

/** Parsed SKILL.md frontmatter */
export type SkillFrontmatter = {
  name: string;
  description: string;
  [key: string]: unknown;
};

/** MCP server entry from .mcp.json */
export type McpServerEntry = {
  type: string;
  url: string;
};

/** Plugin manifest from .claude-plugin/plugin.json */
export type PluginManifest = {
  name: string;
  version: string;
  description: string;
  author?: { name: string };
};

/** Indexed skill entry */
export type SkillEntry = {
  pluginName: string;
  skillName: string;
  label: string;
  description: string;
  skillPath: string;
  frontmatter: SkillFrontmatter;
  mcpIntegrations: Record<string, McpServerEntry>;
};

/** Plugin-level index entry */
export type PluginEntry = {
  name: string;
  description: string;
  version: string;
  skills: Map<string, SkillEntry>;
  mcpIntegrations: Record<string, McpServerEntry>;
};

// ── Frontmatter parser ──────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * Only extracts simple key: value pairs (no nested YAML).
 */
export function parseFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const block = match[1];
  const result: Record<string, string> = {};

  for (const line of block.split("\n")) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (kv) {
      result[kv[1]] = kv[2].trim();
    }
  }

  if (!result.name || !result.description) return null;
  return result as SkillFrontmatter;
}

/**
 * Generate a user-facing label from plugin + skill names.
 * "customer-support" / "ticket-triage" -> "Customer Support: Ticket Triage"
 */
function toLabel(pluginName: string, skillName: string): string {
  const humanize = (s: string) =>
    s
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  return `${humanize(pluginName)}: ${humanize(skillName)}`;
}

// ── SkillRegistry ───────────────────────────────────────────────────────────

export class SkillRegistry {
  private pluginsPath: string;
  private plugins = new Map<string, PluginEntry>();
  private scanned = false;
  private abortController: AbortController | null = null;

  constructor(pluginsPath?: string) {
    this.pluginsPath = resolve(
      pluginsPath ?? process.env.VWP_KNOWLEDGE_PLUGINS_PATH ?? "./knowledge-work-plugins",
    );
  }

  /** Scan the plugins directory and build the in-memory index. */
  async scan(): Promise<void> {
    const newIndex = new Map<string, PluginEntry>();
    let entries: string[];

    try {
      entries = await readdir(this.pluginsPath);
    } catch (err) {
      console.warn(`[skill-registry] Cannot read plugins directory: ${this.pluginsPath}`, err);
      this.plugins = newIndex;
      this.scanned = true;
      return;
    }

    for (const entry of entries) {
      const pluginDir = join(this.pluginsPath, entry);
      try {
        const s = await stat(pluginDir);
        if (!s.isDirectory()) continue;
      } catch {
        continue;
      }

      try {
        const pluginEntry = await this.indexPlugin(pluginDir, entry);
        if (pluginEntry) {
          newIndex.set(entry, pluginEntry);
        }
      } catch (err) {
        console.warn(`[skill-registry] Skipping plugin "${entry}": ${String(err)}`);
      }
    }

    this.plugins = newIndex;
    this.scanned = true;
  }

  /** Start watching the plugins directory for changes and auto-rescan. */
  watchForChanges(): void {
    this.stopWatching();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    (async () => {
      try {
        const watcher = watch(this.pluginsPath, {
          recursive: true,
          signal,
        });
        for await (const _event of watcher) {
          // Debounce: wait a bit then rescan
          await new Promise((r) => setTimeout(r, 500));
          await this.scan();
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn(`[skill-registry] Watch error:`, err);
      }
    })();
  }

  /** Stop watching for directory changes. */
  stopWatching(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /** Get a specific skill by plugin name and skill name. */
  getSkill(pluginName: string, skillName: string): SkillEntry | undefined {
    return this.plugins.get(pluginName)?.skills.get(skillName);
  }

  /** Get all skills across all plugins. */
  getAllSkills(): SkillEntry[] {
    const result: SkillEntry[] = [];
    for (const plugin of this.plugins.values()) {
      for (const skill of plugin.skills.values()) {
        result.push(skill);
      }
    }
    return result;
  }

  /** Get skills filtered by plugin domain (plugin name). */
  getSkillsByDomain(domain: string): SkillEntry[] {
    const plugin = this.plugins.get(domain);
    if (!plugin) return [];
    return Array.from(plugin.skills.values());
  }

  /** Get all indexed plugins. */
  getPlugins(): Map<string, PluginEntry> {
    return this.plugins;
  }

  /** Whether scan() has been called at least once. */
  get isScanned(): boolean {
    return this.scanned;
  }

  /**
   * Get a short summary for a skill (label + truncated description).
   * Useful for building context within token budgets.
   */
  getSkillSummary(pluginName: string, skillName: string): string | undefined {
    const skill = this.getSkill(pluginName, skillName);
    if (!skill) return undefined;

    const desc =
      skill.description.length > 200 ? skill.description.slice(0, 200) + "..." : skill.description;

    const mcpKeys = Object.keys(skill.mcpIntegrations);
    const mcpLine = mcpKeys.length > 0 ? `\nIntegrations: ${mcpKeys.join(", ")}` : "";

    return `${skill.label}\n${desc}${mcpLine}`;
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private async indexPlugin(pluginDir: string, dirName: string): Promise<PluginEntry | null> {
    // Read plugin manifest
    const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
    let manifest: PluginManifest;
    try {
      const raw = await readFile(manifestPath, "utf-8");
      manifest = JSON.parse(raw) as PluginManifest;
    } catch {
      console.warn(`[skill-registry] No valid plugin.json for "${dirName}", skipping`);
      return null;
    }

    // Read MCP integrations
    let mcpIntegrations: Record<string, McpServerEntry> = {};
    try {
      const mcpRaw = await readFile(join(pluginDir, ".mcp.json"), "utf-8");
      const mcpData = JSON.parse(mcpRaw) as {
        mcpServers?: Record<string, McpServerEntry>;
      };
      if (mcpData.mcpServers) {
        mcpIntegrations = mcpData.mcpServers;
      }
    } catch {
      // No .mcp.json is fine — plugin may not need MCP integrations
    }

    // Scan skills directory
    const skillsDir = join(pluginDir, "skills");
    const skills = new Map<string, SkillEntry>();

    try {
      const skillDirs = await readdir(skillsDir);
      for (const skillDirName of skillDirs) {
        const skillDir = join(skillsDir, skillDirName);
        try {
          const s = await stat(skillDir);
          if (!s.isDirectory()) continue;
        } catch {
          continue;
        }

        const skillEntry = await this.indexSkill(
          skillDir,
          manifest.name,
          skillDirName,
          mcpIntegrations,
        );
        if (skillEntry) {
          skills.set(skillDirName, skillEntry);
        }
      }
    } catch {
      // No skills directory — plugin may only have commands
    }

    return {
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      skills,
      mcpIntegrations,
    };
  }

  private async indexSkill(
    skillDir: string,
    pluginName: string,
    skillDirName: string,
    mcpIntegrations: Record<string, McpServerEntry>,
  ): Promise<SkillEntry | null> {
    const skillMdPath = join(skillDir, "SKILL.md");
    let content: string;
    try {
      content = await readFile(skillMdPath, "utf-8");
    } catch {
      console.warn(
        `[skill-registry] No SKILL.md in "${pluginName}/skills/${skillDirName}", skipping`,
      );
      return null;
    }

    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      console.warn(
        `[skill-registry] Invalid frontmatter in "${pluginName}/skills/${skillDirName}/SKILL.md", skipping`,
      );
      return null;
    }

    return {
      pluginName,
      skillName: frontmatter.name,
      label: toLabel(pluginName, frontmatter.name),
      description: frontmatter.description,
      skillPath: skillDir,
      frontmatter,
      mcpIntegrations,
    };
  }
}
