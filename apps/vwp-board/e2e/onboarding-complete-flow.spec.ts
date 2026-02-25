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

async function finishOnboarding(page: import("@playwright/test").Page) {
  await page.getByTestId("get-started-btn").click({ force: true });
  await page.getByTestId("type-ecommerce").click({ force: true });
  await page.getByTestId("next-btn").click();
  await page.getByTestId("user-name-input").fill("Flow User");
  await page.getByTestId("business-name-input").fill("Flow Shop");
  await page.getByTestId("next-btn").click();

  const goToBoard = page.getByTestId("go-to-board-btn");
  const skipBtn = page.getByTestId("skip-btn");
  await expect(goToBoard.or(skipBtn)).toBeVisible({ timeout: 10000 });
  if (await skipBtn.isVisible().catch(() => false)) {
    await skipBtn.click();
  }

  await expect(goToBoard).toBeVisible();
  // After completion, guard should treat user as onboarded.
  await mockOnboardingStatus(page, true);
  await goToBoard.click();

  // Completion can land in either:
  // 1) direct redirect to /, or
  // 2) team preview with a second go-to-board button ("Start Chatting").
  const postCompleteButton = page.getByTestId("go-to-board-btn");
  await page.waitForTimeout(400);
  if (await postCompleteButton.isVisible().catch(() => false)) {
    await postCompleteButton.click();
  }

  await expect
    .poll(async () =>
      page.evaluate(() => localStorage.getItem("vwp-board-onboarding-complete")),
    )
    .toBe("true");
}

test.describe("Onboarding Complete Flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockOnboardingStatus(page, false);
    await page.goto("/onboarding");
    await page.evaluate(() => {
      localStorage.removeItem("vwp-board-onboarding-complete");
      localStorage.removeItem("vwp-board-onboarding-state");
    });
    await page.goto("/onboarding");
  });

  test("complete full onboarding wizard through all 5 steps", async ({ page }) => {
    await finishOnboarding(page);
  });

  test("verify redirect to home after completion", async ({ page }) => {
    await finishOnboarding(page);
    await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 10000 });
  });

  test("verify localStorage onboarding-complete is set after finishing", async ({ page }) => {
    await finishOnboarding(page);
    const onboardingComplete = await page.evaluate(() =>
      localStorage.getItem("vwp-board-onboarding-complete"),
    );
    expect(onboardingComplete).toBe("true");
  });

  test("verify sidebar/nav still works after onboarding", async ({ page }) => {
    await finishOnboarding(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByRole("link", { name: /Board/i })).toBeVisible();
  });

  test("going back to /onboarding after completing shows step 1", async ({ page }) => {
    await finishOnboarding(page);
    await mockOnboardingStatus(page, false);
    await page.goto("/onboarding");
    await expect(page.getByTestId("get-started-btn")).toBeVisible();
  });
});
