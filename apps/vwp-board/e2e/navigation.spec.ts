import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
    await page.goto("/board");
  });

  const sidebar = (page: import("@playwright/test").Page) => page.getByRole("complementary");
  const mobileNav = (page: import("@playwright/test").Page) => page.locator("nav").last();

  test("sidebar shows VWP Board heading with core nav links on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(sidebar(page)).toBeVisible();
    await expect(sidebar(page).getByText("VWP Board")).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "Chat" })).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "Board" })).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "Tools" })).toBeVisible();
  });

  test("clicking Board link navigates to /board", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/tools");
    await sidebar(page).getByRole("link", { name: "Board" }).click();
    await expect(page).toHaveURL(/\/board/);
  });

  test("clicking Tools link navigates to /tools", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await sidebar(page).getByRole("link", { name: "Tools" }).click();
    await expect(page).toHaveURL(/\/tools/);
  });

  test("mobile shows bottom nav bar instead of sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/board");
    await expect(mobileNav(page)).toBeVisible();
  });

  test("bottom nav bar has Board and Tools tabs", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/board");
    await expect(mobileNav(page).getByRole("link", { name: /^Board$/ })).toBeVisible();
    await expect(mobileNav(page).getByRole("link", { name: /^Tools$/ })).toBeVisible();
  });
});
