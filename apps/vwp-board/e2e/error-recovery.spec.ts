import { test, expect } from "@playwright/test";

test.describe("Error Recovery", () => {
  test.beforeEach(async ({ page }) => {
    // Keep onboarding guard satisfied
    await page.route("**/vwp/onboarding", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ completed: true }),
        });
      }
      return route.continue();
    });

    // Deterministic backend failure for board/cost data endpoints
    await page.route("**/vwp/dispatch/**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "dispatch unavailable" }),
      }),
    );
    await page.route("**/vwp/cost/**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "dispatch unavailable" }),
      }),
    );

    await page.goto("/board");
  });

  test("board page shows error state when API is unavailable", async ({ page }) => {
    await page.goto("/board");
    await expect(page.getByText("dispatch unavailable")).toBeVisible();
  });

  test("board error state has Retry button", async ({ page }) => {
    await page.goto("/board");
    await expect(page.getByText("dispatch unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible();
  });

  test("cost page shows error state when API is unavailable", async ({ page }) => {
    await page.goto("/cost");
    await expect(page.getByText("dispatch unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible();
  });

  test("retry button keeps error state when backend is still unavailable", async ({ page }) => {
    await page.goto("/board");
    const retryButton = page.getByRole("button", { name: /Retry/i });
    await expect(retryButton).toBeVisible();

    await retryButton.click();

    await expect(page.getByText("dispatch unavailable")).toBeVisible();
    await expect(retryButton).toBeVisible();
  });
});
