import { test, expect } from "@playwright/test";

test.describe("Calendar page", () => {
  test("route remains reachable and calendar nav link visible", async ({ page }) => {
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

    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.getByRole("link", { name: "Calendar" }).first()).toBeVisible();
  });
});
