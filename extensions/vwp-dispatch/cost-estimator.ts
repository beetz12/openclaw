/**
 * Cost estimator — produces conservative token/cost estimates before dispatch.
 *
 * Default pricing uses Sonnet-class rates:
 *   input:  $3 / 1M tokens
 *   output: $15 / 1M tokens
 * We blend at a 3:1 input/output ratio for a weighted average.
 */

import type { CostEstimate, TaskDecomposition } from "./types.js";

// Sonnet-class pricing (USD per token).
const DEFAULT_INPUT_PRICE = 3 / 1_000_000;
const DEFAULT_OUTPUT_PRICE = 15 / 1_000_000;
// Assume ~75 % input, ~25 % output by volume.
const DEFAULT_BLENDED_PRICE = DEFAULT_INPUT_PRICE * 0.75 + DEFAULT_OUTPUT_PRICE * 0.25;

/** Per-agent base token estimates by complexity. */
const PER_AGENT_TOKENS: Record<TaskDecomposition["estimatedComplexity"], number> = {
  low: 50_000,
  medium: 100_000,
  high: 200_000,
};

const ANALYSIS_TOKENS = 2_000;
const SYNTHESIS_TOKENS = 4_000; // conservative overhead for final synthesis

export interface CostEstimatorOptions {
  /** Override blended price-per-token (USD). */
  pricePerToken?: number;
}

export function estimateCost(
  teamSize: number,
  complexity: TaskDecomposition["estimatedComplexity"],
  opts: CostEstimatorOptions = {},
): CostEstimate {
  const price = opts.pricePerToken ?? DEFAULT_BLENDED_PRICE;
  const perAgent = PER_AGENT_TOKENS[complexity];

  const analysisTokens = ANALYSIS_TOKENS;
  const agentTokens = perAgent * teamSize;
  const synthesisTokens = SYNTHESIS_TOKENS;

  const total = analysisTokens + agentTokens + synthesisTokens;

  return {
    estimatedTokens: total,
    estimatedCostUsd: roundUsd(total * price),
    breakdown: {
      analysis: analysisTokens,
      perAgent: agentTokens,
      synthesis: synthesisTokens,
    },
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 10_000) / 10_000; // four decimal places
}
