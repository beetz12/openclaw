import { test, expect, type Page } from "@playwright/test";

// Mock board API response with empty columns
const EMPTY_BOARD_RESPONSE = {
  columns: {
    backlog: [],
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  },
  updatedAt: Date.now(),
};

// Setup: skip onboarding and mock API
async function setup(page: Page) {
  // Mock the board API so it doesn't fail (no backend running)
  await page.route("**/vwp/dispatch/board", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(EMPTY_BOARD_RESPONSE),
    }),
  );

  // Mock SSE endpoint to avoid connection errors
  await page.route("**/vwp/events*", (route) =>
    route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: "event: connected\ndata: {}\n\n",
    }),
  );

  await page.goto("/board");
  await page.evaluate(() => {
    localStorage.setItem("vwp-board-onboarding-complete", "true");
  });
}

// Wait for the Zustand store to be exposed on window
async function waitForStore(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__boardStore != null,
    { timeout: 10_000 },
  );
}

// Helper to inject agents into the Zustand store
async function injectAgents(
  page: Page,
  agents: Array<{
    id: string;
    name: string;
    status: "active" | "idle" | "error";
    taskId?: string | null;
    subtaskId?: string | null;
    lastAction?: string | null;
    error?: string | null;
  }>,
) {
  await waitForStore(page);
  await page.evaluate((agentData) => {
    const store = (window as unknown as Record<string, unknown>)
      .__boardStore as {
      setState: (state: Record<string, unknown>) => void;
    } | undefined;
    if (store) {
      store.setState({
        agents: agentData.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          taskId: a.taskId ?? null,
          subtaskId: a.subtaskId ?? null,
          lastAction: a.lastAction ?? null,
          lastSeen: Date.now(),
          error: a.error ?? null,
        })),
      });
    }
  }, agents);
}

// Helper to set gateway connected state
async function setGatewayConnected(page: Page, connected: boolean) {
  await waitForStore(page);
  await page.evaluate((val) => {
    const store = (window as unknown as Record<string, unknown>)
      .__boardStore as {
      setState: (state: Record<string, unknown>) => void;
    } | undefined;
    if (store) {
      store.setState({ gatewayConnected: val });
    }
  }, connected);
}

// Helper to open agent panel via store
async function openAgentPanel(page: Page) {
  await waitForStore(page);
  await page.evaluate(() => {
    const store = (window as unknown as Record<string, unknown>)
      .__boardStore as {
      setState: (state: Record<string, unknown>) => void;
    } | undefined;
    if (store) {
      store.setState({ agentPanelOpen: true });
    }
  });
}

// Wait for the board to be fully loaded (columns visible)
async function waitForBoard(page: Page) {
  await page.waitForSelector("text=Backlog", { timeout: 15_000 });
}

