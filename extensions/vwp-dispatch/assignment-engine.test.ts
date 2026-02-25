import { describe, expect, it } from "vitest";
import { pickBestAgent, scoreAgent, type WorkforceAgent } from "./assignment-engine.js";

const agents: WorkforceAgent[] = [
  {
    id: "eng-1",
    name: "Engineer",
    role: "Engineering",
    skills: ["typescript", "api", "testing"],
    active: true,
  },
  {
    id: "mkt-1",
    name: "Marketing",
    role: "Marketing",
    skills: ["copywriting", "linkedin", "seo"],
    active: true,
  },
  {
    id: "ops-1",
    name: "Ops",
    role: "Operations",
    skills: ["automation", "project-management"],
    active: true,
  },
];

describe("assignment engine", () => {
  it("scores role + skills deterministically", () => {
    const s = scoreAgent(agents[1]!, {
      roleHint: "marketing",
      requiredSkills: ["seo", "linkedin"],
    });
    expect(s.score).toBeGreaterThan(5);
  });

  it("chooses best agent by score", () => {
    const d = pickBestAgent(agents, { roleHint: "marketing", requiredSkills: ["seo"] });
    expect(d.assignedAgentId).toBe("mkt-1");
    expect(d.assignmentMode).toBe("auto");
  });

  it("preserves manual-lock assignment", () => {
    const d = pickBestAgent(agents, {
      manualLock: true,
      existing: {
        assignedAgentId: "eng-1",
        assignedRole: "Engineering",
        requiredSkills: ["typescript"],
        assignmentMode: "manual-lock",
        assignmentReason: "User override",
        executorAgentId: null,
        executionProfile: null,
      },
    });
    expect(d.assignedAgentId).toBe("eng-1");
    expect(d.assignmentMode).toBe("manual-lock");
  });

  it("uses deterministic tie-break by id", () => {
    const tieAgents: WorkforceAgent[] = [
      { id: "b", name: "B", role: "General", skills: [], active: true },
      { id: "a", name: "A", role: "General", skills: [], active: true },
    ];
    const d = pickBestAgent(tieAgents, {});
    expect(d.assignedAgentId).toBe("a");
  });
});
