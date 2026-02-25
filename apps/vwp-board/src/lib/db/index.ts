import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrate";
import { getDbPath } from "./paths";

let dbSingleton: DatabaseSync | null = null;
let initialized = false;

export function getDb(): DatabaseSync {
  if (!dbSingleton) {
    const dbPath = getDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    dbSingleton = new DatabaseSync(dbPath);
    dbSingleton.exec("PRAGMA foreign_keys = ON;");
    dbSingleton.exec("PRAGMA journal_mode = WAL;");
  }

  if (!initialized) {
    runMigrations();
    initialized = true;
  }

  return dbSingleton;
}
