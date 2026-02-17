import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveCliBackendConfig } from "./cli-backends.js";
import { runCliAgent } from "./cli-runner.js";

const runCommandWithTimeoutMock = vi.fn();
const runExecMock = vi.fn();

vi.mock("../process/exec.js", () => ({
  runCommandWithTimeout: (...args: unknown[]) => runCommandWithTimeoutMock(...args),
  runExec: (...args: unknown[]) => runExecMock(...args),
}));

function mockSuccessfulRun() {
  runExecMock.mockResolvedValue({ stdout: "", stderr: "" });
  runCommandWithTimeoutMock.mockResolvedValueOnce({
    stdout: JSON.stringify({ message: "ok", session_id: "sid-1" }),
    stderr: "",
    code: 0,
    signal: null,
    killed: false,
  });
}

function getSystemPromptArg(): string | undefined {
  const argv = runCommandWithTimeoutMock.mock.calls[0]?.[0] as string[];
  const idx = argv.indexOf("--append-system-prompt");
  return idx >= 0 ? argv[idx + 1] : undefined;
}

describe("CLI runner disableTools configuration", () => {
  beforeEach(() => {
    runCommandWithTimeoutMock.mockReset();
    runExecMock.mockReset();
  });

  it("includes tools-disabled message when disableTools is not set (default)", async () => {
    mockSuccessfulRun();

    await runCliAgent({
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      prompt: "hi",
      provider: "claude-cli",
      model: "opus",
      timeoutMs: 1_000,
      runId: "run-1",
    });

    const systemPrompt = getSystemPromptArg();
    expect(systemPrompt).toBeDefined();
    expect(systemPrompt).toContain("Tools are disabled in this session. Do not call tools.");
  });

  it("includes tools-disabled message when disableTools is true", async () => {
    mockSuccessfulRun();

    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          cliBackends: {
            "claude-cli": { command: "claude", disableTools: true },
          },
        },
      },
    };

    await runCliAgent({
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: cfg,
      prompt: "hi",
      provider: "claude-cli",
      model: "opus",
      timeoutMs: 1_000,
      runId: "run-2",
    });

    const systemPrompt = getSystemPromptArg();
    expect(systemPrompt).toBeDefined();
    expect(systemPrompt).toContain("Tools are disabled in this session. Do not call tools.");
  });

  it("omits tools-disabled message when disableTools is false", async () => {
    mockSuccessfulRun();

    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          cliBackends: {
            "claude-cli": { command: "claude", disableTools: false },
          },
        },
      },
    };

    await runCliAgent({
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: cfg,
      prompt: "hi",
      provider: "claude-cli",
      model: "opus",
      timeoutMs: 1_000,
      runId: "run-3",
    });

    const systemPrompt = getSystemPromptArg();
    expect(systemPrompt).not.toContain("Tools are disabled in this session. Do not call tools.");
  });
});

describe("default CLI backend configs include disableTools: true", () => {
  it("claude-cli backend has disableTools true", () => {
    const resolved = resolveCliBackendConfig("claude-cli");
    expect(resolved).not.toBeNull();
    expect(resolved!.config.disableTools).toBe(true);
  });

  it("codex-cli backend has disableTools true", () => {
    const resolved = resolveCliBackendConfig("codex-cli");
    expect(resolved).not.toBeNull();
    expect(resolved!.config.disableTools).toBe(true);
  });

  it("user override with disableTools: false is preserved after merge", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          cliBackends: {
            "claude-cli": { command: "claude", disableTools: false },
          },
        },
      },
    };
    const resolved = resolveCliBackendConfig("claude-cli", cfg);
    expect(resolved).not.toBeNull();
    expect(resolved!.config.disableTools).toBe(false);
  });
});
