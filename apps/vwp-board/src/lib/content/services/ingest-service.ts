import type { DatabaseSync } from "node:sqlite";
import { IdeasRepo } from "../repositories/ideas-repo";
import { PacketsRepo } from "../repositories/packets-repo";
import { RunsRepo } from "../repositories/runs-repo";
import { ToolsRepo } from "../repositories/tools-repo";
import type { IngestRequest } from "../schemas";
import { computeFixedScore } from "./scoring";

export type IngestResult = {
  ok: true;
  idempotent: boolean;
  runId: string;
  counts: {
    ideas: number;
    packets: number;
    toolEvents: number;
  };
};

export function ingestContent(db: DatabaseSync, payload: IngestRequest): IngestResult {
  const runsRepo = new RunsRepo(db);
  const ideasRepo = new IdeasRepo(db);
  const packetsRepo = new PacketsRepo(db);
  const toolsRepo = new ToolsRepo(db);

  const existingRun = runsRepo.getById(payload.run.id);
  if (existingRun && existingRun.status === "completed") {
    return {
      ok: true,
      idempotent: true,
      runId: payload.run.id,
      counts: { ideas: 0, packets: 0, toolEvents: 0 },
    };
  }

  db.exec("BEGIN IMMEDIATE;");
  try {
    runsRepo.upsert(payload.run);

    for (const idea of payload.ideas) {
      ideasRepo.upsert({
        ...idea,
        score_total:
          idea.score_total ??
          computeFixedScore({
            demand: idea.score_demand,
            novelty: idea.score_novelty,
            authority_fit: idea.score_authority_fit,
            difficulty: idea.score_difficulty,
            sub_conversion: idea.score_sub_conversion,
          }),
      });
    }

    for (const packet of payload.packets) {
      packetsRepo.upsert(packet);
    }

    for (const event of payload.toolEvents) {
      toolsRepo.insertUsageEvent(event);
    }

    if (payload.run.status !== "completed" && payload.run.status !== "failed") {
      runsRepo.upsert({ ...payload.run, status: "completed", completed_at: new Date().toISOString() });
    }

    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  return {
    ok: true,
    idempotent: false,
    runId: payload.run.id,
    counts: {
      ideas: payload.ideas.length,
      packets: payload.packets.length,
      toolEvents: payload.toolEvents.length,
    },
  };
}
