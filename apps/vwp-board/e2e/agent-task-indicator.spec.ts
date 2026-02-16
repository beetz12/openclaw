import { test, expect, type Page } from "@playwright/test";

// Mock board API response - can include tasks
function mockBoardResponse(
  tasks: Array<{ id: string; text: string; column: string; status?: string }>,
) {
  const columns: Record<string, Array<{ id: string; text: string; status: string; subtaskCount: number }>> = {
    backlog: [],
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  };

  for (const t of tasks) {
    if (columns[t.column]) {
      columns[t.column].push({
        id: t.id,
        text: t.text,
        status: t.status ?? "running",
        subtaskCount: 0,
      });
    }
  }

  return { columns, updatedAt: Date.now() };
}

// Setup: skip onboarding and mock API
async function setup(
  page: Page,
  tasks: Array<{ id: string; text: string; column: string; status?: string }> = [],
) {
  const response = mockBoardResponse(tasks);

  await page.route("**/vwp/dispatch/board", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    }),
  );

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

// Helper to inject agents into the store
async function injectAgents(
  page: Page,
  agents: Array<{
    id: string;
    name: string;
    status: "active" | "idle" | "error";
    taskId?: string | null;
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
          subtaskId: null,
          lastAction: null,
          lastSeen: Date.now(),
          error: null,
        })),
      });
    }
  }, agents);
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

// Wait for the board to be fully loaded
async function waitForBoard(page: Page) {
  await page.waitForSelector("text=Backlog", { timeout: 15_000 });
}

