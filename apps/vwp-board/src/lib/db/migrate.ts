import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDbPath, getMigrationsDir } from "./paths";

type MigrationStatus = {
  applied: string[];
  pending: string[];
};

function openDb(): DatabaseSync {
  const dbPath = getDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

function listMigrationFiles(): string[] {
  return readdirSync(getMigrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .toSorted();
}

function getAppliedSet(db: DatabaseSync): Set<string> {
  const stmt = db.prepare("SELECT id FROM schema_migrations");
  const rows = stmt.all() as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

export function getMigrationStatus(): MigrationStatus {
  const db = openDb();
  try {
    ensureMigrationsTable(db);
    const files = listMigrationFiles();
    const applied = getAppliedSet(db);
    return {
      applied: files.filter((f) => applied.has(f.replace(/\.sql$/, ""))),
      pending: files.filter((f) => !applied.has(f.replace(/\.sql$/, ""))),
    };
  } finally {
    db.close();
  }
}

export function runMigrations(): { appliedNow: string[]; alreadyApplied: string[] } {
  const db = openDb();
  try {
    ensureMigrationsTable(db);
    const files = listMigrationFiles();
    const applied = getAppliedSet(db);
    const insertMigration = db.prepare("INSERT INTO schema_migrations(id, applied_at) VALUES(?, ?)");

    const appliedNow: string[] = [];
    const alreadyApplied: string[] = [];

    for (const file of files) {
      const id = file.replace(/\.sql$/, "");
      if (applied.has(id)) {
        alreadyApplied.push(id);
        continue;
      }

      const sql = readFileSync(join(getMigrationsDir(), file), "utf-8");
      db.exec("BEGIN IMMEDIATE;");
      try {
        db.exec(sql);
        insertMigration.run(id, new Date().toISOString());
        db.exec("COMMIT;");
        appliedNow.push(id);
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
    }

    return { appliedNow, alreadyApplied };
  } finally {
    db.close();
  }
}

export function verifyDatabase(): { ok: boolean; integrity: string } {
  const db = openDb();
  try {
    const row = db.prepare("PRAGMA integrity_check;").get() as { integrity_check?: string };
    const integrity = row.integrity_check ?? "unknown";
    return { ok: integrity === "ok", integrity };
  } finally {
    db.close();
  }
}

function runCli(): void {
  const command = process.argv[2] ?? "status";

  if (command === "migrate") {
    const result = runMigrations();
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }

  if (command === "status") {
    const status = getMigrationStatus();
    console.log(JSON.stringify({ ok: true, ...status }, null, 2));
    return;
  }

  if (command === "verify") {
    const result = verifyDatabase();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {process.exitCode = 1;}
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  runCli();
}
