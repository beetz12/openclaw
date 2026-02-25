import { test, expect } from "@playwright/test";

test.describe("Approvals summary", () => {
  test("approvals route remains reachable and does not hang on loading", async ({ page }) => {
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

    await page.goto("/approvals");
    await expect(page).toHaveURL(/\/approvals/);
    await expect(page.getByText("Loading approvals…")).toBeHidden({ timeout: 15000 });
  });
});
