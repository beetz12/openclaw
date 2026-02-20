import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { assignTeamMembers, type AssignedDecomposition } from "./analyzer.ts";
import type { TeamConfig } from "./team-types.ts";
import type { TaskDecomposition } from "./types.ts";

const FIXTURE_DIR = join(import.meta.dirname!, ".test-analyzer-fixtures");
const TEAM_FILE = join(FIXTURE_DIR, "team.json");

const sampleTeamConfig: TeamConfig = {
  businessType: "consulting",
  businessName: "Acme Corp",
  members: [
    {
      id: "ceo",
      name: "CEO",
      role: "CEO / Strategy Lead",
      description: "Leads strategy",
      skills: ["strategy", "planning", "client-relations"],
      required: true,
      active: true,
    },
    {
      id: "pm",
      name: "Project Manager",
      role: "Project Manager",
      description: "Manages projects",
      skills: ["project-management", "coordination", "delivery"],
      required: true,
      active: true,
    },
    {
      id: "marketer",
      name: "Marketing Strategist",
      role: "Marketing Strategist",
      description: "Drives marketing",
      skills: ["marketing", "content", "lead-generation"],
      required: true,
      active: true,
    },
    {
      id: "dev",
      name: "Developer",
      role: "Developer",
      description: "Builds software",
      skills: ["development", "devops", "automation"],
      required: false,
      active: true,
    },
    {
      id: "analyst",
      name: "Data Analyst",
      role: "Data Analyst",
      description: "Analyzes data",
      skills: ["analytics", "reporting", "conversion"],
      required: false,
      active: false, // inactive
    },
  ],
  updatedAt: Date.now(),
};

describe("assignTeamMembers", () => {
  beforeEach(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
  });

  it("assigns team members based on skill overlap", async () => {
    await writeFile(TEAM_FILE, JSON.stringify(sampleTeamConfig));

    const decomposition: TaskDecomposition = {
      subtasks: [
        { description: "Create marketing campaign", domain: "marketing" },
        { description: "Coordinate delivery timeline", domain: "productivity" },
        { description: "Plan client engagement strategy", domain: "sales" },
      ],
      domains: ["marketing", "productivity", "sales"],
      estimatedComplexity: "medium",
    };

    const result = await assignTeamMembers(decomposition, TEAM_FILE);

    expect(result.subtasks).toHaveLength(3);

    // Marketing subtask -> marketer (has marketing, content, lead-generation)
    expect(result.subtasks[0].assignedTo).toBe("marketer");

    // Productivity subtask -> pm (has project-management, coordination, delivery)
    expect(result.subtasks[1].assignedTo).toBe("pm");

    // Sales subtask -> ceo (has strategy, client-relations)
    expect(result.subtasks[2].assignedTo).toBe("ceo");
  });

  it("skips inactive team members", async () => {
    await writeFile(TEAM_FILE, JSON.stringify(sampleTeamConfig));

    const decomposition: TaskDecomposition = {
      subtasks: [{ description: "Analyze conversion data", domain: "data" }],
      domains: ["data"],
      estimatedComplexity: "low",
    };

    const result = await assignTeamMembers(decomposition, TEAM_FILE);

    // analyst is inactive, so should not be assigned even though skills match
    // Instead it should fall through to whoever has next best overlap
    expect(result.subtasks[0].assignedTo).not.toBe("analyst");
  });

  it("sets suggestedRole when no team member matches", async () => {
    await writeFile(
      TEAM_FILE,
      JSON.stringify({
        ...sampleTeamConfig,
        members: [
          {
            id: "ceo",
            name: "CEO",
            role: "CEO",
            description: "Leads",
            skills: ["strategy"],
            required: true,
            active: true,
          },
        ],
      }),
    );

    const decomposition: TaskDecomposition = {
      subtasks: [{ description: "Review legal contract", domain: "legal" }],
      domains: ["legal"],
      estimatedComplexity: "low",
    };

    const result = await assignTeamMembers(decomposition, TEAM_FILE);

    expect(result.subtasks[0].assignedTo).toBeUndefined();
    expect(result.subtasks[0].suggestedRole).toEqual({
      name: "legal",
      description: "Specialist in legal",
    });
  });

  it("returns suggestedRole for all subtasks when no team config exists", async () => {
    const decomposition: TaskDecomposition = {
      subtasks: [
        { description: "Do marketing", domain: "marketing" },
        { description: "Manage project", domain: "productivity" },
      ],
      domains: ["marketing", "productivity"],
      estimatedComplexity: "low",
    };

    // No team file written — should gracefully handle missing file
    const result = await assignTeamMembers(decomposition, join(FIXTURE_DIR, "nonexistent.json"));

    expect(result.subtasks).toHaveLength(2);
    expect(result.subtasks[0].suggestedRole).toBeDefined();
    expect(result.subtasks[1].suggestedRole).toBeDefined();
    expect(result.subtasks[0].assignedTo).toBeUndefined();
    expect(result.subtasks[1].assignedTo).toBeUndefined();
  });

  it("preserves decomposition metadata", async () => {
    await writeFile(TEAM_FILE, JSON.stringify(sampleTeamConfig));

    const decomposition: TaskDecomposition = {
      subtasks: [{ description: "Test task", domain: "marketing" }],
      domains: ["marketing"],
      estimatedComplexity: "high",
    };

    const result = await assignTeamMembers(decomposition, TEAM_FILE);

    expect(result.domains).toEqual(["marketing"]);
    expect(result.estimatedComplexity).toBe("high");
  });

  it("handles empty team members list", async () => {
    await writeFile(
      TEAM_FILE,
      JSON.stringify({
        ...sampleTeamConfig,
        members: [],
      }),
    );

    const decomposition: TaskDecomposition = {
      subtasks: [{ description: "Something", domain: "marketing" }],
      domains: ["marketing"],
      estimatedComplexity: "low",
    };

    const result = await assignTeamMembers(decomposition, TEAM_FILE);

    expect(result.subtasks[0].suggestedRole).toBeDefined();
    expect(result.subtasks[0].assignedTo).toBeUndefined();
  });
});
