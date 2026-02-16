import { test, expect } from "@playwright/test";

// ---------- Mock data ----------

const MOCK_TOOLS = {
  tools: [
    {
      name: "seo-analyzer",
      label: "SEO Analyzer",
      description: "Analyze website SEO metrics and generate reports",
      category: "research",
      runtime: "python3",
      timeout_seconds: 120,
      args_schema: {
        url: { type: "string", required: true, label: "Website URL" },
        depth: { type: "enum", values: ["shallow", "deep"], required: false, label: "Crawl depth" },
      },
    },
    {
      name: "blog-writer",
      label: "Blog Writer",
      description: "Generate blog posts from outlines",
      category: "content",
      runtime: "node",
      timeout_seconds: 60,
      args_schema: {
        topic: { type: "string", required: true, label: "Blog topic" },
        tone: { type: "enum", values: ["formal", "casual", "technical"], required: false, label: "Writing tone" },
        draft: { type: "boolean", required: false, label: "Save as draft" },
      },
    },
  ],
};

const MOCK_RUNS = {
  active: [],
  completed: [
    {
      runId: "run-001",
      toolName: "seo-analyzer",
      toolLabel: "SEO Analyzer",
      status: "completed",
      startedAt: Date.now() - 30_000,
      completedAt: Date.now() - 5_000,
      exitCode: 0,
    },
  ],
};

// ---------- Helpers ----------

function skipOnboarding(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    localStorage.setItem("vwp-board-onboarding-complete", "true");
  });
}

/** Intercept tool API calls and return mock data */
async function mockToolsApi(page: import("@playwright/test").Page) {
  await page.route("**/vwp/tools", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_TOOLS),
      });
    }
    return route.continue();
  });

  await page.route("**/vwp/tools/runs", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RUNS),
    });
  });

  await page.route("**/vwp/tools/*/run", (route) => {
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ runId: `run-${Date.now()}` }),
    });
  });
}

// ---------- Tests ----------

test.describe("Tools page — error state (no backend)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await skipOnboarding(page);
  });

  test("shows error message when API is unavailable", async ({ page }) => {
    await page.goto("/tools");
    await expect(
      page.getByText("Failed to load tools. Is the dispatch plugin running?"),
    ).toBeVisible();
  });

  test("shows empty tool count", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText("Available Tools (0)")).toBeVisible();
  });

  test("shows helpful empty state with tools/ directory hint", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText("No workspace tools found")).toBeVisible();
    await expect(page.getByText("tools/")).toBeVisible();
  });
});

test.describe("Tools page — with mock API", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await skipOnboarding(page);
    await mockToolsApi(page);
  });

  test("displays discovered tools as cards", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText("Available Tools (2)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "SEO Analyzer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Blog Writer" })).toBeVisible();
  });

  test("tool cards show description and category", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText("Analyze website SEO metrics")).toBeVisible();
    await expect(page.getByText("research")).toBeVisible();
    await expect(page.getByText("content")).toBeVisible();
  });

  test("tool cards show runtime badge", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText("python3")).toBeVisible();
    await expect(page.getByText("node")).toBeVisible();
  });

  test("tool cards show timeout info", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText("Timeout: 2m")).toBeVisible();
    await expect(page.getByText("Timeout: 1m")).toBeVisible();
  });

  test("shows recent runs section", async ({ page }) => {
    await page.goto("/tools");
    await expect(page.getByText("Recent Runs")).toBeVisible();
    await expect(page.getByText("completed")).toBeVisible();
  });
});

