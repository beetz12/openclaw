import { test, expect, Page } from "@playwright/test";

async function completeOnboarding(page: Page) {
  await page.getByRole("button", { name: "Next" }).click();
  const ecomCard = page.getByText("Ecommerce Business");
  await ecomCard.click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("textbox", { name: /store name/i }).fill("Test Store");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Go to Dashboard" }).click();
}

test.describe("Home view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await completeOnboarding(page);
  });

  test("Shows personalized greeting", async ({ page }) => {
    await expect(page.getByText(/hi .+!/i)).toBeVisible();
  });

  test("Task input field is present with placeholder", async ({ page }) => {
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    // Verify it has a placeholder
    await expect(input).toHaveAttribute("placeholder", /.+/);
  });

  test("Submit button is disabled when input is empty", async ({ page }) => {
    const submitButton = page.getByRole("button", { name: /send|submit/i });
    await expect(submitButton).toBeDisabled();
  });

  test("Example suggestion chips are present", async ({ page }) => {
    // There should be at least 3 suggestion chips
    const chips = page.getByRole("button").filter({ hasText: /./i });
    // Look for suggestion-like elements (small clickable chips)
    const suggestionChips = page.locator(
      "[class*='suggestion'], [class*='chip'], [class*='example']",
    );
    const count = await suggestionChips.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("Clicking suggestion chip fills the input", async ({ page }) => {
    // Find and click the first suggestion chip
    const suggestionChips = page.locator(
      "[class*='suggestion'], [class*='chip'], [class*='example']",
    );
    const firstChip = suggestionChips.first();
    const chipText = await firstChip.textContent();
    await firstChip.click();

    // Verify the input now contains text
    const input = page.getByRole("textbox");
    await expect(input).not.toHaveValue("");
  });

  test("Stat cards are present", async ({ page }) => {
    await expect(page.getByText("Waiting for review")).toBeVisible();
    await expect(page.getByText("Messages today")).toBeVisible();
    await expect(page.getByText("Approval rate")).toBeVisible();
  });

  test("Your channels section shows empty state", async ({ page }) => {
    await expect(page.getByText(/your channels/i)).toBeVisible();
    // Empty state message should be visible since no channels are connected
    await expect(page.getByText(/no.*channel|connect.*channel|add.*channel/i)).toBeVisible();
  });

  test("Quick action buttons are present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /view queue/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /your business info/i })).toBeVisible();
  });
});
