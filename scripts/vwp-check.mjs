#!/usr/bin/env node

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const checks = [];
let hasFailure = false;

function check(name, fn) {
  try {
    const result = fn();
    checks.push({ name, status: "PASS", detail: result });
  } catch (e) {
    checks.push({ name, status: "FAIL", detail: e.message });
    hasFailure = true;
  }
}

// 1. Config file exists
const configDir = process.env.OPENCLAW_STATE_DIR || resolve(process.env.HOME, ".openclaw-dev");
const configFile = resolve(configDir, "openclaw.json");

check("Config file exists", () => {
  if (!existsSync(configFile)) {
    throw new Error(`Not found: ${configFile}. Run: bash scripts/setup-dev.sh`);
  }
  return configFile;
});

// 2. Required config keys
check("Model configured", () => {
  const config = JSON.parse(readFileSync(configFile, "utf8"));
  const model = config?.agents?.defaults?.model?.primary;
  if (!model) {
    throw new Error("agents.defaults.model.primary not set in config");
  }
  return model;
});

// 3. CLI backend accessible
check("Claude CLI accessible", () => {
  try {
    execSync("which claude", { stdio: "pipe" });
    return "claude binary found";
  } catch {
    throw new Error("claude binary not found in PATH");
  }
});

// 4. Gateway port available
check("Gateway port (19001) available", () => {
  try {
    const result = execSync("lsof -ti:19001", { stdio: "pipe" }).toString().trim();
    if (result) {
      return `Port in use by PID ${result} (gateway may be running)`;
    }
  } catch {
    return "Port available";
  }
});

// 5. Build output exists
check("Build output exists", () => {
  if (!existsSync(resolve("dist/entry.js")) && !existsSync(resolve("dist/entry.mjs"))) {
    throw new Error("dist/entry.js not found. Run: pnpm build");
  }
  return "dist/entry.js found";
});

// 6. Global nexclaw command availability
check("Global nexclaw available", () => {
  try {
    const path = execSync("command -v nexclaw", { stdio: "pipe" }).toString().trim();
    if (!path) {
      throw new Error("nexclaw not found on PATH");
    }
    return path;
  } catch {
    throw new Error("nexclaw not found on PATH (run: pnpm nexclaw:global)");
  }
});

// Print results
console.log("\n[nexclaw] Environment Check\n");
for (const c of checks) {
  const icon = c.status === "PASS" ? "+" : "x";
  console.log(`  [${icon}] ${c.name}: ${c.detail}`);
}
console.log("");

if (hasFailure) {
  console.log("Some checks failed. Fix the issues above and re-run: pnpm vwp:check\n");
  process.exit(1);
} else {
  console.log("All checks passed.\n");
}
