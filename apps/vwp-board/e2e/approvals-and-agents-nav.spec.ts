import { test, expect } from "@playwright/test";

test.describe("Approvals + Agents nav regression", () => {
  test("/approvals does not stay stuck on loading", async ({ page }) => {
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
    // Core regression assertion: page must not remain in perpetual loading state.
    await expect(page.getByText("Loading approvals…")).toBeHidden({ timeout: 15000 });
  });

  test("desktop Agents button from non-board route navigates to /board", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/activity");

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    const agentsBtn = sidebar.getByRole("button", {
      name: /open agents panel|close agents panel/i,
    });
    await agentsBtn.click();

    await expect(page).toHaveURL(/\/board/);
  });
});
