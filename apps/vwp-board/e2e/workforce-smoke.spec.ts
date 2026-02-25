import { expect, test } from "@playwright/test";

test("workforce page smoke: open, edit, save", async ({ page }) => {
  await page.goto("/workforce");
  await expect(page.getByRole("heading", { name: "Workforce Team" })).toBeVisible();

  const firstEdit = page.getByRole("button", { name: "Edit" }).first();
  await expect(firstEdit).toBeVisible();
  await firstEdit.click();

  const nameInput = page.locator('input[required]').first();
  const originalName = (await nameInput.inputValue()).trim();
  const updatedName = `${originalName} QA`;

  await nameInput.fill(updatedName);
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText(updatedName).first()).toBeVisible();

  // Revert to keep environment clean.
  await page.getByRole("button", { name: "Edit" }).first().click();
  await nameInput.fill(originalName);
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText(originalName).first()).toBeVisible();
});
