import { describe, it, expect } from "vitest";
import { getDefaultTeam } from "./team-templates.ts";
import { TeamMemberSchema } from "./team-types.ts";

describe("getDefaultTeam", () => {
  describe("consulting team", () => {
    const team = getDefaultTeam("consulting");

    it("returns 6 members", () => {
      expect(team).toHaveLength(6);
    });

    it("includes required CEO", () => {
      const ceo = team.find((m) => m.id === "ceo");
      expect(ceo).toBeDefined();
      expect(ceo!.required).toBe(true);
      expect(ceo!.skills).toContain("strategy");
    });

    it("includes required project manager", () => {
      const pm = team.find((m) => m.id === "project-manager");
      expect(pm).toBeDefined();
      expect(pm!.required).toBe(true);
      expect(pm!.skills).toContain("project-management");
    });

    it("includes required marketing strategist", () => {
      const ms = team.find((m) => m.id === "marketing-strategist");
      expect(ms).toBeDefined();
      expect(ms!.required).toBe(true);
      expect(ms!.skills).toContain("marketing");
    });

    it("includes optional solution architect", () => {
      const sa = team.find((m) => m.id === "solution-architect");
      expect(sa).toBeDefined();
      expect(sa!.required).toBe(false);
    });

    it("includes optional developer", () => {
      const dev = team.find((m) => m.id === "developer");
      expect(dev).toBeDefined();
      expect(dev!.required).toBe(false);
      expect(dev!.skills).toContain("development");
    });

    it("includes optional business analyst", () => {
      const ba = team.find((m) => m.id === "business-analyst");
      expect(ba).toBeDefined();
      expect(ba!.required).toBe(false);
    });

    it("all members are active", () => {
      expect(team.every((m) => m.active)).toBe(true);
    });

    it("all members have descriptions", () => {
      expect(team.every((m) => m.description.length > 0)).toBe(true);
    });

    it("all members validate against schema", () => {
      for (const member of team) {
        const result = TeamMemberSchema.safeParse(member);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("ecommerce team", () => {
    const team = getDefaultTeam("ecommerce");

    it("returns 6 members", () => {
      expect(team).toHaveLength(6);
    });

    it("includes required CEO", () => {
      const ceo = team.find((m) => m.id === "ceo");
      expect(ceo).toBeDefined();
      expect(ceo!.required).toBe(true);
      expect(ceo!.skills).toContain("vendor-management");
    });

    it("includes required marketing manager", () => {
      const mm = team.find((m) => m.id === "marketing-manager");
      expect(mm).toBeDefined();
      expect(mm!.required).toBe(true);
      expect(mm!.skills).toContain("seo");
    });

    it("includes required product manager", () => {
      const pm = team.find((m) => m.id === "product-manager");
      expect(pm).toBeDefined();
      expect(pm!.required).toBe(true);
      expect(pm!.skills).toContain("catalog");
    });

    it("includes required customer support", () => {
      const cs = team.find((m) => m.id === "customer-support");
      expect(cs).toBeDefined();
      expect(cs!.required).toBe(true);
      expect(cs!.skills).toContain("customer-service");
    });

    it("includes optional content creator", () => {
      const cc = team.find((m) => m.id === "content-creator");
      expect(cc).toBeDefined();
      expect(cc!.required).toBe(false);
    });

    it("includes optional data analyst", () => {
      const da = team.find((m) => m.id === "data-analyst");
      expect(da).toBeDefined();
      expect(da!.required).toBe(false);
    });

    it("all members validate against schema", () => {
      for (const member of team) {
        const result = TeamMemberSchema.safeParse(member);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("custom team", () => {
    const team = getDefaultTeam("custom");

    it("returns exactly 1 member (CEO only)", () => {
      expect(team).toHaveLength(1);
    });

    it("the single member is the CEO", () => {
      const ceo = team.find((m) => m.id === "ceo");
      expect(ceo).toBeDefined();
      expect(ceo!.required).toBe(true);
      expect(ceo!.active).toBe(true);
    });

    it("CEO has management-related skills", () => {
      const ceo = team[0];
      expect(ceo.skills).toContain("strategy");
    });

    it("CEO member validates against schema", () => {
      for (const member of team) {
        const result = TeamMemberSchema.safeParse(member);
        expect(result.success).toBe(true);
      }
    });
  });

  it("returns independent copies (no shared references)", () => {
    const team1 = getDefaultTeam("consulting");
    const team2 = getDefaultTeam("consulting");
    team1[0].name = "Modified";
    expect(team2[0].name).not.toBe("Modified");
  });
});
