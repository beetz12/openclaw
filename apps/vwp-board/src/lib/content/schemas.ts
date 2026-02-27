import { z } from "zod";

export const runTriggerTypeSchema = z.enum(["heartbeat", "cron", "manual"]);
export const runStatusSchema = z.enum(["started", "completed", "failed"]);
export const ideaStatusSchema = z.enum(["new", "shortlisted", "approved", "in_production", "published", "dropped"]);
export const packetTypeSchema = z.enum([
  "topic_shortlist",
  "thumbnail_brief",
  "beat_sheet",
  "repurpose_pack",
  "competitor_teardown",
  "analytics_review",
]);
export const actionTypeSchema = z.enum([
  "approve",
  "defer",
  "reject",
  "generate_beatsheet",
  "generate_thumbnail",
  "generate_repurpose",
  "note",
]);

const isoDate = z.string().datetime({ offset: true });

export const runSchema = z.object({
  id: z.string().min(1),
  created_at: isoDate.optional(),
  completed_at: isoDate.optional().nullable(),
  trigger_type: runTriggerTypeSchema,
  trigger_ref: z.string().optional().nullable(),
  status: runStatusSchema.default("completed"),
  objective: z.string().optional().nullable(),
  tool_used: z.string().optional().nullable(),
  why_chosen: z.string().optional().nullable(),
  result_summary: z.string().optional().nullable(),
  improvement_needed: z.string().optional().nullable(),
});

export const ideaSchema = z.object({
  id: z.string().min(1),
  created_at: isoDate.optional(),
  updated_at: isoDate.optional(),
  source_run_id: z.string().min(1),
  title: z.string().min(1),
  topic_key: z.string().optional().nullable(),
  status: ideaStatusSchema.default("new"),
  priority_rank: z.number().int().optional().nullable(),
  score_demand: z.number().min(0).max(10),
  score_novelty: z.number().min(0).max(10),
  score_authority_fit: z.number().min(0).max(10),
  score_difficulty: z.number().min(0).max(10),
  score_sub_conversion: z.number().min(0).max(10),
  score_total: z.number().min(0).max(10).optional(),
  rationale_summary: z.string().optional().nullable(),
  debug_notes: z.unknown().optional(),
  recommended_next_action: z.string().optional().nullable(),
});

export const packetSchema = z.object({
  id: z.string().min(1),
  created_at: isoDate.optional(),
  source_run_id: z.string().min(1),
  packet_type: packetTypeSchema,
  title: z.string().min(1),
  summary: z.string().optional().nullable(),
  recommendations: z.unknown().optional(),
  evidence: z.unknown().optional(),
  decision_rationale: z.string().optional().nullable(),
  debug_notes: z.unknown().optional(),
  next_action: z.string().optional().nullable(),
  artifact_path: z.string().optional().nullable(),
});

export const toolEventSchema = z.object({
  id: z.string().min(1),
  created_at: isoDate.optional(),
  run_id: z.string().min(1),
  tool_name: z.string().min(1),
  task_type: z.string().optional().nullable(),
  result_quality: z.number().int().min(1).max(5).optional().nullable(),
  reliability: z.number().int().min(1).max(5).optional().nullable(),
  time_saved_est: z.string().optional().nullable(),
});

export const contentActionRequestSchema = z.object({
  id: z.string().min(1).optional(),
  idea_id: z.string().min(1),
  actor: z.string().min(1).default("mission-control-ui"),
  action_type: actionTypeSchema,
  note: z.string().optional().nullable(),
});

export const ideaStatusUpdateSchema = z.object({
  status: ideaStatusSchema,
  note: z.string().optional().nullable(),
  actor: z.string().min(1).default("mission-control-ui"),
});

export const ingestRequestSchema = z
  .object({
    run: runSchema,
    ideas: z.array(ideaSchema).optional(),
    packets: z.array(packetSchema).optional(),
    toolEvents: z.array(toolEventSchema).optional(),
    tool_events: z.array(toolEventSchema).optional(),
  })
  .transform((payload) => ({
    run: payload.run,
    ideas: payload.ideas ?? [],
    packets: payload.packets ?? [],
    toolEvents: payload.toolEvents ?? payload.tool_events ?? [],
  }));

export const ideasQuerySchema = z.object({
  status: ideaStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const packetsQuerySchema = z.object({
  type: packetTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const runsQuerySchema = z.object({
  trigger_type: runTriggerTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const actionsQuerySchema = z.object({
  idea_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type ContentActionRequest = z.infer<typeof contentActionRequestSchema>;
export type IdeaStatusUpdateRequest = z.infer<typeof ideaStatusUpdateSchema>;
export type IdeaInput = z.infer<typeof ideaSchema>;
export type PacketInput = z.infer<typeof packetSchema>;
export type RunInput = z.infer<typeof runSchema>;
export type ToolEventInput = z.infer<typeof toolEventSchema>;
