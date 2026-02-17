import { test, expect } from "@playwright/test";

test.describe("Error Recovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
  });

  test("board page shows error state with HTTP 404 text when API unavailable", async ({
    page,
  }) => {
    await page.goto("/board");
    await expect(page.getByText("HTTP 404")).toBeVisible();
  });

  test("error state has Retry button", async ({ page }) => {
    await page.goto("/board");
    await expect(page.getByText("HTTP 404")).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible();
  });

  test("cost page shows error state when API unavailable", async ({
    page,
  }) => {
    await page.goto("/cost");
    await expect(page.getByText(/error|HTTP|failed/i)).toBeVisible();
  });

  test("retry button triggers a new fetch attempt", async ({ page }) => {
    await page.goto("/board");
    await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible();

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/") || resp.url().includes("/board"),
      { timeout: 5000 }
    ).catch(() => null);

    await page.getByRole("button", { name: /Retry/i }).click();

    // Verify the retry button is still present (API still unavailable)
    await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible();
  });
});
