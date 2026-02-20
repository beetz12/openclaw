# Multi-CLI Backend Abstraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded `"claude"` binary invocations in the VWP dispatch engine with a provider-aware CLI abstraction layer that supports `claude`, `codex`, and `gemini` CLIs, and update the config to match the user's chosen backend.

**Architecture:** A new `cli-provider.ts` module maps provider names to CLI binary + argument format. The analyzer, team-launcher, and cowork-agent import from this module instead of hardcoding `"claude"`. The plugin config `provider` field is updated from `"claude-cli"` to `"codex-cli"` (since the user wants Codex CLI). The CoWork SDK path remains Claude-only (Anthropic SDK), but the CLI fallback becomes provider-aware.

**Tech Stack:** TypeScript, Vitest, Node.js child_process (via `runCommandWithTimeout`)

---

## Background

The VWP dispatch engine currently hardcodes `["claude", ...args]` in three files:

- `analyzer.ts:105` — task analysis
- `team-launcher.ts:137` — lead agent
- `team-launcher.ts:174` — specialist agents

Each CLI has different argument syntax:

| Feature         | `claude`                         | `codex`                 | `gemini`            |
| --------------- | -------------------------------- | ----------------------- | ------------------- |
| Non-interactive | `-p "prompt"`                    | `exec "prompt"`         | `-p "prompt"`       |
| Model           | `--model X`                      | `-m X`                  | `-m X`              |
| JSON output     | `--output-format json`           | `--json`                | `-o json`           |
| Skip perms      | `--dangerously-skip-permissions` | `-s danger-full-access` | `-y`                |
| System prompt   | `--append-system-prompt "..."`   | _(embed in prompt)_     | _(embed in prompt)_ |

The config file (`~/.openclaw-dev/openclaw.json`) has `plugins.entries.vwp-dispatch.config.provider: "claude-cli"` which must change to `"codex-cli"`.

---

### Task 1: Create CLI Provider Abstraction Module

**Files:**

- Create: `extensions/vwp-dispatch/cli-provider.ts`
- Test: `extensions/vwp-dispatch/cli-provider.test.ts`

**Step 1: Write the failing tests**

Create `extensions/vwp-dispatch/cli-provider.test.ts`:

```typescript
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
    // System prompt should be embedded in the prompt text
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
    // System prompt embedded in prompt text
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
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run extensions/vwp-dispatch/cli-provider.test.ts`
Expected: FAIL — module `./cli-provider.ts` does not exist

**Step 3: Write the implementation**

Create `extensions/vwp-dispatch/cli-provider.ts`:

