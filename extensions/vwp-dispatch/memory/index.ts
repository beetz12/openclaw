export { createMemoryClient } from "./notebooklm-client.js";
export type {
  MemoryClient,
  TaskOutcome,
  PastTaskSummary,
  LearnedPattern,
} from "./notebooklm-client.js";

export { MemorySync } from "./memory-sync.js";

export { enrichDecomposition, formatEnrichmentPrompt } from "./memory-enrichment.js";
export type { EnrichmentContext } from "./memory-enrichment.js";
