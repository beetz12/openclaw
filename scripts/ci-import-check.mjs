#!/usr/bin/env node

import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const imports = [
  "src/gateway/http-utils.js",
  "src/security/secret-equal.js",
  "src/process/exec.js",
  "src/agents/cli-runner.js",
];

let failed = false;

console.log("[nexclaw] Checking extension upstream import paths...\n");

for (const imp of imports) {
  // Check both .js and .ts variants (source vs built)
  const tsPath = resolve(root, imp.replace(/\.js$/, ".ts"));
  const jsPath = resolve(root, "dist", imp);
  const srcJsPath = resolve(root, imp);

  if (existsSync(tsPath) || existsSync(jsPath) || existsSync(srcJsPath)) {
    console.log(`  [+] ${imp}`);
  } else {
    console.log(`  [x] ${imp} — NOT FOUND`);
    failed = true;
  }
}

console.log("");

if (failed) {
  console.log("FAIL: Some upstream imports cannot be resolved.");
  console.log("Update extensions/vwp-dispatch/upstream-imports.ts with the new paths.");
  process.exit(1);
} else {
  console.log("PASS: All upstream imports resolve.");
}
