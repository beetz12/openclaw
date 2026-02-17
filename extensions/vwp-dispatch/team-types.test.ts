import { describe, it, expect } from "vitest";
import { TeamMemberSchema, TeamConfigSchema, OnboardingPayloadSchema } from "./team-types.ts";

describe("TeamMemberSchema", () => {
  const validMember = {
    id: "ceo",
    name: "CEO",
    role: "CEO / Strategy Lead",
    description: "Leads strategy",
    skills: ["strategy", "planning"],
    required: true,
    active: true,
  };

  it("accepts a valid member", () => {
    const result = TeamMemberSchema.safeParse(validMember);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("ceo");
      expect(result.data.skills).toEqual(["strategy", "planning"]);
    }
  });

  it("rejects member without id", () => {
    const { id, ...noId } = validMember;
    const result = TeamMemberSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it("rejects member without name", () => {
    const { name, ...noName } = validMember;
    const result = TeamMemberSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it("rejects member with non-array skills", () => {
    const result = TeamMemberSchema.safeParse({ ...validMember, skills: "strategy" });
    expect(result.success).toBe(false);
  });

  it("rejects member with non-boolean required", () => {
    const result = TeamMemberSchema.safeParse({ ...validMember, required: "yes" });
    expect(result.success).toBe(false);
  });

  it("accepts member with empty skills array", () => {
    const result = TeamMemberSchema.safeParse({ ...validMember, skills: [] });
    expect(result.success).toBe(true);
  });
});

describe("TeamConfigSchema", () => {
  const validConfig = {
    businessType: "consulting",
    businessName: "Acme Corp",
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
    updatedAt: Date.now(),
  };

  it("accepts a valid config", () => {
    const result = TeamConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("accepts ecommerce business type", () => {
    const result = TeamConfigSchema.safeParse({ ...validConfig, businessType: "ecommerce" });
    expect(result.success).toBe(true);
  });

  it("accepts custom business type", () => {
    const result = TeamConfigSchema.safeParse({ ...validConfig, businessType: "custom" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid business type", () => {
    const result = TeamConfigSchema.safeParse({ ...validConfig, businessType: "saas" });
    expect(result.success).toBe(false);
  });

  it("rejects config without members", () => {
    const { members, ...noMembers } = validConfig;
    const result = TeamConfigSchema.safeParse(noMembers);
    expect(result.success).toBe(false);
  });

  it("accepts config with empty members array", () => {
    const result = TeamConfigSchema.safeParse({ ...validConfig, members: [] });
    expect(result.success).toBe(true);
  });
});

describe("OnboardingPayloadSchema", () => {
  const validPayload = {
    businessType: "consulting",
    businessName: "Acme Corp",
    userName: "Alice",
    team: [
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
  };

  it("accepts a valid payload", () => {
    const result = OnboardingPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userName).toBe("Alice");
    }
  });

  it("rejects payload without userName", () => {
    const { userName, ...noUser } = validPayload;
    const result = OnboardingPayloadSchema.safeParse(noUser);
    expect(result.success).toBe(false);
  });

  it("rejects payload without team", () => {
    const { team, ...noTeam } = validPayload;
    const result = OnboardingPayloadSchema.safeParse(noTeam);
    expect(result.success).toBe(false);
  });

  it("rejects payload with invalid businessType", () => {
    const result = OnboardingPayloadSchema.safeParse({
      ...validPayload,
      businessType: "agency",
    });
    expect(result.success).toBe(false);
  });
});
