export type ScoreInput = {
  demand: number;
  novelty: number;
  authority_fit: number;
  difficulty: number;
  sub_conversion: number;
};

const WEIGHTS = {
  demand: 0.3,
  novelty: 0.2,
  authority_fit: 0.2,
  difficulty: 0.1,
  sub_conversion: 0.2,
} as const;

export function computeFixedScore(input: ScoreInput): number {
  const total =
    WEIGHTS.demand * input.demand +
    WEIGHTS.novelty * input.novelty +
    WEIGHTS.authority_fit * input.authority_fit +
    WEIGHTS.difficulty * input.difficulty +
    WEIGHTS.sub_conversion * input.sub_conversion;

  return Math.round(total * 1000) / 1000;
}
