import { test, expect } from "@playwright/test";

test.describe("Goal input page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goals/new");
    await page.evaluate(() => {
      localStorage.setItem("vwp-board-onboarding-complete", "true");
    });
    await page.goto("/goals/new");
  });

  test("Goal input page renders form", async ({ page }) => {
    await expect(page.getByText("New Goal")).toBeVisible();
    await expect(page.getByText("Describe what you want to accomplish")).toBeVisible();
    await expect(page.getByLabel("Describe your goal")).toBeVisible();
  });

  test("Example prompt chips are clickable", async ({ page }) => {
    const textarea = page.getByLabel("Describe your goal");

    // Click on an example prompt
    const exampleBtn = page.getByText("Run a Valentine\u2019s Day sale");
    await exampleBtn.click();

    // Textarea should now have the prompt text
    await expect(textarea).toHaveValue(/Valentine/);
  });

  test("Submit button disabled for short input", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: "Analyze & Plan" });
    const textarea = page.getByLabel("Describe your goal");

    // Type short input (less than 10 chars)
    await textarea.fill("short");

    await expect(submitBtn).toBeDisabled();
  });

  test("Submit button enabled for valid input", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: "Analyze & Plan" });
    const textarea = page.getByLabel("Describe your goal");

    // Type valid input (at least 10 chars)
    await textarea.fill("Create a marketing campaign for our new product launch");

    await expect(submitBtn).toBeEnabled();
  });
});
