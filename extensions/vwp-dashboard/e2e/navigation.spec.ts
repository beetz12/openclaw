import { test, expect, Page } from "@playwright/test";

async function completeOnboarding(page: Page) {
  await page.getByRole("button", { name: "Next" }).click(); // step 1 -> 2
  // Click on a business type card
  const ecomCard = page.getByText("Ecommerce Business");
  await ecomCard.click();
  await page.getByRole("button", { name: "Next" }).click(); // step 2 -> 3
  await page.getByRole("textbox", { name: /store name/i }).fill("Test Store");
  await page.getByRole("button", { name: "Next" }).click(); // step 3 -> 4
  await page.getByRole("button", { name: "Go to Dashboard" }).click();
}

test.describe("Navigation between views", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await completeOnboarding(page);
  });

  test("Home view loads after onboarding", async ({ page }) => {
    await expect(page).toHaveURL(/#\/?$/);
    // Home view should be visible with some recognizable content
    await expect(page.getByText(/hi/i)).toBeVisible();
  });

  test("Queue view shows heading and channel filter tabs", async ({ page }) => {
    await page.goto("/#/queue");

    await expect(page.getByText("Messages to review")).toBeVisible();

    // Channel filter tabs
    await expect(page.getByText("All")).toBeVisible();
    await expect(page.getByText("Whatsapp")).toBeVisible();
    await expect(page.getByText("Telegram")).toBeVisible();
    await expect(page.getByText("Email")).toBeVisible();
  });

  test("Tasks view shows heading with empty state", async ({ page }) => {
    await page.goto("/#/tasks");

    await expect(page.getByText("Tasks")).toBeVisible();
    await expect(page.getByText("No tasks yet")).toBeVisible();
  });

  test("Business view shows heading with saved business data", async ({ page }) => {
    await page.goto("/#/business");

    await expect(page.getByText("My Business Info")).toBeVisible();
    // Should show the store name from onboarding
    await expect(page.getByText("Test Store")).toBeVisible();
  });

  test("Settings/More view shows heading with sections", async ({ page }) => {
    await page.goto("/#/more");

    await expect(page.getByText("Settings")).toBeVisible();
    await expect(page.getByText("Trust Settings")).toBeVisible();
    await expect(page.getByText("Notifications")).toBeVisible();
    await expect(page.getByText("Channels")).toBeVisible();
    await expect(page.getByText("About")).toBeVisible();
  });

  test("Quick action: View queue navigates to queue", async ({ page }) => {
    await page.getByRole("button", { name: /view queue/i }).click();

    await expect(page).toHaveURL(/#\/queue/);
    await expect(page.getByText("Messages to review")).toBeVisible();
  });

  test("Quick action: Your business info navigates to business", async ({ page }) => {
    await page.getByRole("button", { name: /your business info/i }).click();

    await expect(page).toHaveURL(/#\/business/);
    await expect(page.getByText("My Business Info")).toBeVisible();
  });

  test("Sidebar nav on desktop shows VWP branding and links", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/#/");

    // Sidebar should show branding and navigation links
    await expect(page.getByText("VWP")).toBeVisible();
    await expect(page.getByText("Home")).toBeVisible();
    await expect(page.getByText("Queue")).toBeVisible();
    await expect(page.getByText("Tasks")).toBeVisible();
    await expect(page.getByText("Business")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();
  });

  test("Tab bar on mobile shows Home, Queue, Tasks, Business, More", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/#/");

    await expect(page.getByText("Home")).toBeVisible();
    await expect(page.getByText("Queue")).toBeVisible();
    await expect(page.getByText("Tasks")).toBeVisible();
    await expect(page.getByText("Business")).toBeVisible();
    await expect(page.getByText("More")).toBeVisible();
  });
});
