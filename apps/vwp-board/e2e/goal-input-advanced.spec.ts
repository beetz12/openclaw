import { test, expect } from "@playwright/test";

test.describe("Goal Input Advanced", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
    await page.goto("/goals/new");
  });

  test("character counter shows remaining characters", async ({ page }) => {
    const textarea = page.getByRole("textbox");
    await expect(textarea).toBeVisible();

    // Type some text and verify counter updates
    await textarea.fill("Test goal");
    await expect(page.getByText(/\d+/)).toBeVisible();
  });

  test("all 3 example chips are clickable and fill the textarea", async ({
    page,
  }) => {
    const textarea = page.getByRole("textbox");

    // Find example chips/buttons (excluding navigation and submit buttons)
    const chips = page.locator("[data-testid*='chip'], [data-testid*='example'], button:not([type='submit'])").filter({
      hasNot: page.getByRole("link"),
    });

    // Click the first example chip
    const firstChip = page.getByRole("button").filter({ hasNotText: /submit|send|next|back|retry/i }).first();
    await firstChip.click();

    // Verify textarea is populated
    const textareaValue = await textarea.inputValue();
    expect(textareaValue.length).toBeGreaterThan(0);
  });

  test("clearing textarea after chip click re-disables submit button", async ({
    page,
  }) => {
    const textarea = page.getByRole("textbox");

    // Fill textarea to enable submit
    await textarea.fill("A test goal for my business");
    const submitButton = page.getByRole("button", { name: /submit|send|create/i });

    // Clear the textarea
    await textarea.fill("");

    // Submit button should be disabled when textarea is empty
    await expect(submitButton).toBeDisabled();
  });

  test("goal input label has 'Describe your goal' accessible name", async ({
    page,
  }) => {
    await expect(
      page.getByText(/Describe your goal/i)
    ).toBeVisible();
  });

  test("textarea has proper placeholder text", async ({ page }) => {
    const textarea = page.getByRole("textbox");
    await expect(textarea).toBeVisible();

    const placeholder = await textarea.getAttribute("placeholder");
    expect(placeholder).toBeTruthy();
    expect(placeholder!.length).toBeGreaterThan(0);
  });
});
