import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the openclaw module to control MCP tool availability
const mockCallMcpTool = vi.fn();
vi.mock("openclaw", () => ({
  callMcpTool: mockCallMcpTool,
}));

const { createMemoryClient, _clearNotebookCache } = await import("./notebooklm-client.ts");

describe("notebooklm-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearNotebookCache();
  });

  describe("isAvailable", () => {
    it("returns true when MCP is reachable and notebook exists", async () => {
      mockCallMcpTool.mockResolvedValueOnce([{ id: "nb-1", title: "VWP Memory — TestCo" }]);
      const client = await createMemoryClient({ businessName: "TestCo" });
      const available = await client.isAvailable();
      expect(available).toBe(true);
    });

    it("returns true when notebook needs to be created", async () => {
      mockCallMcpTool
        .mockResolvedValueOnce([]) // no existing notebooks
        .mockResolvedValueOnce({ id: "nb-new" }); // create returns id
      const client = await createMemoryClient({ businessName: "NewCo" });
      const available = await client.isAvailable();
      expect(available).toBe(true);
    });

    it("returns false when MCP call fails", async () => {
      mockCallMcpTool.mockRejectedValue(new Error("MCP unavailable"));
      const client = await createMemoryClient();
      const available = await client.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe("storeTaskOutcome", () => {
    it("stores formatted outcome as text source", async () => {
      // First call: notebook_list; second call: source_add
      mockCallMcpTool
        .mockResolvedValueOnce([{ id: "nb-store", title: "VWP Memory — Default" }])
        .mockResolvedValueOnce(undefined);

      const client = await createMemoryClient();

      await client.storeTaskOutcome({
        taskId: "task-123",
        goal: "Write a blog post",
        subtasks: [
          {
            description: "Research topic",
            domain: "marketing",
            status: "completed",
            result: "done",
          },
          { description: "Draft content", domain: "marketing", status: "completed" },
        ],
        totalCost: { tokens: 5000, usd: 0.05 },
        duration: 30000,
        success: true,
        learnings: "User prefers informal tone",
      });

      // Find the source_add call
      const sourceAddCall = mockCallMcpTool.mock.calls.find(
        (c) => c[0] === "notebooklm-mcp__source_add",
      );
      expect(sourceAddCall).toBeDefined();
      const params = sourceAddCall![1];
      expect(params.notebook_id).toBe("nb-store");
      expect(params.type).toBe("text");
      expect(params.content).toContain("task-123");
      expect(params.content).toContain("Write a blog post");
      expect(params.content).toContain("User prefers informal tone");
    });

    it("silently handles errors", async () => {
      mockCallMcpTool
        .mockResolvedValueOnce([{ id: "nb-err", title: "VWP Memory — Default" }])
        .mockRejectedValueOnce(new Error("Storage failed"));

      const client = await createMemoryClient();

      // Should not throw
      await expect(
        client.storeTaskOutcome({
          taskId: "task-err",
          goal: "Test",
          subtasks: [],
          totalCost: { tokens: 0, usd: 0 },
          duration: 0,
          success: false,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("querySimilarTasks", () => {
    it("returns parsed task summaries from structured response", async () => {
      const queryResponse = JSON.stringify([
        {
          goal: "Write blog post",
          subtaskCount: 2,
          domains: ["marketing"],
          cost: 0.05,
          success: true,
        },
        {
          goal: "Send newsletter",
          subtaskCount: 1,
          domains: ["marketing"],
          cost: 0.02,
          success: true,
        },
      ]);

      // notebook_list, then notebook_query
      mockCallMcpTool
        .mockResolvedValueOnce([{ id: "nb-q1", title: "VWP Memory — Default" }])
        .mockResolvedValueOnce({ text: queryResponse });

      const client = await createMemoryClient();
      const results = await client.querySimilarTasks("Create a marketing email");

      expect(results).toHaveLength(2);
      expect(results[0].goal).toBe("Write blog post");
      expect(results[0].subtaskCount).toBe(2);
      expect(results[0].success).toBe(true);
    });

    it("returns parsed task summaries from text response", async () => {
      const textResponse = [
        "# Task: Write blog post",
        "success: true",
        "cost_usd: 0.05",
        "- [completed] Research topic (marketing)",
        "- [completed] Draft content (marketing)",
        "## Learnings",
        "Informal tone works best",
      ].join("\n");

      mockCallMcpTool
        .mockResolvedValueOnce([{ id: "nb-q2", title: "VWP Memory — Default" }])
        .mockResolvedValueOnce({ text: textResponse });

      const client = await createMemoryClient();
      const results = await client.querySimilarTasks("Marketing content");

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].goal).toBe("Write blog post");
    });

    it("returns empty array when MCP unavailable", async () => {
      mockCallMcpTool.mockRejectedValue(new Error("MCP down"));
      const client = await createMemoryClient();
      const results = await client.querySimilarTasks("anything");
      expect(results).toEqual([]);
    });

    it("respects limit parameter", async () => {
      const queryResponse = JSON.stringify([
        { goal: "Task 1", subtaskCount: 1, domains: [], cost: 0, success: true },
        { goal: "Task 2", subtaskCount: 1, domains: [], cost: 0, success: true },
        { goal: "Task 3", subtaskCount: 1, domains: [], cost: 0, success: true },
      ]);

      mockCallMcpTool
        .mockResolvedValueOnce([{ id: "nb-q4", title: "VWP Memory — Default" }])
        .mockResolvedValueOnce({ text: queryResponse });

      const client = await createMemoryClient();
      const results = await client.querySimilarTasks("test", 2);

      expect(results).toHaveLength(2);
    });
  });

  describe("queryDomainKnowledge", () => {
    it("returns text from query response", async () => {
      mockCallMcpTool
        .mockResolvedValueOnce([{ id: "nb-dk", title: "VWP Memory — Default" }])
        .mockResolvedValueOnce({ text: "E-commerce best practice: optimize product images." });

      const client = await createMemoryClient();
      const knowledge = await client.queryDomainKnowledge("ecommerce", "product listings");

      expect(knowledge).toContain("optimize product images");
    });

    it("returns empty string when MCP unavailable", async () => {
      mockCallMcpTool.mockRejectedValue(new Error("MCP down"));
      const client = await createMemoryClient();
      const knowledge = await client.queryDomainKnowledge("any", "query");
      expect(knowledge).toBe("");
    });
  });

  describe("storeProfile", () => {
    it("stores formatted profile as text source", async () => {
      mockCallMcpTool
        .mockResolvedValueOnce([{ id: "nb-sp", title: "VWP Memory — Default" }])
        .mockResolvedValueOnce(undefined);

      const client = await createMemoryClient();

      await client.storeProfile({
        businessName: "TestCo",
        industry: "retail",
        teamSize: 5,
      });

      const sourceAddCall = mockCallMcpTool.mock.calls.find(
        (c) => c[0] === "notebooklm-mcp__source_add",
      );
      expect(sourceAddCall).toBeDefined();
      expect(sourceAddCall![1].content).toContain("TestCo");
      expect(sourceAddCall![1].content).toContain("retail");
    });
  });

  describe("storePattern", () => {
    it("stores formatted pattern as text source", async () => {
      mockCallMcpTool
        .mockResolvedValueOnce([{ id: "nb-pat", title: "VWP Memory — Default" }])
        .mockResolvedValueOnce(undefined);

      const client = await createMemoryClient();

      await client.storePattern({
        category: "user_preference",
        description: "User prefers concise emails",
        confidence: 0.85,
      });

      const sourceAddCall = mockCallMcpTool.mock.calls.find(
        (c) => c[0] === "notebooklm-mcp__source_add",
      );
      expect(sourceAddCall).toBeDefined();
      expect(sourceAddCall![1].content).toContain("user_preference");
      expect(sourceAddCall![1].content).toContain("User prefers concise emails");
      expect(sourceAddCall![1].content).toContain("0.85");
    });
  });
});
