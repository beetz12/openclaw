import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { loadProfile, loadBusinessContext, generateSkillSummary } from "./context-loader.ts";
import { SkillRegistry, parseFrontmatter } from "./skill-registry.ts";

// ── parseFrontmatter ────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("parses valid YAML frontmatter", () => {
    const content = `---
name: ticket-triage
description: Triage incoming support tickets by categorizing issues
---

# Ticket Triage Skill`;

    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("ticket-triage");
    expect(result!.description).toBe("Triage incoming support tickets by categorizing issues");
  });

  it("returns null for missing frontmatter", () => {
    const content = "# No frontmatter here\nJust markdown.";
    expect(parseFrontmatter(content)).toBeNull();
  });

  it("returns null when name is missing", () => {
    const content = `---
description: Only description
---
Body`;
    expect(parseFrontmatter(content)).toBeNull();
  });

  it("returns null when description is missing", () => {
    const content = `---
name: only-name
---
Body`;
    expect(parseFrontmatter(content)).toBeNull();
  });

  it("handles extra frontmatter fields", () => {
    const content = `---
name: my-skill
description: A skill
domain: finance
---
Body`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.domain).toBe("finance");
  });
});

// ── SkillRegistry with fixtures ─────────────────────────────────────────────

const FIXTURE_DIR = join(import.meta.dirname!, ".test-fixtures");

async function createFixturePlugin(
  name: string,
  opts: {
    manifest?: Record<string, unknown>;
    mcp?: Record<string, unknown>;
    skills?: Record<string, string>;
  } = {},
) {
  const pluginDir = join(FIXTURE_DIR, name);

  // plugin.json
  const manifest = opts.manifest ?? {
    name,
    version: "1.0.0",
    description: `Test plugin: ${name}`,
  };
  await mkdir(join(pluginDir, ".claude-plugin"), { recursive: true });
  await writeFile(join(pluginDir, ".claude-plugin", "plugin.json"), JSON.stringify(manifest));

  // .mcp.json
  if (opts.mcp) {
    await writeFile(join(pluginDir, ".mcp.json"), JSON.stringify({ mcpServers: opts.mcp }));
  }

  // skills
  if (opts.skills) {
    for (const [skillName, body] of Object.entries(opts.skills)) {
      const skillDir = join(pluginDir, "skills", skillName);
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), body);
    }
  }
}

describe("SkillRegistry", () => {
  beforeAll(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
  });

  it("scans plugins and indexes skills", async () => {
    await createFixturePlugin("test-plugin", {
      mcp: {
        slack: { type: "http", url: "https://mcp.slack.com/mcp" },
      },
      skills: {
        "my-skill": `---
name: my-skill
description: A test skill for doing things
---
# My Skill
Body content here.`,
      },
    });

    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();

    expect(registry.isScanned).toBe(true);
    const all = registry.getAllSkills();
    expect(all).toHaveLength(1);
    expect(all[0].pluginName).toBe("test-plugin");
    expect(all[0].skillName).toBe("my-skill");
    expect(all[0].label).toBe("Test Plugin: My Skill");
    expect(all[0].mcpIntegrations).toHaveProperty("slack");
  });

  it("getSkill returns a specific skill", async () => {
    await createFixturePlugin("finance", {
      skills: {
        "journal-entry": `---
name: journal-entry
description: Prepare journal entries
---
# JE`,
      },
    });

    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();

    const skill = registry.getSkill("finance", "journal-entry");
    expect(skill).toBeDefined();
    expect(skill!.skillName).toBe("journal-entry");
  });

  it("getSkill returns undefined for unknown skill", async () => {
    await createFixturePlugin("finance", { skills: {} });

    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();
    expect(registry.getSkill("finance", "nope")).toBeUndefined();
    expect(registry.getSkill("nope", "nope")).toBeUndefined();
  });

  it("getSkillsByDomain returns skills for a plugin", async () => {
    await createFixturePlugin("sales", {
      skills: {
        "call-prep": `---
name: call-prep
description: Prepare for calls
---
# Call Prep`,
        outreach: `---
name: outreach
description: Draft outreach
---
# Outreach`,
      },
    });

    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();

    const skills = registry.getSkillsByDomain("sales");
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.skillName).sort()).toEqual(["call-prep", "outreach"]);
  });

  it("getSkillsByDomain returns empty for unknown domain", async () => {
    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();
    expect(registry.getSkillsByDomain("nonexistent")).toEqual([]);
  });

  it("getSkillSummary returns formatted summary", async () => {
    await createFixturePlugin("support", {
      mcp: {
        intercom: { type: "http", url: "https://mcp.intercom.com/mcp" },
      },
      skills: {
        triage: `---
name: triage
description: Triage tickets by priority
---
# Triage
Details here.`,
      },
    });

    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();

    const summary = registry.getSkillSummary("support", "triage");
    expect(summary).toBeDefined();
    expect(summary).toContain("Support: Triage");
    expect(summary).toContain("Triage tickets by priority");
    expect(summary).toContain("intercom");
  });

  it("getSkillSummary returns undefined for missing skill", async () => {
    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();
    expect(registry.getSkillSummary("x", "y")).toBeUndefined();
  });

  it("skips plugins without plugin.json", async () => {
    // Create a directory without .claude-plugin/plugin.json
    await mkdir(join(FIXTURE_DIR, "bad-plugin", "skills"), {
      recursive: true,
    });

    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();
    expect(registry.getAllSkills()).toHaveLength(0);
  });

  it("skips skills with invalid frontmatter", async () => {
    await createFixturePlugin("test", {
      skills: {
        "bad-skill": "# No frontmatter\nJust body.",
        "good-skill": `---
name: good-skill
description: Valid skill
---
# Good`,
      },
    });

    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();

    const all = registry.getAllSkills();
    expect(all).toHaveLength(1);
    expect(all[0].skillName).toBe("good-skill");
  });

  it("handles empty plugins directory gracefully", async () => {
    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();
    expect(registry.getAllSkills()).toEqual([]);
    expect(registry.isScanned).toBe(true);
  });

  it("handles nonexistent plugins directory gracefully", async () => {
    const registry = new SkillRegistry("/tmp/nonexistent-dir-xyz");
    await registry.scan();
    expect(registry.getAllSkills()).toEqual([]);
    expect(registry.isScanned).toBe(true);
  });

  it("rescan replaces the old index", async () => {
    await createFixturePlugin("p1", {
      skills: {
        s1: `---
name: s1
description: First
---
# S1`,
      },
    });

    const registry = new SkillRegistry(FIXTURE_DIR);
    await registry.scan();
    expect(registry.getAllSkills()).toHaveLength(1);

    // Add a second plugin and rescan
    await createFixturePlugin("p2", {
      skills: {
        s2: `---
name: s2
description: Second
---
# S2`,
      },
    });
    await registry.scan();
    expect(registry.getAllSkills()).toHaveLength(2);
  });
});

