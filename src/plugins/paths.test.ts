import path from "node:path";
import { describe, expect, it } from "vitest";
import { STATE_DIR } from "../config/paths.js";
import { resolvePluginDataDir, resolvePluginPath } from "./paths.js";

describe("resolvePluginPath", () => {
  it("resolves relative paths against STATE_DIR, not cwd", () => {
    const result = resolvePluginPath("vwp-approval.sqlite");
    expect(result).toBe(path.join(STATE_DIR, "vwp-approval.sqlite"));
  });

  it("preserves absolute paths", () => {
    expect(resolvePluginPath("/var/data/my.db")).toBe("/var/data/my.db");
  });

  it("expands tilde paths", () => {
    const result = resolvePluginPath("~/my-plugin/data.db");
    expect(result).toMatch(/^\/.*my-plugin\/data\.db$/);
  });

  it("returns empty for blank input", () => {
    expect(resolvePluginPath("")).toBe("");
    expect(resolvePluginPath("   ")).toBe("");
  });
});

describe("resolvePluginDataDir", () => {
  it("returns STATE_DIR/plugins/{id}", () => {
    expect(resolvePluginDataDir("vwp-approval")).toBe(
      path.join(STATE_DIR, "plugins", "vwp-approval"),
    );
  });
});
