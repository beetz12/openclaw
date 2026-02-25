import { test, expect } from "@playwright/test";

test.describe("Activity page", () => {
  test("route loads and keeps activity navigation reachable", async ({ page }) => {
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

    await page.goto("/activity");
    await expect(page).toHaveURL(/\/activity/);
    await expect(page.getByRole("link", { name: "Activity" }).first()).toBeVisible();
  });
});