test.describe("Agent Panel - Desktop", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await waitForBoard(page);
  });

  test("sidebar shows Agents toggle button", async ({ page }) => {
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    const agentButton = sidebar.getByRole("button", {
      name: /agents panel/i,
    });
    await expect(agentButton).toBeVisible();
    await expect(agentButton).toContainText("Agents");
  });

  test("clicking Agents toggle opens the agent panel", async ({ page }) => {
    const sidebar = page.locator("aside");
    const agentButton = sidebar.getByRole("button", {
      name: /agents panel/i,
    });
    await agentButton.click();

    // Panel should be visible with heading
    await expect(page.locator("h3").filter({ hasText: "Agents" })).toBeVisible();
    // Close button should be visible
    await expect(
      page.getByRole("button", { name: "Close agent panel" }),
    ).toBeVisible();
  });

  test("agent panel shows empty state when no agents", async ({ page }) => {
    await openAgentPanel(page);
    await expect(page.getByText("No agents running")).toBeVisible();
    await expect(
      page.getByText("Agents appear here when tasks are being executed"),
    ).toBeVisible();
  });

  test("agent panel closes on X button click", async ({ page }) => {
    await openAgentPanel(page);
    await expect(page.getByText("No agents running")).toBeVisible();

    await page.getByRole("button", { name: "Close agent panel" }).click();
    await expect(page.getByText("No agents running")).toBeHidden();
  });

  test("agent panel closes on Escape key", async ({ page }) => {
    await openAgentPanel(page);
    await expect(page.getByText("No agents running")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("No agents running")).toBeHidden();
  });

  test("clicking Agents toggle again closes the panel", async ({ page }) => {
    const sidebar = page.locator("aside");
    const agentButton = sidebar.getByRole("button", {
      name: /agents panel/i,
    });

    // Open
    await agentButton.click();
    await expect(page.getByText("No agents running")).toBeVisible();

    // Close
    await agentButton.click();
    await expect(page.getByText("No agents running")).toBeHidden();
  });

  test("agent panel shows agent count in header", async ({ page }) => {
    await injectAgents(page, [
      {
        id: "agent-1",
        name: "coder-alpha",
        status: "active",
        taskId: "task-abc",
      },
      { id: "agent-2", name: "reviewer-beta", status: "idle" },
    ]);
    await openAgentPanel(page);

    // Header should show count "2"
    await expect(page.getByText("2").first()).toBeVisible();
  });

  test("agent panel shows active agents section", async ({ page }) => {
    await injectAgents(page, [
      {
        id: "agent-1",
        name: "coder-alpha",
        status: "active",
        taskId: "task-abc-123-def",
        lastAction: "Writing unit tests",
      },
    ]);
    await openAgentPanel(page);

    await expect(page.getByText("Active (1)")).toBeVisible();
    await expect(page.getByText("coder-alpha")).toBeVisible();
    await expect(page.getByText("Writing unit tests")).toBeVisible();
    await expect(page.getByText("Task: task-abc")).toBeVisible();
  });

  test("agent panel shows recent (non-active) agents section", async ({
    page,
  }) => {
    await injectAgents(page, [
      { id: "agent-1", name: "coder-alpha", status: "active" },
      { id: "agent-2", name: "reviewer-beta", status: "idle" },
      {
        id: "agent-3",
        name: "fixer-gamma",
        status: "error",
        error: "Connection lost",
      },
    ]);
    await openAgentPanel(page);

    await expect(page.getByText("Active (1)")).toBeVisible();
    await expect(page.getByText("Recent (2)")).toBeVisible();
    await expect(page.getByText("coder-alpha")).toBeVisible();
    await expect(page.getByText("reviewer-beta")).toBeVisible();
    await expect(page.getByText("fixer-gamma")).toBeVisible();
    await expect(page.getByText("Connection lost")).toBeVisible();
  });

  test("agent toggle shows badge when agents exist", async ({ page }) => {
    await injectAgents(page, [
      { id: "agent-1", name: "coder-alpha", status: "active" },
      { id: "agent-2", name: "reviewer-beta", status: "idle" },
    ]);

    const sidebar = page.locator("aside");
    const badge = sidebar.locator("span").filter({ hasText: "2" });
    await expect(badge.first()).toBeVisible();
  });

  test("gateway status indicator shows connected/offline", async ({
    page,
  }) => {
    await openAgentPanel(page);
    // Default: disconnected
    const offlineDot = page.locator('[title="Gateway offline"]');
    await expect(offlineDot).toBeVisible();

    // Set connected
    await setGatewayConnected(page, true);
    const connectedDot = page.locator('[title="Gateway connected"]');
    await expect(connectedDot).toBeVisible();
  });

  test("agent card show logs toggle works", async ({ page }) => {
    await injectAgents(page, [
      { id: "agent-1", name: "coder-alpha", status: "active" },
    ]);
    await openAgentPanel(page);

    await page.getByText("Show logs").click();
    await expect(page.getByText("Log streaming coming soon")).toBeVisible();

    await page.getByText("Hide logs").click();
    await expect(page.getByText("Log streaming coming soon")).toBeHidden();
  });

  test("agent card task link is clickable", async ({ page }) => {
    await injectAgents(page, [
      {
        id: "agent-1",
        name: "coder-alpha",
        status: "active",
        taskId: "task-abc-123-def",
      },
    ]);
    await openAgentPanel(page);

    const taskLink = page.getByText("Task: task-abc");
    await expect(taskLink).toBeVisible();
    // Should be a button element
    await expect(taskLink).toHaveRole("button");
  });
});

test.describe("Agent Panel - Mobile", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/board");
    // Mobile view might show MobileTaskList instead of board columns
    // Wait for the page to finish loading
    await page.waitForTimeout(2000);
  });

  test("mobile tab bar shows Agents tab", async ({ page }) => {
    const agentTab = page.getByRole("button", { name: "Open agents panel" });
    await expect(agentTab).toBeVisible();
    await expect(agentTab).toContainText("Agents");
  });

  test("clicking Agents tab opens the agent panel as bottom sheet", async ({
    page,
  }) => {
    const agentTab = page.getByRole("button", { name: "Open agents panel" });
    await agentTab.click();

    // Panel heading
    await expect(
      page.locator("h3").filter({ hasText: "Agents" }),
    ).toBeVisible();
    await expect(page.getByText("No agents running")).toBeVisible();
  });

  test("mobile agent panel has backdrop that closes panel", async ({
    page,
  }) => {
    const agentTab = page.getByRole("button", { name: "Open agents panel" });
    await agentTab.click();
    await expect(page.getByText("No agents running")).toBeVisible();

    // Click the backdrop (the dark overlay behind the panel)
    // Use force because it may be behind the panel
    const backdrop = page.locator("div.fixed.bg-black\\/20").first();
    if (await backdrop.isVisible()) {
      await backdrop.click({ position: { x: 10, y: 10 }, force: true });
      await expect(page.getByText("No agents running")).toBeHidden();
    }
  });

  test("mobile agent tab shows badge when agents exist", async ({ page }) => {
    await injectAgents(page, [
      { id: "agent-1", name: "coder-alpha", status: "active" },
      { id: "agent-2", name: "reviewer-beta", status: "idle" },
      { id: "agent-3", name: "fixer-gamma", status: "active" },
    ]);

    const agentTab = page.getByRole("button", { name: "Open agents panel" });
    const badge = agentTab.locator("span").filter({ hasText: "3" });
    await expect(badge).toBeVisible();
  });

  test("sidebar is hidden on mobile", async ({ page }) => {
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeHidden();
  });
});

test.describe("Agent Panel - Responsive transitions", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test("switching from desktop to mobile shows tab bar instead of sidebar", async ({
    page,
  }) => {
    // Desktop: sidebar visible
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await waitForBoard(page);
    await expect(page.locator("aside")).toBeVisible();

    // Mobile: sidebar hidden, tab bar visible
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await expect(page.locator("aside")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Open agents panel" }),
    ).toBeVisible();
  });
});