test.describe("TaskCard agent indicator", () => {
  test("task card shows agent count when agents are active on it", async ({
    page,
  }) => {
    await setup(page, [
      {
        id: "task-001",
        text: "Build authentication system",
        column: "in_progress",
      },
    ]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await waitForBoard(page);

    await injectAgents(page, [
      {
        id: "agent-1",
        name: "coder-alpha",
        status: "active",
        taskId: "task-001",
      },
      {
        id: "agent-2",
        name: "reviewer-beta",
        status: "active",
        taskId: "task-001",
      },
    ]);

    await expect(
      page.getByText("Build authentication system"),
    ).toBeVisible();
    await expect(page.getByText("2 agents")).toBeVisible();
  });

  test("task card shows singular 'agent' for one active agent", async ({
    page,
  }) => {
    await setup(page, [
      { id: "task-002", text: "Fix login bug", column: "in_progress" },
    ]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await waitForBoard(page);

    await injectAgents(page, [
      {
        id: "agent-1",
        name: "coder-alpha",
        status: "active",
        taskId: "task-002",
      },
    ]);

    await expect(page.getByText("Fix login bug")).toBeVisible();
    await expect(page.getByText("1 agent")).toBeVisible();
  });

  test("task card does not show agent indicator when no agents assigned", async ({
    page,
  }) => {
    await setup(page, [
      { id: "task-003", text: "Write documentation", column: "todo" },
    ]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await waitForBoard(page);

    // Agent is assigned to a different task
    await injectAgents(page, [
      {
        id: "agent-1",
        name: "coder-alpha",
        status: "active",
        taskId: "task-999",
      },
    ]);

    await expect(page.getByText("Write documentation")).toBeVisible();
    // No agent indicator should be visible on this task card
    // The "1 agent" text should not exist on the page
    await expect(page.getByText(/\d+ agents?/).first()).toBeHidden();
  });

  test("clicking agent indicator on task card opens agent panel", async ({
    page,
  }) => {
    await setup(page, [
      { id: "task-004", text: "Deploy to staging", column: "review" },
    ]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await waitForBoard(page);

    await injectAgents(page, [
      {
        id: "agent-1",
        name: "deploy-agent",
        status: "active",
        taskId: "task-004",
      },
    ]);

    await expect(page.getByText("Deploy to staging")).toBeVisible();

    // Click the agent indicator
    const agentIndicator = page.getByText("1 agent");
    await agentIndicator.click();

    // Agent panel should open
    await expect(
      page.locator("h3").filter({ hasText: "Agents" }),
    ).toBeVisible();
    await expect(page.getByText("deploy-agent")).toBeVisible();
  });

  test("idle agents are not shown in task card indicator", async ({
    page,
  }) => {
    await setup(page, [
      { id: "task-005", text: "Refactor API", column: "in_progress" },
    ]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await waitForBoard(page);

    // Only idle agents assigned to this task
    await injectAgents(page, [
      {
        id: "agent-1",
        name: "coder-alpha",
        status: "idle",
        taskId: "task-005",
      },
    ]);

    await expect(page.getByText("Refactor API")).toBeVisible();
    // Idle agents should not show the indicator (TaskCard filters for active only)
    await expect(page.getByText(/\d+ agents?/).first()).toBeHidden();
  });

  test("multiple tasks show correct agent counts independently", async ({
    page,
  }) => {
    await setup(page, [
      { id: "task-006", text: "Frontend redesign", column: "in_progress" },
      { id: "task-007", text: "Database migration", column: "in_progress" },
    ]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await waitForBoard(page);

    await injectAgents(page, [
      {
        id: "agent-1",
        name: "ui-agent",
        status: "active",
        taskId: "task-006",
      },
      {
        id: "agent-2",
        name: "db-agent-1",
        status: "active",
        taskId: "task-007",
      },
      {
        id: "agent-3",
        name: "db-agent-2",
        status: "active",
        taskId: "task-007",
      },
    ]);

    await expect(page.getByText("Frontend redesign")).toBeVisible();
    await expect(page.getByText("Database migration")).toBeVisible();

    // First task: 1 agent, Second task: 2 agents
    await expect(page.getByText("1 agent")).toBeVisible();
    await expect(page.getByText("2 agents")).toBeVisible();
  });
});

test.describe("Board store SSE agent event handling", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/board");
    await waitForBoard(page);
    await waitForStore(page);
  });

  test("agent_connected event adds agent to store", async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>)
        .__boardStore as {
        getState: () => {
          handleSSEEvent: (e: unknown) => void;
          agents: unknown[];
        };
      } | undefined;
      if (!store) {return;}
      const state = store.getState();
      state.handleSSEEvent({
        type: "agent_connected",
        agent: {
          id: "sse-agent-1",
          name: "sse-coder",
          status: "active",
          taskId: null,
          subtaskId: null,
          lastAction: null,
          lastSeen: Date.now(),
          error: null,
        },
      });
    });

    await openAgentPanel(page);
    await expect(page.getByText("sse-coder")).toBeVisible();
  });

  test("agent_disconnected event removes agent from store", async ({
    page,
  }) => {
    // First add an agent
    await injectAgents(page, [
      {
        id: "agent-to-remove",
        name: "temp-agent",
        status: "active",
      },
    ]);

    await openAgentPanel(page);
    await expect(page.getByText("temp-agent")).toBeVisible();

    // Simulate disconnect
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>)
        .__boardStore as {
        getState: () => { handleSSEEvent: (e: unknown) => void };
      } | undefined;
      if (!store) {return;}
      store.getState().handleSSEEvent({
        type: "agent_disconnected",
        agentId: "agent-to-remove",
      });
    });

    await expect(page.getByText("temp-agent")).toBeHidden();
    await expect(page.getByText("No agents running")).toBeVisible();
  });

  test("agent_status_changed event updates agent status", async ({
    page,
  }) => {
    await injectAgents(page, [
      {
        id: "status-agent",
        name: "changing-agent",
        status: "active",
      },
    ]);

    await openAgentPanel(page);
    await expect(page.getByText("changing-agent")).toBeVisible();

    // Change status to error
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>)
        .__boardStore as {
        getState: () => { handleSSEEvent: (e: unknown) => void };
      } | undefined;
      if (!store) {return;}
      store.getState().handleSSEEvent({
        type: "agent_status_changed",
        agent: {
          id: "status-agent",
          name: "changing-agent",
          status: "error",
          taskId: null,
          subtaskId: null,
          lastAction: null,
          lastSeen: Date.now(),
          error: "Process crashed",
        },
      });
    });

    await expect(page.getByText("Error")).toBeVisible();
    await expect(page.getByText("Process crashed")).toBeVisible();
  });

  test("gateway_status event updates connection indicator", async ({
    page,
  }) => {
    await openAgentPanel(page);

    // Default: disconnected
    await expect(page.locator('[title="Gateway offline"]')).toBeVisible();

    // Simulate gateway connected
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, unknown>)
        .__boardStore as {
        getState: () => { handleSSEEvent: (e: unknown) => void };
      } | undefined;
      if (!store) {return;}
      store.getState().handleSSEEvent({
        type: "gateway_status",
        connected: true,
      });
    });

    await expect(page.locator('[title="Gateway connected"]')).toBeVisible();
  });
});