test.describe("Tools page — run dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await skipOnboarding(page);
    await mockToolsApi(page);
  });

  test("clicking Run opens the run dialog with form fields", async ({ page }) => {
    await page.goto("/tools");
    // Click the first Run button (SEO Analyzer)
    await page.getByRole("button", { name: "Run" }).first().click();

    // Dialog should appear with tool name
    await expect(page.getByText("Run SEO Analyzer")).toBeVisible();
    // Should have the required field
    await expect(page.getByText("Website URL")).toBeVisible();
    // Should have the enum field as select
    await expect(page.getByText("Crawl depth")).toBeVisible();
    // Should have Start Run and Cancel buttons
    await expect(page.getByRole("button", { name: "Start Run" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("run dialog shows required field indicator", async ({ page }) => {
    await page.goto("/tools");
    await page.getByRole("button", { name: "Run" }).first().click();
    // Required fields should have asterisk
    const requiredMarker = page.locator("text=*").first();
    await expect(requiredMarker).toBeVisible();
  });

  test("cancel button closes the dialog", async ({ page }) => {
    await page.goto("/tools");
    await page.getByRole("button", { name: "Run" }).first().click();
    await expect(page.getByText("Run SEO Analyzer")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Run SEO Analyzer")).not.toBeVisible();
  });

  test("blog writer dialog shows enum select and boolean checkbox", async ({ page }) => {
    await page.goto("/tools");
    // Click the second Run button (Blog Writer)
    await page.getByRole("button", { name: "Run" }).nth(1).click();

    await expect(page.getByText("Run Blog Writer")).toBeVisible();
    await expect(page.getByText("Blog topic")).toBeVisible();
    await expect(page.getByText("Writing tone")).toBeVisible();
    await expect(page.getByText("Save as draft")).toBeVisible();

    // Check that select has options
    const select = page.locator("select");
    await expect(select).toBeVisible();
    await expect(select.locator("option", { hasText: "formal" })).toBeAttached();
    await expect(select.locator("option", { hasText: "casual" })).toBeAttached();
    await expect(select.locator("option", { hasText: "technical" })).toBeAttached();

    // Check that checkbox exists for boolean field
    const checkbox = page.locator("input[type=checkbox]");
    await expect(checkbox).toBeVisible();
  });

  test("submitting the run dialog sends request and closes dialog", async ({ page }) => {
    await page.goto("/tools");
    // Wait for tools to load before interacting
    await expect(page.getByRole("heading", { name: "SEO Analyzer" })).toBeVisible();
    await page.getByRole("button", { name: "Run" }).first().click();

    // Wait for dialog to appear
    await expect(page.getByText("Run SEO Analyzer")).toBeVisible();

    // Fill required field
    await page.getByPlaceholder("Website URL").fill("https://example.com");

    // Submit
    await page.getByRole("button", { name: "Start Run" }).click();

    // Dialog should close after successful submission
    await expect(page.getByText("Run SEO Analyzer")).not.toBeVisible({ timeout: 10000 });
  });
});

test.describe("Tools page — concurrency error", () => {
  test("shows concurrency limit error when API returns 429", async ({ page }) => {
    await page.goto("/board");
    await skipOnboarding(page);
    await mockToolsApi(page);

    // Override the run endpoint to return 429
    await page.route("**/vwp/tools/*/run", (route) => {
      return route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Concurrency limit reached", code: "CONCURRENCY_LIMIT" }),
      });
    });

    await page.goto("/tools");
    await page.getByRole("button", { name: "Run" }).first().click();
    await page.getByPlaceholder("Website URL").fill("https://example.com");
    await page.getByRole("button", { name: "Start Run" }).click();

    // Should show the concurrency error message
    await expect(
      page.getByText("All tool slots are in use"),
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Tools page — navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await skipOnboarding(page);
    await mockToolsApi(page);
  });

  test("Tools link in sidebar navigates to /tools", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/board");
    const sidebar = page.locator("aside");
    await sidebar.getByRole("link", { name: "Tools" }).click();
    await expect(page).toHaveURL(/\/tools/);
    await expect(page.getByRole("heading", { name: "Workspace Tools" })).toBeVisible();
  });

  test("Tools link in mobile bottom nav navigates to /tools", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/board");
    await page.getByRole("link", { name: /Tools/i }).click();
    await expect(page).toHaveURL(/\/tools/);
  });
});

test.describe("Tools page — responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await skipOnboarding(page);
    await mockToolsApi(page);
  });

  test("mobile viewport shows single-column tool grid", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "SEO Analyzer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Blog Writer" })).toBeVisible();
    // Sidebar should be hidden
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeHidden();
  });

  test("desktop viewport shows multi-column tool grid with sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "SEO Analyzer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Blog Writer" })).toBeVisible();
    // Sidebar should be visible
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
  });
});

test.describe("Tools page — accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/board");
    await skipOnboarding(page);
    await mockToolsApi(page);
  });

  test("page has correct heading hierarchy", async ({ page }) => {
    await page.goto("/tools");
    const h1 = page.locator("main h1");
    await expect(h1).toHaveText("Workspace Tools");
    const h2 = page.locator("main h2").first();
    await expect(h2).toContainText("Available Tools");
  });

  test("all Run buttons are accessible", async ({ page }) => {
    await page.goto("/tools");
    // Wait for tools to load before counting buttons
    await expect(page.getByRole("heading", { name: "SEO Analyzer" })).toBeVisible();
    const runButtons = page.getByRole("button", { name: "Run" });
    const count = await runButtons.count();
    expect(count).toBe(2);
    for (let i = 0; i < count; i++) {
      await expect(runButtons.nth(i)).toBeEnabled();
    }
  });

  test("run dialog form fields have labels", async ({ page }) => {
    await page.goto("/tools");
    await page.getByRole("button", { name: "Run" }).first().click();
    // All fields should have visible labels
    await expect(page.getByText("Website URL")).toBeVisible();
    await expect(page.getByText("Crawl depth")).toBeVisible();
  });
});
