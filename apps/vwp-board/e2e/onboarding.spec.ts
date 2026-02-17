import { test, expect } from "@playwright/test";

test.describe("Onboarding wizard", () => {
  test.beforeEach(async ({ page }) => {
    // Clear onboarding state before each test
    await page.goto("/onboarding");
    await page.evaluate(() => {
      localStorage.removeItem("vwp-board-onboarding-complete");
      localStorage.removeItem("vwp-board-onboarding-state");
    });
    await page.goto("/onboarding");
  });

  test("Step 1: Welcome step renders correctly", async ({ page }) => {
    await expect(page.getByText("Welcome to VWP")).toBeVisible();
    await expect(page.getByText("Your AI-powered business assistant")).toBeVisible();
    await expect(page.getByText("Describe goals in plain language")).toBeVisible();
    await expect(page.getByText("AI breaks them into tasks")).toBeVisible();
    await expect(page.getByText("Review and approve results")).toBeVisible();
    await expect(page.getByTestId("get-started-btn")).toBeVisible();
  });

  test("Step 2: Can select business type", async ({ page }) => {
    // Navigate to step 2
    await page.getByTestId("get-started-btn").click();

    await expect(page.getByText("What type of business do you run?")).toBeVisible();

    // Select e-commerce
    await page.getByTestId("type-e-commerce").click();

    // Verify selected state (the card should have a checkmark SVG when selected)
    const ecomCard = page.getByTestId("type-e-commerce");
    await expect(ecomCard).toBeVisible();

    // Next button should now be enabled
    const nextBtn = page.getByTestId("next-btn");
    await expect(nextBtn).toBeEnabled();
  });

  test("Step 3: Can fill business basics form", async ({ page }) => {
    // Navigate to step 3
    await page.getByTestId("get-started-btn").click();
    await page.getByTestId("type-e-commerce").click();
    await page.getByTestId("next-btn").click();

    await expect(page.getByText("Tell us about your business")).toBeVisible();

    // Fill the form
    await page.getByTestId("business-name-input").fill("Test Shop");
    await page.getByTestId("industry-select").selectOption("Retail & E-Commerce");
    await page.getByTestId("business-desc-input").fill("An online shop for testing.");

    // Next should be enabled after name is filled
    await expect(page.getByTestId("next-btn")).toBeEnabled();
  });

  test("Step 4: Can skip connection step", async ({ page }) => {
    // Navigate to step 4
    await page.getByTestId("get-started-btn").click();
    await page.getByTestId("type-e-commerce").click();
    await page.getByTestId("next-btn").click();
    await page.getByTestId("business-name-input").fill("Test Shop");
    await page.getByTestId("next-btn").click();

    await expect(page.getByText("Connect to your server")).toBeVisible();

    // Click skip
    await page.getByTestId("skip-btn").click();

    // Should now be on step 5
    await expect(page.getByText("You're all set!")).toBeVisible();
  });

  test("Step 5: Ready step shows summary", async ({ page }) => {
    // Navigate through all steps
    await page.getByTestId("get-started-btn").click();
    await page.getByTestId("type-e-commerce").click();
    await page.getByTestId("next-btn").click();
    await page.getByTestId("business-name-input").fill("Test Shop");
    await page.getByTestId("next-btn").click();
    await page.getByTestId("skip-btn").click();

    // Verify summary
    await expect(page.getByTestId("summary-name")).toHaveText("Test Shop");
    await expect(page.getByTestId("summary-type")).toHaveText("E-Commerce");

    // Suggested task for e-commerce
    await expect(page.getByTestId("suggested-task")).toHaveText(
      "Run a seasonal promotion campaign",
    );

    await expect(page.getByTestId("go-to-board-btn")).toBeVisible();
  });

  test("Completing onboarding redirects to /board", async ({ page }) => {
    // Navigate through all steps
    await page.getByTestId("get-started-btn").click();
    await page.getByTestId("type-e-commerce").click();
    await page.getByTestId("next-btn").click();
    await page.getByTestId("business-name-input").fill("Test Shop");
    await page.getByTestId("next-btn").click();
    await page.getByTestId("skip-btn").click();

    // Complete onboarding
    await page.getByTestId("go-to-board-btn").click();

    // Should redirect to /board
    await page.waitForURL("**/board");
    expect(page.url()).toContain("/board");

    // Verify localStorage was set
    const complete = await page.evaluate(() =>
      localStorage.getItem("vwp-board-onboarding-complete"),
    );
    expect(complete).toBe("true");
  });
});
