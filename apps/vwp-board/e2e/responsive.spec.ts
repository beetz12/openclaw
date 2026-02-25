import { test, expect } from "@playwright/test";

test.describe("Responsive layouts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
  });

  test("Mobile viewport (375px) shows mobile layout", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/board");

    // Sidebar should be hidden on mobile
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeHidden();

    // Mobile tab bar should be visible with core tabs
    await expect(page.getByRole("link", { name: "Board" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tools" })).toBeVisible();
  });

  test("Desktop viewport (1920px) shows desktop layout", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/board");

    // Sidebar should be visible on desktop
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    // Sidebar should contain "VWP Board" heading
    await expect(sidebar.getByText("VWP Board")).toBeVisible();
  });

  test("Tablet viewport (768px) triggers breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/board");

    // At 768px the md: breakpoint is triggered, sidebar should be visible
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
  });
});