```typescript
/**
 * CLI provider abstraction — maps provider names to binary + argument format.
 *
 * Supported providers:
 * - claude-cli → spawns `claude` binary (Claude Code CLI)
 * - codex-cli  → spawns `codex` binary (OpenAI Codex CLI)
 * - gemini-cli → spawns `gemini` binary (Google Gemini CLI)
 */

export type AnalysisInvocationOptions = {
  prompt: string;
  model?: string;
  systemPrompt?: string;
};

export type AgentInvocationOptions = {
  prompt: string;
  model?: string;
};

const PROVIDER_BINARY: Record<string, string> = {
  "claude-cli": "claude",
  "codex-cli": "codex",
  "gemini-cli": "gemini",
};

/**
 * Resolve the CLI binary name for a given provider.
 */
export function resolveCliBinary(provider: string): string {
  if (!provider) return "claude";
  const binary = PROVIDER_BINARY[provider];
  if (!binary) {
    throw new Error(
      `Unsupported CLI provider: "${provider}". Supported: ${Object.keys(PROVIDER_BINARY).join(", ")}`,
    );
  }
  return binary;
}

/**
 * Build the full command array for a task analysis invocation.
 * Analysis calls need JSON output and a system prompt.
 */
export function buildAnalysisInvocation(
  provider: string,
  options: AnalysisInvocationOptions,
): string[] {
  const { prompt, model, systemPrompt } = options;
  const resolvedProvider = provider || "claude-cli";

  switch (resolvedProvider) {
    case "claude-cli": {
      const args = [
        "claude",
        "-p",
        prompt,
        "--output-format",
        "json",
        "--dangerously-skip-permissions",
      ];
      if (model) args.push("--model", model);
      if (systemPrompt) args.push("--append-system-prompt", systemPrompt);
      return args;
    }

    case "codex-cli": {
      // Codex has no --append-system-prompt; embed it in the prompt
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
      const args = ["codex", "exec", fullPrompt, "--json", "-s", "danger-full-access"];
      if (model) args.push("-m", model);
      return args;
    }

    case "gemini-cli": {
      // Gemini has no --append-system-prompt; embed it in the prompt
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
      const args = ["gemini", "-p", fullPrompt, "-o", "json", "-y"];
      if (model) args.push("-m", model);
      return args;
    }

    default:
      throw new Error(`Unsupported CLI provider: "${resolvedProvider}"`);
  }
}

/**
 * Build the full command array for an agent invocation (team lead or specialist).
 * Agent calls need JSON output and full permissions.
 */
export function buildAgentInvocation(provider: string, options: AgentInvocationOptions): string[] {
  const { prompt, model } = options;
  const resolvedProvider = provider || "claude-cli";

  switch (resolvedProvider) {
    case "claude-cli": {
      const args = [
        "claude",
        "-p",
        prompt,
        "--dangerously-skip-permissions",
        "--output-format",
        "json",
      ];
      if (model) args.push("--model", model);
      return args;
    }

    case "codex-cli": {
      const args = ["codex", "exec", prompt, "--json", "-s", "danger-full-access"];
      if (model) args.push("-m", model);
      return args;
    }

    case "gemini-cli": {
      const args = ["gemini", "-p", prompt, "-o", "json", "-y"];
      if (model) args.push("-m", model);
      return args;
    }

    default:
      throw new Error(`Unsupported CLI provider: "${resolvedProvider}"`);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run extensions/vwp-dispatch/cli-provider.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add extensions/vwp-dispatch/cli-provider.ts extensions/vwp-dispatch/cli-provider.test.ts
git commit -m "feat(dispatch): add multi-CLI provider abstraction layer

Supports claude-cli, codex-cli, and gemini-cli with correct argument
formats for each. Separates analysis invocations (with system prompt)
from agent invocations."
```

---

### Task 2: Refactor analyzer.ts to Use CLI Provider

**Files:**

- Modify: `extensions/vwp-dispatch/analyzer.ts:66-118` (the `analyzeTask` function)

**Step 1: Update the import and replace hardcoded invocation**

In `analyzer.ts`, replace the hardcoded `["claude", ...args]` invocation with `buildAnalysisInvocation()`.

**Before** (lines 71-107):

```typescript
const { runCommandWithTimeout } = await import("../../src/process/exec.js");

const provider = config.provider ?? "claude-cli";
const model = config.model ?? "sonnet";
const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

// ... system prompt building ...

const args = [
  "-p",
  cleanText,
  "--output-format",
  "json",
  "--model",
  model,
  "--append-system-prompt",
  systemPrompt,
  "--dangerously-skip-permissions",
];

const result = await runCommandWithTimeout(["claude", ...args], {
  timeoutMs,
});
```

**After:**

```typescript
import { buildAnalysisInvocation } from "./cli-provider.js";

// ... (inside analyzeTask function) ...

const { runCommandWithTimeout } = await import("../../src/process/exec.js");

const provider = config.provider ?? "claude-cli";
const model = config.model ?? "sonnet";
const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

// ... system prompt building stays the same ...

const invocation = buildAnalysisInvocation(provider, {
  prompt: cleanText,
  model,
  systemPrompt,
});

const result = await runCommandWithTimeout(invocation, {
  timeoutMs,
});
```

This removes the hardcoded `"claude"` and the manual arg array construction. The `buildAnalysisInvocation` function handles the correct binary and argument format per provider.

**Step 2: Run existing analyzer tests**

Run: `pnpm vitest run extensions/vwp-dispatch/analyzer.test.ts`
Expected: PASS (existing tests only test `assignTeamMembers`, not `analyzeTask` which requires CLI mocking)

**Step 3: Commit**

