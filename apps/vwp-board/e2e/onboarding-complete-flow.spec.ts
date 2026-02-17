import { test, expect } from "@playwright/test";

test.describe("Onboarding Complete Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Clear onboarding state so we start fresh
    await page.goto("/onboarding");
    await page.evaluate(() => {
      localStorage.removeItem("vwp-board-onboarding-complete");
    });
    await page.goto("/onboarding");
  });

  test("complete full onboarding wizard through all 5 steps", async ({
    page,
  }) => {
    // Step 1
    await expect(page.getByRole("button", { name: /Next|Continue|Get Started/i })).toBeVisible();
    await page.getByRole("button", { name: /Next|Continue|Get Started/i }).click();

    // Step 2
    await expect(page.getByRole("button", { name: /Next|Continue/i })).toBeVisible();
    await page.getByRole("button", { name: /Next|Continue/i }).click();

    // Step 3
    await expect(page.getByRole("button", { name: /Next|Continue/i })).toBeVisible();
    await page.getByRole("button", { name: /Next|Continue/i }).click();

    // Step 4
    await expect(page.getByRole("button", { name: /Next|Continue/i })).toBeVisible();
    await page.getByRole("button", { name: /Next|Continue/i }).click();

    // Step 5 - final step
    await expect(page.getByRole("button", { name: /Finish|Complete|Done|Start/i })).toBeVisible();
    await page.getByRole("button", { name: /Finish|Complete|Done|Start/i }).click();
  });

  test("verify redirect to /board after completion", async ({ page }) => {
    // Complete all steps
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: /Next|Continue|Get Started/i }).click();
      await page.waitForTimeout(300);
    }
    await page.getByRole("button", { name: /Finish|Complete|Done|Start/i }).click();

    await expect(page).toHaveURL(/\/board/, { timeout: 10000 });
  });

  test("verify localStorage onboarding-complete is set after finishing", async ({
    page,
  }) => {
    // Complete all steps
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: /Next|Continue|Get Started/i }).click();
      await page.waitForTimeout(300);
    }
    await page.getByRole("button", { name: /Finish|Complete|Done|Start/i }).click();
    await page.waitForTimeout(500);

    const onboardingComplete = await page.evaluate(() => {
      return localStorage.getItem("vwp-board-onboarding-complete");
    });
    expect(onboardingComplete).toBe("true");
  });

  test("verify sidebar/nav still works after onboarding", async ({ page }) => {
    // Complete all steps
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: /Next|Continue|Get Started/i }).click();
      await page.waitForTimeout(300);
    }
    await page.getByRole("button", { name: /Finish|Complete|Done|Start/i }).click();
    await expect(page).toHaveURL(/\/board/, { timeout: 10000 });

    // Verify navigation is still functional
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByRole("link", { name: /New Goal/i })).toBeVisible();
    await page.getByRole("link", { name: /New Goal/i }).click();
    await expect(page).toHaveURL(/\/goals\/new/);
  });

  test("going back to /onboarding after completing shows step 1", async ({
    page,
  }) => {
    // Set onboarding as already complete
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });

    await page.goto("/onboarding");

    // Should show step 1 content (can redo onboarding)
    await expect(page.getByRole("button", { name: /Next|Continue|Get Started/i })).toBeVisible();
  });
});
