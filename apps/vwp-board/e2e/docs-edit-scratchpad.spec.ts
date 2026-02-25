import { expect, test } from "@playwright/test";

test("docs edit + scratchpad capture flow", async ({ page, request }) => {
  const docPath = "docs/e2e-doc-edit.md";
  const marker = `e2e-doc-edit-marker-${Date.now()}`;

  // Docs edit/save-back via API contract used by UI modal.
  const writeRes = await request.post("/api/docs/write", {
    data: { path: docPath, content: `# E2E Doc\n\n${marker}\n` },
  });
  expect(writeRes.ok()).toBeTruthy();

  const readRes = await request.get(`/api/docs/read?path=${encodeURIComponent(docPath)}`);
  expect(readRes.ok()).toBeTruthy();
  const readJson = await readRes.json();
  expect(String(readJson.content)).toContain(marker);

  // Scratchpad capture via UI
  await page.goto("/");
  await expect(page.getByText("Scratchpad", { exact: true })).toBeVisible();

  const note = `E2E scratchpad marker ${Date.now()}`;
  await page.getByPlaceholder("Drop quick thoughts, links, or instructions...").fill(note);
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByText("Saved via", { exact: false })).toBeVisible();
});
