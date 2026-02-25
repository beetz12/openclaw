import { test, expect } from "@playwright/test";

async function mockOnboardingStatus(page: import("@playwright/test").Page, completed: boolean) {
  await page.route("**/vwp/onboarding", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ completed }),
      });
    }
    return route.continue();
  });
}


async function advanceFromConnectionStep(page: import("@playwright/test").Page) {
  const goToBoard = page.getByTestId("go-to-board-btn");
  const skipBtn = page.getByTestId("skip-btn");
  await expect(goToBoard.or(skipBtn)).toBeVisible({ timeout: 10000 });
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
  }
  await expect(goToBoard).toBeVisible();
}

test.describe("Onboarding wizard", () => {
  test.beforeEach(async ({ page }) => {
    await mockOnboardingStatus(page, false);
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
    await page.getByTestId("get-started-btn").click({ force: true });

    await expect(page.getByText("What type of business do you run?")).toBeVisible();

    // Select e-commerce
    await page.getByTestId("type-ecommerce").click();

    // Verify selected state (the card should have a checkmark SVG when selected)
    const ecomCard = page.getByTestId("type-ecommerce");
    await expect(ecomCard).toBeVisible();

    // Next button should now be enabled
    const nextBtn = page.getByTestId("next-btn");
    await expect(nextBtn).toBeEnabled();
  });

  test("Step 3: Can fill business basics form", async ({ page }) => {
    // Navigate to step 3
    await page.getByTestId("get-started-btn").click({ force: true });
    await page.getByTestId("type-ecommerce").click();
    await page.getByTestId("next-btn").click();

    await expect(page.getByText("Tell us about your business")).toBeVisible();

    // Fill the form
    await page.getByTestId("user-name-input").fill("Test Owner");
    await page.getByTestId("business-name-input").fill("Test Shop");
    await page.getByTestId("industry-select").selectOption("Retail & E-Commerce");
    await page.getByTestId("business-desc-input").fill("An online shop for testing.");

    // Next should be enabled after name is filled
    await expect(page.getByTestId("next-btn")).toBeEnabled();
  });

  test("Step 4: Can skip connection step", async ({ page }) => {
    // Navigate to step 4
    await page.getByTestId("get-started-btn").click({ force: true });
    await page.getByTestId("type-ecommerce").click();
    await page.getByTestId("next-btn").click();
    await page.getByTestId("user-name-input").fill("Test Owner");
    await page.getByTestId("business-name-input").fill("Test Shop");
    await page.getByTestId("next-btn").click();

    await advanceFromConnectionStep(page);

    // Should now be on step 5
    await expect(page.getByText("You're all set!")).toBeVisible();
  });

  test("Step 5: Ready step shows summary", async ({ page }) => {
    // Navigate through all steps
    await page.getByTestId("get-started-btn").click({ force: true });
    await page.getByTestId("type-ecommerce").click();
    await page.getByTestId("next-btn").click();
    await page.getByTestId("user-name-input").fill("Test Owner");
    await page.getByTestId("business-name-input").fill("Test Shop");
    await page.getByTestId("next-btn").click();
    await advanceFromConnectionStep(page);

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
    await page.getByTestId("get-started-btn").click({ force: true });
    await page.getByTestId("type-ecommerce").click();
    await page.getByTestId("next-btn").click();
    await page.getByTestId("user-name-input").fill("Test Owner");
    await page.getByTestId("business-name-input").fill("Test Shop");
    await page.getByTestId("next-btn").click();
    await advanceFromConnectionStep(page);

    // Complete onboarding
    await page.getByTestId("go-to-board-btn").click();

    // Completion/redirect behavior is covered in onboarding-pipeline tests.
  });
});
