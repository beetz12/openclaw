import { describe, it, expect, vi } from "vitest";
import type { BusinessContext } from "../context-loader.js";
import type { MemoryClient, PastTaskSummary } from "./notebooklm-client.js";

const { enrichDecomposition, formatEnrichmentPrompt } = await import("./memory-enrichment.ts");

function createMockClient(overrides?: Partial<MemoryClient>): MemoryClient {
  return {
    storeTaskOutcome: vi.fn().mockResolvedValue(undefined),
    querySimilarTasks: vi.fn().mockResolvedValue([]),
    queryDomainKnowledge: vi.fn().mockResolvedValue(""),
    storeProfile: vi.fn().mockResolvedValue(undefined),
    storePattern: vi.fn().mockResolvedValue(undefined),
    isAvailable: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const mockContext: BusinessContext = {
  profile: { businessName: "TestCo", industry: "retail" },
  role: "analyst",
  allowedDomains: [],
  documentAccess: [],
  contextBudget: 2000,
};

describe("enrichDecomposition", () => {
  it("returns enrichment with past tasks and domain knowledge", async () => {
    const pastTasks: PastTaskSummary[] = [
      {
        goal: "Write newsletter",
        subtaskCount: 2,
        domains: ["marketing"],
        cost: 0.03,
        success: true,
      },
    ];

    const client = createMockClient({
      querySimilarTasks: vi.fn().mockResolvedValue(pastTasks),
      queryDomainKnowledge: vi.fn().mockResolvedValue("Retail tip: segment by demographics."),
    });

    const result = await enrichDecomposition("Send email campaign", mockContext, client);

    expect(result.hasEnrichment).toBe(true);
    expect(result.pastTasks).toHaveLength(1);
    expect(result.pastTasks[0].goal).toBe("Write newsletter");
    expect(result.domainKnowledge).toContain("segment by demographics");
  });

  it("returns empty enrichment when MCP unavailable", async () => {
    const client = createMockClient({
      isAvailable: vi.fn().mockResolvedValue(false),
    });

    const result = await enrichDecomposition("anything", mockContext, client);

    expect(result.hasEnrichment).toBe(false);
    expect(result.pastTasks).toEqual([]);
    expect(result.domainKnowledge).toBe("");
  });

  it("returns empty enrichment when no past data exists", async () => {
    const client = createMockClient();

    const result = await enrichDecomposition("novel task", mockContext, client);

    expect(result.hasEnrichment).toBe(false);
    expect(result.pastTasks).toEqual([]);
    expect(result.domainKnowledge).toBe("");
  });

  it("handles errors gracefully", async () => {
    const client = createMockClient({
      isAvailable: vi.fn().mockResolvedValue(true),
      querySimilarTasks: vi.fn().mockRejectedValue(new Error("query failed")),
    });

    const result = await enrichDecomposition("test", mockContext, client);

    expect(result.hasEnrichment).toBe(false);
  });

  it("considers only past tasks as enrichment when no domain knowledge", async () => {
    const pastTasks: PastTaskSummary[] = [
      { goal: "Previous task", subtaskCount: 1, domains: ["sales"], cost: 0.01, success: true },
    ];

    const client = createMockClient({
      querySimilarTasks: vi.fn().mockResolvedValue(pastTasks),
      queryDomainKnowledge: vi.fn().mockResolvedValue(""),
    });

    const result = await enrichDecomposition("new sales task", mockContext, client);

    expect(result.hasEnrichment).toBe(true);
    expect(result.pastTasks).toHaveLength(1);
    expect(result.domainKnowledge).toBe("");
  });
});

describe("formatEnrichmentPrompt", () => {
  it("formats past tasks and domain knowledge", () => {
    const enrichment = {
      pastTasks: [
        {
          goal: "Write blog post",
          subtaskCount: 3,
          domains: ["marketing", "content"],
          cost: 0.05,
          success: true,
          learnings: "Use informal tone",
        },
        {
          goal: "Send newsletter",
          subtaskCount: 1,
          domains: ["marketing"],
          cost: 0.02,
          success: false,
        },
      ],
      domainKnowledge: "Always A/B test subject lines.",
      hasEnrichment: true,
    };

    const output = formatEnrichmentPrompt(enrichment);

    expect(output).toContain("Past similar tasks:");
    expect(output).toContain('"Write blog post"');
    expect(output).toContain("3 subtasks");
    expect(output).toContain("[marketing, content]");
    expect(output).toContain("$0.05");
    expect(output).toContain("success");
    expect(output).toContain("Use informal tone");
    expect(output).toContain('"Send newsletter"');
    expect(output).toContain("failed");
    expect(output).toContain("Domain knowledge:");
    expect(output).toContain("Always A/B test subject lines.");
  });

  it("returns empty string when no enrichment", () => {
    const output = formatEnrichmentPrompt({
      pastTasks: [],
      domainKnowledge: "",
      hasEnrichment: false,
    });

    expect(output).toBe("");
  });

  it("formats only past tasks when no domain knowledge", () => {
    const output = formatEnrichmentPrompt({
      pastTasks: [
        { goal: "Task A", subtaskCount: 2, domains: ["sales"], cost: 0.01, success: true },
      ],
      domainKnowledge: "",
      hasEnrichment: true,
    });

    expect(output).toContain("Past similar tasks:");
    expect(output).not.toContain("Domain knowledge:");
  });

  it("formats only domain knowledge when no past tasks", () => {
    const output = formatEnrichmentPrompt({
      pastTasks: [],
      domainKnowledge: "Some domain info",
      hasEnrichment: true,
    });

    expect(output).not.toContain("Past similar tasks:");
    expect(output).toContain("Domain knowledge:");
    expect(output).toContain("Some domain info");
  });
});
