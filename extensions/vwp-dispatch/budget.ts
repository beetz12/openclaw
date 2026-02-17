/**
 * Budget enforcement — ensures tasks stay within configured cost limits.
 *
 * Supports:
 * - Per-task maximum cost
 * - Monthly spending caps
 */

export type BudgetConfig = {
  /** Maximum cost per individual task (USD). */
  perTaskMaxUsd?: number;
  /** Maximum total spending per calendar month (USD). */
  monthlyMaxUsd?: number;
};

export type BudgetCheckResult = {
  /** Whether the task is allowed to proceed. */
  allowed: boolean;
  /** Human-readable reason if denied. */
  reason?: string;
};

/**
 * Check if a task with the given estimated cost can proceed within budget limits.
 *
 * @param estimatedCostUsd - The estimated cost of the task to be executed
 * @param monthlySpentUsd - Total amount already spent this calendar month
 * @param config - Budget configuration with optional per-task and monthly limits
 * @returns Result indicating whether the task is allowed and reason if not
 */
export function checkBudget(
  estimatedCostUsd: number,
  monthlySpentUsd: number,
  config: BudgetConfig,
): BudgetCheckResult {
  // Check per-task limit
  if (config.perTaskMaxUsd !== undefined && estimatedCostUsd > config.perTaskMaxUsd) {
    return {
      allowed: false,
      reason: `Estimated cost $${estimatedCostUsd.toFixed(2)} exceeds per-task limit of $${config.perTaskMaxUsd.toFixed(2)}`,
    };
  }

  // Check monthly limit
  if (config.monthlyMaxUsd !== undefined) {
    const projectedTotal = monthlySpentUsd + estimatedCostUsd;
    if (projectedTotal > config.monthlyMaxUsd) {
      return {
        allowed: false,
        reason: `Projected monthly spend $${projectedTotal.toFixed(2)} exceeds monthly limit of $${config.monthlyMaxUsd.toFixed(2)} (already spent $${monthlySpentUsd.toFixed(2)})`,
      };
    }
  }

  return { allowed: true };
}
