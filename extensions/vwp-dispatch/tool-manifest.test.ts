import { describe, it, expect } from "vitest";

const { loadToolManifest, validateManifest, discoverTools } = await import("./tool-manifest.ts");

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    const manifest = {
      name: "reddit_scout",
      label: "Reddit Intelligence",
      description: "Research Reddit",
      category: "research",
      entrypoint: "reddit_scout.py",
      runtime: "python3",
      args_schema: {
        topic: { type: "string", required: true, label: "Topic" },
      },
      env_allowlist: ["BRAVE_API_KEY"],
      outputs: ["reports/"],
      timeout_seconds: 300,
      max_output_bytes: 10485760,
    };
    const result = validateManifest(manifest, "/fake/tools/content-suite");
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects manifest with missing required fields", () => {
    const result = validateManifest({ name: "test" }, "/fake/path");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects manifest with path traversal in entrypoint", () => {
    const manifest = {
      name: "evil",
      label: "Evil",
      description: "Bad",
      category: "research",
      entrypoint: "../../../etc/passwd",
      runtime: "python3",
      args_schema: {},
      env_allowlist: [],
      outputs: [],
      timeout_seconds: 60,
      max_output_bytes: 1048576,
    };
    const result = validateManifest(manifest, "/fake/tools/evil");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("entrypoint must not contain path traversal");
  });

  it("rejects manifest with path traversal in outputs", () => {
    const manifest = {
      name: "evil",
      label: "Evil",
      description: "Bad",
      category: "research",
      entrypoint: "main.py",
      runtime: "python3",
      args_schema: {},
      env_allowlist: [],
      outputs: ["../../etc/"],
      timeout_seconds: 60,
      max_output_bytes: 1048576,
    };
    const result = validateManifest(manifest, "/fake/tools/evil");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("path traversal"))).toBe(true);
  });

  it("rejects unsupported runtime", () => {
    const manifest = {
      name: "test",
      label: "Test",
      description: "Test",
      category: "research",
      entrypoint: "main.sh",
      runtime: "bash",
      args_schema: {},
      env_allowlist: [],
      outputs: [],
      timeout_seconds: 60,
      max_output_bytes: 1048576,
    };
    const result = validateManifest(manifest, "/fake/path");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("runtime"))).toBe(true);
  });
});

describe("loadToolManifest", () => {
  it("returns null for non-existent path", async () => {
    const result = await loadToolManifest("/nonexistent/tool.json");
    expect(result).toBeNull();
  });
});
