import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
    await page.goto("/board");
  });

  test("sidebar shows VWP Board heading, Board and New Goal links on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByText("VWP Board")).toBeVisible();
    await expect(page.getByRole("link", { name: "Board" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New Goal" })).toBeVisible();
  });

  test("clicking Board link navigates to /board", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/goals/new");
    await page.getByRole("link", { name: "Board" }).click();
    await expect(page).toHaveURL(/\/board/);
  });

  test("clicking New Goal link navigates to /goals/new", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("link", { name: "New Goal" }).click();
    await expect(page).toHaveURL(/\/goals\/new/);
  });

  test("mobile shows bottom nav bar instead of sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/board");
    const bottomNav = page.locator("nav").last();
    await expect(bottomNav).toBeVisible();
  });

  test("bottom nav bar has Board and New Goal tabs with icons", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/board");
    await expect(page.getByRole("link", { name: /Board/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /New Goal/i })).toBeVisible();
  });
});
