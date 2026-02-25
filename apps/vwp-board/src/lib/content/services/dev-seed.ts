import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { IngestRequest } from "../schemas";
import { ingestContent } from "./ingest-service";

export function seedContentSample(db: DatabaseSync): { runId: string; ideaIds: string[]; packetIds: string[] } {
  const runId = `seed-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const ideaIds = [randomUUID(), randomUUID(), randomUUID()];
  const packetIds = [randomUUID(), randomUUID()];

  const payload: IngestRequest = {
    run: {
      id: runId,
      trigger_type: "manual",
      status: "completed",
      objective: "Seed Mission Control sample content",
      result_summary: "Inserted sample runs, ideas, packets, and tool events",
    },
    ideas: [
      {
        id: ideaIds[0],
        source_run_id: runId,
        title: "3 Hidden Costs of AI Automation (and how to avoid them)",
        status: "shortlisted",
        priority_rank: 1,
        score_demand: 8.4,
        score_novelty: 7.2,
        score_authority_fit: 8.8,
        score_difficulty: 4.2,
        score_sub_conversion: 8.1,
        rationale_summary: "Pain-point framing with high conversion potential.",
        recommended_next_action: "approve",
      },
      {
        id: ideaIds[1],
        source_run_id: runId,
        title: "Behind-the-scenes: agent handoff failures and recovery playbook",
        status: "new",
        priority_rank: 2,
        score_demand: 7.1,
        score_novelty: 8.9,
        score_authority_fit: 8.5,
        score_difficulty: 5.9,
        score_sub_conversion: 7.4,
        rationale_summary: "Trust-building post with transparent learnings.",
        recommended_next_action: "generate_beatsheet",
      },
      {
        id: ideaIds[2],
        source_run_id: runId,
        title: "Weekly operations teardown: where 10 hours were saved",
        status: "new",
        priority_rank: 3,
        score_demand: 6.9,
        score_novelty: 6.8,
        score_authority_fit: 8.2,
        score_difficulty: 3.8,
        score_sub_conversion: 6.6,
        rationale_summary: "Recurring series candidate with compounding retention.",
        recommended_next_action: "defer",
      },
    ],
    packets: [
      {
        id: packetIds[0],
        source_run_id: runId,
        packet_type: "topic_shortlist",
        title: "Top Topic Shortlist",
        summary: "Prioritized ideas based on fixed-weight scoring model.",
        recommendations: [
          "Approve rank #1 immediately",
          "Generate beat sheet for rank #2",
        ],
        evidence: {
          audienceSignals: ["ops bottlenecks", "automation skepticism"],
          priorPostPerformance: "Strong saves on diagnostic content",
        },
        decision_rationale: "Rank #1 optimizes demand and conversion while remaining executable this week.",
        debug_notes: { scoringVersion: "fixed-v1", confidence: 0.78 },
        next_action: "approve",
      },
      {
        id: packetIds[1],
        source_run_id: runId,
        packet_type: "beat_sheet",
        title: "Beat Sheet Draft — Hidden Costs of AI Automation",
        summary: "7-beat structure for a 6-8 minute video.",
        recommendations: ["Hook with real mistake", "Close with checklist CTA"],
        evidence: ["recent comments request specifics", "high retention on mistake stories"],
        decision_rationale: "Balances authority with practical specificity.",
        debug_notes: ["Need examples from last 30 days run logs"],
        next_action: "approve",
        artifact_path: null,
      },
    ],
    toolEvents: [
      {
        id: randomUUID(),
        run_id: runId,
        tool_name: "web_search",
        task_type: "topic_discovery",
        result_quality: 4,
        reliability: 4,
        time_saved_est: "45m",
      },
      {
        id: randomUUID(),
        run_id: runId,
        tool_name: "docs_search",
        task_type: "evidence_collection",
        result_quality: 5,
        reliability: 5,
        time_saved_est: "30m",
      },
    ],
  };

  ingestContent(db, payload);
  return { runId, ideaIds, packetIds };
}
