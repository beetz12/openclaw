import { describe, it, expect } from "vitest";
import { resolveCliBinary, buildAnalysisInvocation, buildAgentInvocation } from "./cli-provider.ts";

describe("resolveCliBinary", () => {
  it("returns 'claude' for claude-cli provider", () => {
    expect(resolveCliBinary("claude-cli")).toBe("claude");
  });

  it("returns 'codex' for codex-cli provider", () => {
    expect(resolveCliBinary("codex-cli")).toBe("codex");
  });

  it("returns 'gemini' for gemini-cli provider", () => {
    expect(resolveCliBinary("gemini-cli")).toBe("gemini");
  });

  it("throws for unknown provider", () => {
    expect(() => resolveCliBinary("unknown-provider")).toThrow("Unsupported CLI provider");
  });

  it("defaults to 'claude' when provider is empty", () => {
    expect(resolveCliBinary("")).toBe("claude");
  });
});

describe("buildAnalysisInvocation", () => {
  it("builds claude analysis args with system prompt", () => {
    const result = buildAnalysisInvocation("claude-cli", {
      prompt: "Analyze this",
      model: "sonnet",
      systemPrompt: "You are a task decomposer",
    });
    expect(result[0]).toBe("claude");
    expect(result).toContain("-p");
    expect(result).toContain("--output-format");
    expect(result).toContain("json");
    expect(result).toContain("--append-system-prompt");
    expect(result).toContain("--dangerously-skip-permissions");
  });

  it("builds codex analysis args with system prompt embedded", () => {
    const result = buildAnalysisInvocation("codex-cli", {
      prompt: "Analyze this",
      model: "o3",
      systemPrompt: "You are a task decomposer",
    });
    expect(result[0]).toBe("codex");
    expect(result[1]).toBe("exec");
    expect(result).toContain("--json");
    expect(result).toContain("-s");
    expect(result).toContain("danger-full-access");
    expect(result).toContain("--skip-git-repo-check");
    expect(result.some((a) => a.includes("You are a task decomposer"))).toBe(true);
  });

  it("builds gemini analysis args with system prompt embedded", () => {
    const result = buildAnalysisInvocation("gemini-cli", {
      prompt: "Analyze this",
      model: "gemini-2.5-pro",
      systemPrompt: "You are a task decomposer",
    });
    expect(result[0]).toBe("gemini");
    expect(result).toContain("-o");
    expect(result).toContain("json");
    expect(result).toContain("-y");
    expect(result.some((a) => a.includes("You are a task decomposer"))).toBe(true);
  });
});

describe("buildAgentInvocation", () => {
  it("builds claude agent args", () => {
    const result = buildAgentInvocation("claude-cli", {
      prompt: "Do the task",
      model: "opus",
    });
    expect(result[0]).toBe("claude");
    expect(result).toContain("-p");
    expect(result).toContain("--dangerously-skip-permissions");
    expect(result).toContain("--output-format");
  });

  it("builds codex agent args", () => {
    const result = buildAgentInvocation("codex-cli", {
      prompt: "Do the task",
      model: "o3",
    });
    expect(result[0]).toBe("codex");
    expect(result[1]).toBe("exec");
    expect(result).toContain("--json");
    expect(result).toContain("-s");
    expect(result).toContain("--skip-git-repo-check");
  });

  it("builds gemini agent args", () => {
    const result = buildAgentInvocation("gemini-cli", {
      prompt: "Do the task",
      model: "gemini-2.5-pro",
    });
    expect(result[0]).toBe("gemini");
    expect(result).toContain("-y");
    expect(result).toContain("-o");
  });

  it("omits model arg when model is undefined", () => {
    const result = buildAgentInvocation("claude-cli", { prompt: "Do the task" });
    expect(result).not.toContain("--model");
    expect(result).not.toContain("-m");
  });
});
