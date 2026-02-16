import { describe, it, expect } from "vitest";
import { buildSafeEnv } from "./safe-env.js";

describe("buildSafeEnv", () => {
  it("preserves PATH and HOME", () => {
    const env = {
      PATH: "/usr/bin:/bin",
      HOME: "/home/user",
    };
    const result = buildSafeEnv(env);
    expect(result.PATH).toBe("/usr/bin:/bin");
    expect(result.HOME).toBe("/home/user");
  });

  it("strips secret environment variables", () => {
    const env = {
      PATH: "/usr/bin",
      OPENCLAW_GATEWAY_TOKEN: "secret123",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      AWS_SESSION_TOKEN: "session-token",
      OPENAI_API_KEY: "openai-key",
      ANTHROPIC_API_KEY: "claude-key",
      DATABASE_URL: "postgres://localhost",
      REDIS_URL: "redis://localhost",
    };
    const result = buildSafeEnv(env);
    expect(result.PATH).toBe("/usr/bin");
    expect(result.OPENCLAW_GATEWAY_TOKEN).toBeUndefined();
    expect(result.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(result.AWS_SESSION_TOKEN).toBeUndefined();
    expect(result.OPENAI_API_KEY).toBeUndefined();
    expect(result.ANTHROPIC_API_KEY).toBeUndefined();
    expect(result.DATABASE_URL).toBeUndefined();
    expect(result.REDIS_URL).toBeUndefined();
  });

  it("preserves CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", () => {
    const env = {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
      CLAUDECODE: "",
    };
    const result = buildSafeEnv(env);
    expect(result.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe("1");
    expect(result.CLAUDECODE).toBe("");
  });

  it("strips variables matching case-insensitive patterns", () => {
    const env = {
      MY_SECRET: "secret",
      user_password: "pass123",
      API_CREDENTIAL: "cred",
      ssh_private_key: "key",
      PATH: "/usr/bin",
    };
    const result = buildSafeEnv(env);
    expect(result.MY_SECRET).toBeUndefined();
    expect(result.user_password).toBeUndefined();
    expect(result.API_CREDENTIAL).toBeUndefined();
    expect(result.ssh_private_key).toBeUndefined();
    expect(result.PATH).toBe("/usr/bin");
  });

  it("handles undefined values", () => {
    const env = {
      PATH: "/usr/bin",
      UNDEFINED_VAR: undefined,
    };
    const result = buildSafeEnv(env);
    expect(result.PATH).toBe("/usr/bin");
    expect(result.UNDEFINED_VAR).toBeUndefined();
  });

  it("preserves all always-allow variables", () => {
    const env = {
      PATH: "/usr/bin",
      HOME: "/home/user",
      USER: "testuser",
      SHELL: "/bin/bash",
      LANG: "en_US.UTF-8",
      TERM: "xterm-256color",
      NODE_ENV: "production",
    };
    const result = buildSafeEnv(env);
    expect(result.PATH).toBe("/usr/bin");
    expect(result.HOME).toBe("/home/user");
    expect(result.USER).toBe("testuser");
    expect(result.SHELL).toBe("/bin/bash");
    expect(result.LANG).toBe("en_US.UTF-8");
    expect(result.TERM).toBe("xterm-256color");
    expect(result.NODE_ENV).toBe("production");
  });

  it("preserves safe custom variables", () => {
    const env = {
      PATH: "/usr/bin",
      MY_APP_DEBUG: "true",
      CUSTOM_VAR: "value",
    };
    const result = buildSafeEnv(env);
    expect(result.MY_APP_DEBUG).toBe("true");
    expect(result.CUSTOM_VAR).toBe("value");
  });

  it("handles AWS partial matches correctly", () => {
    const env = {
      AWS_REGION: "us-east-1",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_SESSION_TOKEN: "token",
      AWS_PROFILE: "default",
    };
    const result = buildSafeEnv(env);
    expect(result.AWS_REGION).toBe("us-east-1");
    expect(result.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(result.AWS_SESSION_TOKEN).toBeUndefined();
    expect(result.AWS_PROFILE).toBe("default");
  });

  // --- toolAllowlist tests ---

  const allowlistEnv = {
    PATH: "/usr/bin",
    HOME: "/home/user",
    ANTHROPIC_API_KEY: "sk-ant-123",
    BRAVE_API_KEY: "BSA-abc",
    REDDIT_SECRET: "secret123",
    NORMAL_VAR: "hello",
    DATABASE_URL: "postgres://x",
    AWS_SECRET_ACCESS_KEY: "aws-secret",
  };

  it("allows ANTHROPIC_API_KEY when in toolAllowlist", () => {
    const safe = buildSafeEnv(allowlistEnv, ["ANTHROPIC_API_KEY"]);
    expect(safe.ANTHROPIC_API_KEY).toBe("sk-ant-123");
  });

  it("allows BRAVE_API_KEY when in toolAllowlist", () => {
    const safe = buildSafeEnv(allowlistEnv, ["BRAVE_API_KEY"]);
    expect(safe.BRAVE_API_KEY).toBe("BSA-abc");
  });

  it("allows multiple keys from toolAllowlist", () => {
    const safe = buildSafeEnv(allowlistEnv, ["ANTHROPIC_API_KEY", "REDDIT_SECRET"]);
    expect(safe.ANTHROPIC_API_KEY).toBe("sk-ant-123");
    expect(safe.REDDIT_SECRET).toBe("secret123");
  });

  it("still blocks non-allowlisted secrets with toolAllowlist", () => {
    const safe = buildSafeEnv(allowlistEnv, ["ANTHROPIC_API_KEY"]);
    expect(safe.DATABASE_URL).toBeUndefined();
    expect(safe.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("works with empty allowlist (same as no allowlist)", () => {
    const safe = buildSafeEnv(allowlistEnv, []);
    expect(safe.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("preserves always-allow vars regardless of allowlist", () => {
    const safe = buildSafeEnv(allowlistEnv, ["ANTHROPIC_API_KEY"]);
    expect(safe.PATH).toBe("/usr/bin");
    expect(safe.HOME).toBe("/home/user");
    expect(safe.NORMAL_VAR).toBe("hello");
  });
});
