import { describe, it, expect } from "vitest";

/**
 * Fork security invariant regression tests.
 *
 * These tests guard against upstream changes that would silently break the
 * nexclaw fork's security mechanisms:
 *   1. clearEnv stripping of sensitive env vars from spawned subprocesses
 *   2. mergeBackendConfig union (additive-only) semantics for clearEnv
 *   3. exec.ts undefined-filter that removes env keys set to undefined
 *
 * Tests use dynamic import so they can be run against the compiled upstream
 * modules without importing them at the extension's top level.
 */

describe("fork security invariants", () => {
  // ---------------------------------------------------------------------------
  // Test 1: DEFAULT_CLAUDE_BACKEND.clearEnv includes required keys
  //
  // resolveCliBackendConfig("claude-cli") applies mergeBackendConfig with no
  // override, so its clearEnv reflects DEFAULT_CLAUDE_BACKEND.clearEnv exactly.
  // ---------------------------------------------------------------------------
  it("DEFAULT_CLAUDE_BACKEND.clearEnv includes critical keys", async () => {
    const { resolveCliBackendConfig } = await import("../../src/agents/cli-backends.js");

    const resolved = resolveCliBackendConfig("claude-cli");
    expect(resolved).not.toBeNull();

    const clearEnv = resolved!.config.clearEnv ?? [];
    const required = ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY_OLD", "CLAUDECODE"];
    for (const key of required) {
      expect(clearEnv, `clearEnv must contain ${key}`).toContain(key);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 2: mergeBackendConfig is additive-only for clearEnv
  //
  // resolveCliBackendConfig accepts an optional cliBackends override via config.
  // We exercise the merge path by passing a minimal config that overrides
  // the claude-cli backend with additional clearEnv keys and verify that both
  // the base keys and the new key survive.
  // ---------------------------------------------------------------------------
  it("mergeBackendConfig unions clearEnv arrays (additive only)", async () => {
    const { resolveCliBackendConfig } = await import("../../src/agents/cli-backends.js");

    const cfg = {
      agents: {
        defaults: {
          cliBackends: {
            "claude-cli": {
              clearEnv: ["KEY_C"],
            },
          },
        },
      },
    };

    // Cast to any so we don't need to satisfy the full OpenClawConfig shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolved = resolveCliBackendConfig("claude-cli", cfg as any);
    expect(resolved).not.toBeNull();

    const clearEnv = resolved!.config.clearEnv ?? [];

    // Base keys must survive (union semantics)
    expect(clearEnv, "ANTHROPIC_API_KEY must survive merge").toContain("ANTHROPIC_API_KEY");
    expect(clearEnv, "ANTHROPIC_API_KEY_OLD must survive merge").toContain("ANTHROPIC_API_KEY_OLD");
    expect(clearEnv, "CLAUDECODE must survive merge").toContain("CLAUDECODE");

    // Override key is added
    expect(clearEnv, "KEY_C must be added by override").toContain("KEY_C");
  });

  it("mergeBackendConfig with empty override does not remove base clearEnv", async () => {
    const { resolveCliBackendConfig } = await import("../../src/agents/cli-backends.js");

    const cfg = {
      agents: {
        defaults: {
          cliBackends: {
            "claude-cli": {
              clearEnv: [],
            },
          },
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolved = resolveCliBackendConfig("claude-cli", cfg as any);
    expect(resolved).not.toBeNull();

    const clearEnv = resolved!.config.clearEnv ?? [];

    expect(clearEnv, "ANTHROPIC_API_KEY must survive empty override").toContain(
      "ANTHROPIC_API_KEY",
    );
    expect(clearEnv, "ANTHROPIC_API_KEY_OLD must survive empty override").toContain(
      "ANTHROPIC_API_KEY_OLD",
    );
    expect(clearEnv, "CLAUDECODE must survive empty override").toContain("CLAUDECODE");
  });

  // ---------------------------------------------------------------------------
  // Test 3: exec.ts undefined-filter actually strips env vars from subprocess
  //
  // runCommandWithTimeout merges process.env with the caller-supplied env object,
  // then filters out entries whose value is undefined (lines 103-108 of exec.ts).
  // Setting a key to undefined in the env override should cause it to be absent
  // from the spawned subprocess's environment.
  // ---------------------------------------------------------------------------
  it("clearEnv mechanism actually strips env vars from subprocess", async () => {
    const { runCommandWithTimeout } = await import("../../src/process/exec.js");

    const testKey = `__NEXCLAW_TEST_CLEARENV_${Date.now()}`;
    process.env[testKey] = "should-be-stripped";

    try {
      const argv =
        process.platform === "win32"
          ? ["cmd", "/c", `if defined ${testKey} (echo %${testKey}%) else (echo __ABSENT__)`]
          : ["sh", "-c", `printenv ${testKey} || echo "__ABSENT__"`];

      const result = await runCommandWithTimeout(argv, {
        timeoutMs: 5000,
        env: { [testKey]: undefined },
      });

      // The sensitive env var must NOT appear in subprocess output
      expect(result.stdout, "stripped env var must not reach subprocess").not.toContain(
        "should-be-stripped",
      );
    } finally {
      delete process.env[testKey];
    }
  });
});