```bash
git add extensions/vwp-dispatch/analyzer.ts
git commit -m "refactor(dispatch): use CLI provider abstraction in analyzer

Replaces hardcoded 'claude' binary with buildAnalysisInvocation()
which resolves the correct binary and args from the provider config."
```

---

### Task 3: Refactor team-launcher.ts to Use CLI Provider

**Files:**

- Modify: `extensions/vwp-dispatch/team-launcher.ts:137,174,319-325`

**Step 1: Replace the local `buildCliArgs` helper and hardcoded invocations**

Three changes needed:

1. Add import at top of file:

```typescript
import { buildAgentInvocation } from "./cli-provider.js";
```

2. Add `provider` to `LaunchOptions` usage — it already exists in the type (line 31), so we just need to thread it through.

3. Replace the three hardcoded `["claude", ...]` calls:

**Lead call (line 136-137):**

```typescript
// Before:
const leadArgs = buildCliArgs(leadPrompt, options.model);
const leadResult = await runCommandWithTimeout(["claude", ...leadArgs], {

// After:
const provider = options.provider ?? "claude-cli";
const leadInvocation = buildAgentInvocation(provider, {
  prompt: leadPrompt,
  model: options.model,
});
const leadResult = await runCommandWithTimeout(leadInvocation, {
```

**Specialist call (lines 173-174):**

```typescript
// Before:
const args = buildCliArgs(prompt, options.model);
const result = await runCommandWithTimeout(["claude", ...args], {

// After:
const specialistInvocation = buildAgentInvocation(provider, {
  prompt,
  model: options.model,
});
const result = await runCommandWithTimeout(specialistInvocation, {
```

4. Delete the now-unused `buildCliArgs` function (lines 319-325).

**Step 2: Update team-launcher.test.ts assertion**

In `team-launcher.test.ts`, the test at line 154 ("calls runCommandWithTimeout with correct args") asserts `argv[0]` is `"claude"`. This needs to be updated to check for the configured provider's binary. Since no provider is passed in the test options, it defaults to `"claude-cli"` → `"claude"`, so the existing assertion still holds. However, we should add a test for codex-cli:

Add to the describe block:

```typescript
it("uses codex binary when provider is codex-cli", async () => {
  const spec = createTestSpec();
  await launchTeam(spec, "task-010", mockRegistry, { provider: "codex-cli", model: "o3" });

  const firstCall = mockRunCommand.mock.calls[0]!;
  const argv = firstCall[0] as string[];
  expect(argv[0]).toBe("codex");
  expect(argv[1]).toBe("exec");
  expect(argv).toContain("--json");
});
```

**Step 3: Run tests**

Run: `pnpm vitest run extensions/vwp-dispatch/team-launcher.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add extensions/vwp-dispatch/team-launcher.ts extensions/vwp-dispatch/team-launcher.test.ts
git commit -m "refactor(dispatch): use CLI provider abstraction in team-launcher

Replaces three hardcoded 'claude' binary calls with buildAgentInvocation().
Removes the now-unused buildCliArgs local helper. Adds test for codex-cli
provider support."
```

---

### Task 4: Refactor cowork-agent.ts CLI Fallback

**Files:**

- Modify: `extensions/vwp-dispatch/cowork-agent.ts:199-226` (the `runWithCliFallback` function)

**Step 1: Update CLI fallback to accept provider**

The CoWork module has two paths:

1. **SDK path** (`runWithSdk`) — uses `@anthropic-ai/claude-agent-sdk`. This stays Claude-only because the SDK is Anthropic-specific.
2. **CLI fallback** (`runWithCliFallback`) — currently hardcodes `provider: "claude-cli"`. This should be provider-aware.

Add a `provider` field to `CoworkStartParams`:

```typescript
export interface CoworkStartParams {
  projectId: string;
  rootPath: string;
  prompt: string;
  model?: string;
  provider?: string; // NEW: CLI provider for fallback path
  // ... rest unchanged
}
```

Update `runWithCliFallback` (lines 199-226):

```typescript
// Before:
const result = await runCliAgent({
  // ...
  provider: "claude-cli",
  model: params.model ?? "sonnet",
  // ...
});

// After:
const result = await runCliAgent({
  // ...
  provider: params.provider ?? "claude-cli",
  model: params.model ?? "sonnet",
  // ...
});
```

