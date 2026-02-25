import { test, expect } from "@playwright/test";

async function _fillGoalInput(page: import("@playwright/test").Page, value: string) {
  const textarea = page.getByRole("textbox", { name: /Describe your goal/i });
  await expect(textarea).toBeVisible({ timeout: 10000 });
  await textarea.fill(value);
}

test.describe("Goal Input Advanced", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
    await page.goto("/goals/new");
  });

  test("character counter shows remaining characters", async ({ page }) => {
    const textarea = page.getByRole("textbox", { name: /Describe your goal/i });
    await expect(textarea).toBeVisible();

    await textarea.fill("Test goal");
    await expect(page.getByText(/remaining$/)).toBeVisible();
  });

  test("example chips are clickable and fill the textarea", async ({ page }) => {
    const textarea = page.getByRole("textbox", { name: /Describe your goal/i });

    const firstChip = page.getByRole("button", {
      name: /Run a Valentine’s Day sale|Run a Valentine's Day sale/i,
    });
    await firstChip.click();

    const textareaValue = await textarea.inputValue();
    expect(textareaValue.length).toBeGreaterThan(0);
  });

  test("clearing textarea re-disables analyze button", async ({ page }) => {
    const textarea = page.getByRole("textbox", { name: /Describe your goal/i });
    const submitButton = page.getByRole("button", { name: /Analyze & Plan/i });

    await textarea.fill("A test goal for my business");
    await expect(submitButton).toBeEnabled();

    await textarea.fill("");
    await expect(submitButton).toBeDisabled();
  });

  test("goal input label has 'Describe your goal' accessible name", async ({ page }) => {
    await expect(page.getByText(/Describe your goal/i)).toBeVisible();
  });

  test("textarea has proper placeholder text", async ({ page }) => {
    const textarea = page.getByRole("textbox", { name: /Describe your goal/i });
    await expect(textarea).toBeVisible();

    const placeholder = await textarea.getAttribute("placeholder");
    expect(placeholder).toBe("What would you like to accomplish?");
  });
});
