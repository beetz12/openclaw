#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { homedir } from "os";
import { dirname, resolve } from "path";

const stateDir = process.env.OPENCLAW_STATE_DIR || resolve(homedir(), ".openclaw-dev");
const configPath = resolve(stateDir, "openclaw.json");

function ensureDir(p) {
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
  }
}

function migrateConfig() {
  ensureDir(stateDir);
  if (!existsSync(configPath)) {
    console.log(`[migrate] config not found at ${configPath}; skipping config migration`);
    return false;
  }

  // Keep migration schema-safe: do not inject unknown top-level keys.
  // Activity-feed defaults are implemented in app/runtime code paths.
  console.log("[migrate] schema-safe mode: no config key injection required");
  return false;
}

function scaffoldTaskFiles() {
  const tasksRoot = resolve(homedir(), ".openclaw", "vwp", "tasks");
  if (!existsSync(tasksRoot)) {
    console.log(`[migrate] tasks root not found at ${tasksRoot}; skipping task backfill`);
    return 0;
  }

  const ids = readdirSync(tasksRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  let touched = 0;
  for (const id of ids) {
    const activityPath = resolve(tasksRoot, id, "activity.json");
    if (!existsSync(activityPath)) {
      ensureDir(dirname(activityPath));
      writeFileSync(activityPath, "[]\n");
      touched += 1;
    }
  }
  console.log(`[migrate] backfilled activity.json for ${touched} tasks`);
  return touched;
}

migrateConfig();
scaffoldTaskFiles();
console.log("[migrate] done");
