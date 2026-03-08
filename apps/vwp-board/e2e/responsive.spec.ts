import { test, expect } from "@playwright/test";

test.describe("Responsive layouts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
  });

  const sidebar = (page: import("@playwright/test").Page) => page.getByRole("complementary");
  const mobileNav = (page: import("@playwright/test").Page) => page.locator("nav").last();

  test("Mobile viewport (375px) shows mobile layout", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/board");

    // Mobile tab bar should be visible with core tabs
    await expect(mobileNav(page)).toBeVisible();
    await expect(mobileNav(page).getByRole("link", { name: /^Board$/ })).toBeVisible();
    await expect(mobileNav(page).getByRole("link", { name: /^Tools$/ })).toBeVisible();
  });

  test("Desktop viewport (1920px) shows desktop layout", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/board");

    await expect(sidebar(page)).toBeVisible();

    // Sidebar should contain "VWP Board" heading
    await expect(sidebar(page).getByText("VWP Board")).toBeVisible();
  });

  test("Tablet viewport (768px) triggers breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/board");

    // At 768px the md breakpoint is active, so the desktop sidebar should render.
    await expect(sidebar(page)).toBeVisible();
  });
});
