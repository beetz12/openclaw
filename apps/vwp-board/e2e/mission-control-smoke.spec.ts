import { expect, test } from "@playwright/test";

const ROUTES = [
  "/board",
  "/docs",
  "/approvals",
  "/activity",
  "/cost",
  "/calendar",
  "/workforce",
] as const;

test("mission control routes load smoke", async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
  }
});