Also update the SDK default model (line 105) to respect the provider:

```typescript
// Before:
model: params.model ?? "claude-sonnet-4-6",

// After:
model: params.model ?? "claude-sonnet-4-6",
// NOTE: The SDK path is Claude-only. If a non-Claude provider is configured
// and the SDK fails, the CLI fallback will use the correct provider.
```

**Step 2: Run existing cowork tests**

Run: `pnpm vitest run extensions/vwp-dispatch/cowork-routes.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add extensions/vwp-dispatch/cowork-agent.ts
git commit -m "refactor(dispatch): make CoWork CLI fallback provider-aware

The SDK path remains Claude-only (Anthropic SDK), but the CLI fallback
now respects the provider field from params instead of hardcoding claude-cli."
```

---

### Task 5: Thread Provider Config Through index.ts

**Files:**

- Modify: `extensions/vwp-dispatch/index.ts:365-370`

**Step 1: Pass provider to launchTeam options**

The `analyzeTask` call (line 300-303) already passes `provider: pluginCfg.provider`. But `launchTeam` (line 365) does NOT pass the provider. Fix:

```typescript
// Before (line 365):
const handle = await launchTeam(spec, task.id, registry, {
  model: pluginCfg.teamModel ?? "opus",
  timeoutMs: pluginCfg.teamTimeoutMs,
  sse,
  agentState,
});

// After:
const handle = await launchTeam(spec, task.id, registry, {
  provider: pluginCfg.provider,
  model: pluginCfg.teamModel ?? "opus",
  timeoutMs: pluginCfg.teamTimeoutMs,
  sse,
  agentState,
});
```

Also update the `VwpDispatchPluginConfig` type comment (line 52):

```typescript
// Before:
/** Provider for LLM calls (default: "claude-cli"). */
provider?: string;

// After:
/** CLI provider for dispatch (e.g. "claude-cli", "codex-cli", "gemini-cli"). */
provider?: string;
```

**Step 2: Commit**

```bash
git add extensions/vwp-dispatch/index.ts
git commit -m "fix(dispatch): pass provider config to team launcher

The provider was passed to analyzeTask but not to launchTeam,
causing teams to always use claude regardless of config."
```

---

### Task 6: Update Config File and Environment Variables

**Files:**

- Modify: `~/.openclaw-dev/openclaw.json` (user config — line 40)
- Modify: `extensions/vwp-dispatch/safe-env.ts` (add CODEX env vars to allowlist)

**Step 1: Update the plugin config provider**

In `~/.openclaw-dev/openclaw.json`, change line 40:

```json
// Before:
"provider": "claude-cli",

// After:
"provider": "codex-cli",
```

**Step 2: Add Codex env vars to safe-env.ts ALWAYS_ALLOW**

The `safe-env.ts` file has an `ALWAYS_ALLOW` set that includes `CLAUDECODE` for Claude's nested session detection. Codex CLI may need similar env vars. Add Codex-specific vars:

```typescript
// In safe-env.ts ALWAYS_ALLOW set, add:
"CODEX_CLI_SESSION",
```

Also check the `team-launcher.ts` env block — it sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` and `CLAUDECODE`. For Codex, these aren't needed, but they also don't hurt (Codex ignores them). No change needed there — the safe-env already allows them.

**Step 3: Run safe-env tests**

Run: `pnpm vitest run extensions/vwp-dispatch/safe-env.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add extensions/vwp-dispatch/safe-env.ts
git commit -m "chore(dispatch): update dispatch config to codex-cli

Changes plugin provider from claude-cli to codex-cli. Adds Codex
session env var to safe-env allowlist."
```

Note: The `~/.openclaw-dev/openclaw.json` is a user config file, not committed to git.

---

### Task 7: Update team-launcher.ts env handling to be provider-aware

**Files:**

- Modify: `extensions/vwp-dispatch/team-launcher.ts:139-144,176-181`

**Step 1: Make subprocess env provider-aware**

The team-launcher sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` and `CLAUDECODE` in the subprocess env. These are Claude-specific. For Codex, we don't need them (and they're harmless if present, but it's cleaner to only set relevant ones).

