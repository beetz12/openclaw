import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TeamConfig } from "./team-types.js";

export type OnboardingState = {
  completed: boolean;
  completedAt: number;
  businessType: "consulting" | "ecommerce" | "custom";
  businessName: string;
  userName: string;
};

const KEY_ONBOARDING = "onboarding";
const KEY_TEAM = "team";

export class VwpConfigStore {
  private db: DatabaseSync;
  private onboardingFile?: string;
  private teamFile?: string;

  constructor(dbPath: string, opts?: { onboardingFile?: string; teamFile?: string }) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.onboardingFile = opts?.onboardingFile;
    this.teamFile = opts?.teamFile;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vwp_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    this.migrateFromLegacyFiles();
  }

  private getJson<T>(key: string): T | null {
    const row = this.db.prepare("SELECT value FROM vwp_kv WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  private setJson(key: string, value: unknown): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO vwp_kv (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), now);
  }

  private deleteKey(key: string): void {
    this.db.prepare("DELETE FROM vwp_kv WHERE key = ?").run(key);
  }

  private migrateFromLegacyFiles(): void {
    const hasOnboarding = this.getJson<OnboardingState>(KEY_ONBOARDING) !== null;
    const hasTeam = this.getJson<TeamConfig>(KEY_TEAM) !== null;

    if (!hasOnboarding && this.onboardingFile && existsSync(this.onboardingFile)) {
      try {
        const raw = readFileSync(this.onboardingFile, "utf-8");
        const parsed = JSON.parse(raw) as OnboardingState;
        if (parsed?.completed) {
          this.setJson(KEY_ONBOARDING, parsed);
        }
      } catch {
        // ignore legacy parse failures
      }
    }

    if (!hasTeam && this.teamFile && existsSync(this.teamFile)) {
      try {
        const raw = readFileSync(this.teamFile, "utf-8");
        const parsed = JSON.parse(raw) as TeamConfig;
        if (parsed?.businessType && Array.isArray(parsed.members)) {
          this.setJson(KEY_TEAM, parsed);
        }
      } catch {
        // ignore legacy parse failures
      }
    }
  }

  getOnboarding(): OnboardingState | null {
    return this.getJson<OnboardingState>(KEY_ONBOARDING);
  }

  saveOnboarding(data: OnboardingState): void {
    this.setJson(KEY_ONBOARDING, data);
  }

  getTeam(): TeamConfig | null {
    return this.getJson<TeamConfig>(KEY_TEAM);
  }

  saveTeam(config: TeamConfig): void {
    this.setJson(KEY_TEAM, config);
  }

  reset(): void {
    this.deleteKey(KEY_ONBOARDING);
    this.deleteKey(KEY_TEAM);

    // Best-effort legacy cleanup for compatibility.
    try {
      if (this.onboardingFile && existsSync(this.onboardingFile)) unlinkSync(this.onboardingFile);
    } catch {
      // ignore
    }
    try {
      if (this.teamFile && existsSync(this.teamFile)) unlinkSync(this.teamFile);
    } catch {
      // ignore
    }
  }
}
