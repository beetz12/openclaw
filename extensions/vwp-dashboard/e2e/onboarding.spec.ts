import { test, expect } from "@playwright/test";

test.describe("Onboarding wizard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
  });

  test("Step 1: Welcome screen renders with heading and buttons", async ({ page }) => {
    await expect(page.getByText("Welcome to your AI Assistant")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
  });

  test("Step 2: Business type selection with 3 options", async ({ page }) => {
    // Advance to step 2
    await page.getByRole("button", { name: "Next" }).click();

    // Verify 3 business type options
    await expect(page.getByText("IT Consultancy")).toBeVisible();
    await expect(page.getByText("Ecommerce")).toBeVisible();
    await expect(page.getByText("Other")).toBeVisible();

    // Next should be disabled until a selection is made
    const nextButton = page.getByRole("button", { name: "Next" });
    await expect(nextButton).toBeDisabled();

    // Select a business type
    await page.getByText("Ecommerce").click();

    // Now Next should be enabled
    await expect(nextButton).toBeEnabled();
  });

  test("Step 3: Business details form with store name and description", async ({ page }) => {
    // Advance to step 3
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByText("Ecommerce").click();
    await page.getByRole("button", { name: "Next" }).click();

    // Verify form fields are present
    await expect(page.getByRole("textbox", { name: /store name/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /description/i })).toBeVisible();

    // Next button should be present
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
  });

  test("Step 4: Ready screen shows business name and Go to Dashboard button", async ({ page }) => {
    // Complete steps 1-3
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByText("Ecommerce").click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("textbox", { name: /store name/i }).fill("My Test Shop");
    await page.getByRole("button", { name: "Next" }).click();

    // Verify ready screen
    await expect(page.getByText("You're ready!")).toBeVisible();
    await expect(page.getByText("My Test Shop")).toBeVisible();
    await expect(page.getByRole("button", { name: "Go to Dashboard" })).toBeVisible();
  });

  test("Completing onboarding sets localStorage and navigates to home", async ({ page }) => {
    // Complete full onboarding
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByText("Ecommerce").click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("textbox", { name: /store name/i }).fill("My Test Shop");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Go to Dashboard" }).click();

    // Verify localStorage is set
    const onboardingComplete = await page.evaluate(() =>
      localStorage.getItem("vwp-onboarding-complete"),
    );
    expect(onboardingComplete).toBeTruthy();

    // Verify navigation to home
    await expect(page).toHaveURL(/#\/?$/);
  });

  test("Skip for now button works from step 1", async ({ page }) => {
    await page.getByRole("button", { name: "Skip for now" }).click();

    // Should navigate away from onboarding
    const onboardingComplete = await page.evaluate(() =>
      localStorage.getItem("vwp-onboarding-complete"),
    );
    expect(onboardingComplete).toBeTruthy();
    await expect(page).toHaveURL(/#\/?$/);
  });

  test("Skip for now button works from step 2", async ({ page }) => {
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Skip for now" }).click();

    const onboardingComplete = await page.evaluate(() =>
      localStorage.getItem("vwp-onboarding-complete"),
    );
    expect(onboardingComplete).toBeTruthy();
    await expect(page).toHaveURL(/#\/?$/);
  });

  test("Back button navigates to previous steps", async ({ page }) => {
    // Go to step 2
    await page.getByRole("button", { name: "Next" }).click();

    // Verify we're on step 2
    await expect(page.getByText("IT Consultancy")).toBeVisible();

    // Go back to step 1
    await page.getByRole("button", { name: /back/i }).click();

    // Verify we're back on step 1
    await expect(page.getByText("Welcome to your AI Assistant")).toBeVisible();
  });
});
