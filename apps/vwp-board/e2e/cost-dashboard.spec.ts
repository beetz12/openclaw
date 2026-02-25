import { test, expect } from "@playwright/test";

test.describe("Cost dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cost");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
  });

  test("Cost page renders heading and range selector", async ({ page }) => {
    await page.goto("/cost");

    await expect(page.getByText("Cost Dashboard")).toBeVisible();

    // Date range buttons
    await expect(page.getByTestId("range-7d")).toBeVisible();
    await expect(page.getByTestId("range-30d")).toBeVisible();
    await expect(page.getByTestId("range-all")).toBeVisible();
  });

  test("Cost page renders summary cards", async ({ page }) => {
    await page.goto("/cost");

    // Wait for loading to finish (either summary or error renders)
    await expect
      .poll(async () => {
        const hasSummary = await page.getByTestId("cost-summary").isVisible().catch(() => false);
        const hasError = await page.getByText(/failed|dispatch unavailable/i).first().isVisible().catch(() => false);
        return hasSummary || hasError;
      }, { timeout: 10_000 })
      .toBe(true);

    // If summary loaded, check for stat cards
    const summary = page.getByTestId("cost-summary");
    if (await summary.isVisible()) {
      await expect(page.getByTestId("stat-total-spend")).toBeVisible();
      await expect(page.getByTestId("stat-tasks-completed")).toBeVisible();
      await expect(page.getByTestId("stat-avg-cost-per-task")).toBeVisible();
      await expect(page.getByTestId("stat-total-tokens")).toBeVisible();
    }
  });

  test("Cost chart renders or shows empty state", async ({ page }) => {
    await page.goto("/cost");

    await expect
      .poll(async () => {
        const hasChart = await page.getByTestId("cost-chart").isVisible().catch(() => false);
        const hasEmptyChart = await page.getByTestId("cost-chart-empty").isVisible().catch(() => false);
        const hasError = await page.getByText(/failed|dispatch unavailable/i).first().isVisible().catch(() => false);
        return hasChart || hasEmptyChart || hasError;
      }, { timeout: 10_000 })
      .toBe(true);

    // Either chart or empty state should be present
    const chart = page.getByTestId("cost-chart");
    const emptyChart = page.getByTestId("cost-chart-empty");
    const hasChart = await chart.isVisible();
    const hasEmpty = await emptyChart.isVisible();
    expect(hasChart || hasEmpty).toBe(true);
  });

  test("Cost breakdown table renders or shows empty state", async ({ page }) => {
    await page.goto("/cost");

    await expect
      .poll(async () => {
        const hasTable = await page.getByTestId("cost-breakdown").isVisible().catch(() => false);
        const hasEmptyTable = await page.getByTestId("cost-breakdown-empty").isVisible().catch(() => false);
        const hasError = await page.getByText(/failed|dispatch unavailable/i).first().isVisible().catch(() => false);
        return hasTable || hasEmptyTable || hasError;
      }, { timeout: 10_000 })
      .toBe(true);

    const table = page.getByTestId("cost-breakdown");
    const emptyTable = page.getByTestId("cost-breakdown-empty");
    const hasTable = await table.isVisible();
    const hasEmpty = await emptyTable.isVisible();
    expect(hasTable || hasEmpty).toBe(true);
  });
});