```typescript
// Before (repeated at lines 140-143 and 177-180):
env: {
  ...buildSafeEnv(process.env as Record<string, string>),
  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
  CLAUDECODE: "",
},

// After:
env: {
  ...buildSafeEnv(process.env as Record<string, string>),
  ...(provider === "claude-cli" ? {
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
    CLAUDECODE: "",
  } : {}),
},
```

**Step 2: Run team-launcher tests**

Run: `pnpm vitest run extensions/vwp-dispatch/team-launcher.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add extensions/vwp-dispatch/team-launcher.ts
git commit -m "refactor(dispatch): only set Claude env vars for claude-cli provider

CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS and CLAUDECODE are only relevant
when spawning the claude binary. Other CLIs ignore them but this
keeps the env clean."
```

---

### Task 8: Update Documentation and Verify Build

**Files:**

- Modify: `CLAUDE.md` (update CLI Backend Detection section)

**Step 1: Update CLAUDE.md**

In the "CLI Backend Detection" section, add a note about the multi-provider support:

```markdown
### CLI Backend Detection

- `isCliProvider()` in `src/agents/model-selection.ts` returns true for `claude-cli` and `codex-cli` providers
- Config: `agents.defaults.model.primary: "openai-codex/gpt-5.3-codex"` in `~/.openclaw-dev/openclaw.json`
- VWP dispatch plugin has its own provider config: `plugins.entries.vwp-dispatch.config.provider` (supports `claude-cli`, `codex-cli`, `gemini-cli`)
- The CLI provider abstraction is in `extensions/vwp-dispatch/cli-provider.ts`
```

**Step 2: Run the build**

Run: `pnpm build`
Expected: PASS with no type errors

**Step 3: Run all dispatch tests**

Run: `pnpm vitest run extensions/vwp-dispatch/`
Expected: ALL PASS

**Step 4: Run fork invariant tests**

Run: `pnpm vitest run extensions/vwp-dispatch/fork-invariants.test.ts`
Expected: ALL PASS (we didn't touch cli-backends.ts or exec.ts)

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document multi-CLI provider support in CLAUDE.md"
```

---

## Summary of Changes

| File                            | Change                                 | Purpose                                           |
| ------------------------------- | -------------------------------------- | ------------------------------------------------- |
| `cli-provider.ts`               | **NEW**                                | CLI abstraction: binary resolution + arg building |
| `cli-provider.test.ts`          | **NEW**                                | Tests for all three providers                     |
| `analyzer.ts`                   | Replace hardcoded `["claude", ...]`    | Use `buildAnalysisInvocation()`                   |
| `team-launcher.ts`              | Replace 3x hardcoded `["claude", ...]` | Use `buildAgentInvocation()`                      |
| `team-launcher.ts`              | Provider-aware env vars                | Only set Claude env for Claude CLI                |
| `team-launcher.test.ts`         | Add codex provider test                | Verify multi-provider works                       |
| `cowork-agent.ts`               | Provider-aware CLI fallback            | Respect `params.provider`                         |
| `index.ts`                      | Pass provider to `launchTeam`          | Thread config through                             |
| `safe-env.ts`                   | Add Codex env var                      | Allow Codex session detection                     |
| `CLAUDE.md`                     | Update docs                            | Document new CLI provider layer                   |
| `~/.openclaw-dev/openclaw.json` | `"claude-cli"` → `"codex-cli"`         | User config (not committed)                       |

## What This Does NOT Change

- **Content factory Python tools** — They use `claude_agent_sdk` which is Anthropic-specific. They work fine via Claude Max subscription (no API key needed). Leave them on Claude.
- **CoWork SDK path** — The primary CoWork path uses `@anthropic-ai/claude-agent-sdk`. This stays Claude-only. Only the CLI fallback becomes provider-aware.
- **Upstream code** (`src/agents/defaults.ts`, `model-selection.ts`) — These are upstream files with their own fallback chain. We don't modify them.
- **Gateway chat routing** — Already correctly uses `openai-codex/gpt-5.3-codex` from config.
