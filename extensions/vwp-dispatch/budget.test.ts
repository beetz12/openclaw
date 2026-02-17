import { describe, expect, it } from "vitest";
import { checkBudget, type BudgetConfig } from "./budget.js";

describe("checkBudget", () => {
  it("allows task when under per-task limit", () => {
    const config: BudgetConfig = { perTaskMaxUsd: 10.0 };
    const result = checkBudget(5.0, 0, config);

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects task when over per-task limit", () => {
    const config: BudgetConfig = { perTaskMaxUsd: 10.0 };
    const result = checkBudget(15.0, 0, config);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Estimated cost $15.00 exceeds per-task limit of $10.00");
  });

  it("allows task when under monthly limit", () => {
    const config: BudgetConfig = { monthlyMaxUsd: 100.0 };
    const result = checkBudget(25.0, 50.0, config);

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects task when projected monthly spend exceeds limit", () => {
    const config: BudgetConfig = { monthlyMaxUsd: 100.0 };
    const result = checkBudget(30.0, 80.0, config);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      "Projected monthly spend $110.00 exceeds monthly limit of $100.00 (already spent $80.00)",
    );
  });

  it("allows task when no limits are configured", () => {
    const config: BudgetConfig = {};
    const result = checkBudget(1000.0, 5000.0, config);

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("enforces per-task limit even when monthly limit is not exceeded", () => {
    const config: BudgetConfig = {
      perTaskMaxUsd: 5.0,
      monthlyMaxUsd: 100.0,
    };
    const result = checkBudget(10.0, 20.0, config);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("per-task limit");
  });

  it("enforces monthly limit even when per-task limit is not exceeded", () => {
    const config: BudgetConfig = {
      perTaskMaxUsd: 20.0,
      monthlyMaxUsd: 100.0,
    };
    const result = checkBudget(15.0, 90.0, config);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("monthly limit");
  });

  it("handles zero costs", () => {
    const config: BudgetConfig = {
      perTaskMaxUsd: 10.0,
      monthlyMaxUsd: 100.0,
    };
    const result = checkBudget(0, 0, config);

    expect(result.allowed).toBe(true);
  });

  it("handles exact limit match for per-task", () => {
    const config: BudgetConfig = { perTaskMaxUsd: 10.0 };
    const result = checkBudget(10.0, 0, config);

    expect(result.allowed).toBe(true);
  });

  it("handles exact limit match for monthly", () => {
    const config: BudgetConfig = { monthlyMaxUsd: 100.0 };
    const result = checkBudget(25.0, 75.0, config);

    expect(result.allowed).toBe(true);
  });
});
