import { homedir } from "node:os";
import { join } from "node:path";

export function getStateDir(): string {
  return process.env.OPENCLAW_STATE_DIR ?? join(homedir(), ".openclaw", "state");
}

export function getDbPath(): string {
  return process.env.MISSION_CONTROL_CONTENT_DB_PATH ?? join(getStateDir(), "mission-control-content.sqlite");
}

export function getMigrationsDir(): string {
  return join(process.cwd(), "src", "lib", "db", "migrations");
}
