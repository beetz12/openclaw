import { test, expect, Page } from "@playwright/test";

async function completeOnboarding(page: Page) {
  await page.getByRole("button", { name: "Next" }).click();
  const ecomCard = page.getByText("Ecommerce Business");
  await ecomCard.click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("textbox", { name: /store name/i }).fill("Test Store");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Go to Dashboard" }).click();
}

test.describe("Responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await completeOnboarding(page);
  });

  test("Mobile (375x812): Tab bar visible, sidebar hidden", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#/");

    // Tab bar should be visible at bottom
    await expect(page.getByText("Home")).toBeVisible();
    await expect(page.getByText("Queue")).toBeVisible();
    await expect(page.getByText("Tasks")).toBeVisible();
    await expect(page.getByText("Business")).toBeVisible();
    await expect(page.getByText("More")).toBeVisible();

    // Sidebar nav should not be visible on mobile
    const sidebar = page.locator("sidebar-nav");
    await expect(sidebar).not.toBeVisible();
  });

  test("Desktop (1280x800): Sidebar visible, tab bar hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/#/");

    // Sidebar should be visible
    await expect(page.getByText("VWP")).toBeVisible();

    // Tab bar component should not be visible on desktop
    const tabBar = page.locator("tab-bar");
    await expect(tabBar).not.toBeVisible();
  });

  test("Tablet (768x1024): Desktop layout with sidebar visible", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/#/");

    // At 768px+ the sidebar should be visible (desktop layout)
    await expect(page.getByText("VWP")).toBeVisible();
    await expect(page.getByText("Home")).toBeVisible();
    await expect(page.getByText("Queue")).toBeVisible();
    await expect(page.getByText("Tasks")).toBeVisible();
    await expect(page.getByText("Business")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();
  });
});
