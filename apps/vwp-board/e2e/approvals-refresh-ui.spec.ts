import { test, expect } from "@playwright/test";

test.describe("Approvals refresh UI", () => {
  test("approvals route stays reachable and does not remain in loading state", async ({ page }) => {
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

    await page.route("**/vwp/pending**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], total: 0, hasMore: false, limit: 100, offset: 0 }),
        });
      }
      return route.continue();
    });

    await page.goto("/approvals");
    await expect(page).toHaveURL(/\/approvals/);
    await expect(page.getByText("Loading approvals…")).toBeHidden({ timeout: 15000 });
  });
});
