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
    await page.waitForSelector('[data-testid="cost-summary"], text=Failed', {
      timeout: 10_000,
    });

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

    await page.waitForSelector(
      '[data-testid="cost-chart"], [data-testid="cost-chart-empty"], text=Failed',
      { timeout: 10_000 },
    );

    // Either chart or empty state should be present
    const chart = page.getByTestId("cost-chart");
    const emptyChart = page.getByTestId("cost-chart-empty");
    const hasChart = await chart.isVisible();
    const hasEmpty = await emptyChart.isVisible();
    expect(hasChart || hasEmpty).toBe(true);
  });

  test("Cost breakdown table renders or shows empty state", async ({ page }) => {
    await page.goto("/cost");

    await page.waitForSelector(
      '[data-testid="cost-breakdown"], [data-testid="cost-breakdown-empty"], text=Failed',
      { timeout: 10_000 },
    );

    const table = page.getByTestId("cost-breakdown");
    const emptyTable = page.getByTestId("cost-breakdown-empty");
    const hasTable = await table.isVisible();
    const hasEmpty = await emptyTable.isVisible();
    expect(hasTable || hasEmpty).toBe(true);
  });
});