// ── Context loader tests ────────────────────────────────────────────────────

const PROFILE_FIXTURE = join(FIXTURE_DIR, "profile.json");

describe("loadProfile", () => {
  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
  });

  it("loads a valid profile", async () => {
    const profile = {
      businessName: "Acme Corp",
      industry: "tech",
      roles: {
        analyst: {
          allowedDomains: ["data", "finance"],
          documentAccess: ["reports/*"],
        },
      },
    };
    await writeFile(PROFILE_FIXTURE, JSON.stringify(profile));

    const result = await loadProfile(PROFILE_FIXTURE);
    expect(result.businessName).toBe("Acme Corp");
    expect(result.roles?.analyst?.allowedDomains).toEqual(["data", "finance"]);
  });

  it("returns empty profile for missing file", async () => {
    const result = await loadProfile("/tmp/no-such-profile.json");
    expect(result).toEqual({});
  });
});

describe("loadBusinessContext", () => {
  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
  });

  it("scopes context to a specific role", async () => {
    const profile = {
      businessName: "Test Inc",
      roles: {
        support: {
          allowedDomains: ["customer-support"],
          documentAccess: ["tickets/*"],
          contextBudget: 1500,
        },
        admin: {
          allowedDomains: ["*"],
          documentAccess: ["*"],
        },
      },
    };
    await writeFile(PROFILE_FIXTURE, JSON.stringify(profile));

    const ctx = await loadBusinessContext("support", PROFILE_FIXTURE);
    expect(ctx.role).toBe("support");
    expect(ctx.allowedDomains).toEqual(["customer-support"]);
    expect(ctx.documentAccess).toEqual(["tickets/*"]);
    expect(ctx.contextBudget).toBe(1500);
  });

  it("returns defaults for unknown role", async () => {
    await writeFile(PROFILE_FIXTURE, JSON.stringify({}));

    const ctx = await loadBusinessContext("unknown", PROFILE_FIXTURE);
    expect(ctx.allowedDomains).toEqual([]);
    expect(ctx.documentAccess).toEqual([]);
    expect(ctx.contextBudget).toBe(2000);
  });
});

describe("generateSkillSummary", () => {
  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
  });

  it("generates a summary from a SKILL.md", async () => {
    const skillDir = join(FIXTURE_DIR, "test-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: test-skill
description: A skill for testing
---

# Test Skill

This is the body of the skill with details about how it works.`,
    );

    const summary = await generateSkillSummary(skillDir);
    expect(summary).toContain("# test-skill");
    expect(summary).toContain("A skill for testing");
    expect(summary).toContain("This is the body");
  });

  it("truncates long content", async () => {
    const skillDir = join(FIXTURE_DIR, "long-skill");
    await mkdir(skillDir, { recursive: true });

    const longBody = "x".repeat(20000);
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: long-skill
description: A very long skill
---

${longBody}`,
    );

    const summary = await generateSkillSummary(skillDir, 100);
    // 100 tokens * 4 chars = 400 chars budget total
    expect(summary.length).toBeLessThan(500);
    expect(summary).toContain("...");
  });

  it("returns empty string for missing SKILL.md", async () => {
    const summary = await generateSkillSummary("/tmp/no-skill-here");
    expect(summary).toBe("");
  });
});
